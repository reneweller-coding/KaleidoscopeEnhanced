/**
 * @file TrackMedia.cpp
 * @brief Implementation of TrackMedia: the chained lyrics fetch/parse/render pipeline and the multi-source artist-image download pipeline described in TrackMedia.h.
 */
#include "TrackMedia.h"

#include <QtCore/QCryptographicHash>
#include <QtCore/QDateTime>
#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QJsonArray>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonObject>
#include <QtCore/QRegularExpression>
#include <QtCore/QUrl>
#include <QtCore/QUrlQuery>
#include <QtGui/QFontMetrics>
#include <QtGui/QPainter>
#include <QtNetwork/QNetworkAccessManager>
#include <QtNetwork/QNetworkReply>
#include <QtNetwork/QNetworkRequest>

#include <algorithm>
#include <cmath>

// Lyrics-Textur: Breite fix, Zeilenhöhe fix - die Höhe wächst mit der
// Zeilenzahl (gekappt, ~190 Zeilen reichen für jeden Songtext).
static const int kLyrTexW   = 1000;   ///< Fixed lyrics-texture width in pixels.
static const int kLyrLineH  = 60;     ///< Fixed per-line height in pixels (also used as the top margin).
static const int kLyrMaxH   = 12000;  ///< Hard cap on the lyrics-texture height (~190 lines), so pathologically long lyrics can't blow up GPU memory.

// Negativ-Cache ("nichts gefunden") verfällt nach 7 Tagen - vielleicht
// trägt ja jemand die Lyrics nach.
static const qint64 kNegCacheTtlSec = 7 * 24 * 3600;   ///< TTL for a "lyrics not found" cache entry before the chain is retried against the network.

/** @brief Hex-encodes the MD5 hash of a string (used to build cache file/dir names from arbitrary artist/title text). @param s Input string (UTF-8 encoded before hashing). @return Lowercase hex MD5 digest. */
static QString md5Hex( const QString &s )
{
	return QString::fromLatin1( QCryptographicHash::hash(
		s.toUtf8(), QCryptographicHash::Md5 ).toHex() );
}

/** @brief Constructs the network manager and ensures the lyrics/artist cache directories exist. */
TrackMedia::TrackMedia()
{
	m_nam = new QNetworkAccessManager();
	QDir().mkpath( "..\\cache\\lyrics" );
	QDir().mkpath( "..\\cache\\artist" );
}

/** @brief Destroys the owned network manager (any in-flight QNetworkReply objects are children of it and are cleaned up via deleteLater() in their own finished() handlers). */
TrackMedia::~TrackMedia()
{
	delete m_nam;
}

/**
 * @brief Issues a GET request with the project's identifying User-Agent and a 15s transfer timeout.
 * @param url Request URL.
 * @return The in-flight QNetworkReply (caller connects to its finished() signal and must deleteLater() it).
 */
QNetworkReply *TrackMedia::get( const QString &url )
{
	QNetworkRequest req( (QUrl( url )) );
	// LRCLIB bittet um einen identifizierenden User-Agent; die anderen
	// Dienste stören sich nicht daran.
	req.setHeader( QNetworkRequest::UserAgentHeader,
	               "KaleidoscopeVisualizer/1.0 (github.com/reneweller-coding)" );
	req.setTransferTimeout( 15000 );
	return m_nam->get( req );
}

/** @brief Path to this track's lyrics cache JSON, keyed by the MD5 of m_key. @return Cache file path under "..\\cache\\lyrics\\". */
QString TrackMedia::lyricsCachePath() const
{
	return "..\\cache\\lyrics\\" + md5Hex( m_key ) + ".json";
}

/** @brief Path to this artist's image cache directory, keyed by the MD5 of the lower-cased artist name. @return Cache directory path under "..\\cache\\artist\\". */
QString TrackMedia::artistCacheDir() const
{
	return "..\\cache\\artist\\" + md5Hex( m_artist.toLower() );
}

/**
 * @brief Requests lyrics + artist images for a (possibly new) track; call on every track change.
 * @param artist Artist name (trimmed/lower-cased internally for de-duplication and cache keys).
 * @param title Track title; an empty (trimmed) title is ignored outright.
 */
void TrackMedia::requestTrack( const QString &artist, const QString &title )
{
	QString key = artist.trimmed().toLower() + "|" + title.trimmed().toLower();
	if( key == m_key || title.trimmed().isEmpty() )
		return;
	m_key    = key;
	m_artist = artist.trimmed();
	m_title  = title.trimmed();

	// Alte Ergebnisse verwerfen (Revision zählt hoch -> Consumer lädt neu).
	m_lines.clear();
	m_lyricsImage = QImage();
	m_lyricsRevision++;
	m_imagePaths.clear();
	m_imagesRevision++;
	m_downloadQueue.clear();
	m_seenUrls.clear();
	m_activeDownloads = 0;
	m_nextImageNr = 0;
	m_decodedIdx  = -1;
	m_decoded     = QImage();
	m_lyricsPending = true;

	lyricsFromCacheOrNet();
	if( !m_artist.isEmpty() )
		imagesFromCacheOrNet();
}

// ===========================================================================
// Lyrics: Cache -> LRCLIB (get) -> LRCLIB (search) -> NetEase -> lyrics.ovh
// ===========================================================================

/** @brief Entry point of the lyrics chain: checks the on-disk cache (positive or still-valid negative) before falling through to the network chain (tryLrclibGet()). */
void TrackMedia::lyricsFromCacheOrNet()
{
	QFile f( lyricsCachePath() );
	if( f.open( QIODevice::ReadOnly ) )
	{
		QJsonObject o = QJsonDocument::fromJson( f.readAll() ).object();
		bool found = o.value( "found" ).toBool();
		qint64 age = QDateTime::currentSecsSinceEpoch()
		           - qint64(o.value( "ts" ).toDouble());
		if( found )
		{
			lyricsFound( o.value( "synced" ).toString(),
			             o.value( "plain" ).toString(), "Cache" );
			return;
		}
		if( age < kNegCacheTtlSec )
		{
			// Bekannt erfolglos, TTL läuft noch: Netz gar nicht erst fragen.
			m_lyricsPending = false;
			fprintf( stderr, "[Lyrics] Cache: bekannt-ohne-Treffer (\"%s - %s\")\n",
			         m_artist.toLocal8Bit().constData(),
			         m_title.toLocal8Bit().constData() );
			return;
		}
	}
	tryLrclibGet();
}

/**
 * @brief Writes (or overwrites) the lyrics cache JSON for the current track.
 * @param synced Synced lyrics text to persist (may be empty).
 * @param plain Plain lyrics text to persist (may be empty).
 * @param found Whether any lyrics were actually found; false writes a timestamped negative-cache entry (see kNegCacheTtlSec).
 */
void TrackMedia::writeLyricsCache( const QString &synced, const QString &plain, bool found )
{
	QJsonObject o;
	o[ "found" ]  = found;
	o[ "synced" ] = synced;
	o[ "plain" ]  = plain;
	o[ "ts" ]     = double(QDateTime::currentSecsSinceEpoch());
	QFile f( lyricsCachePath() );
	if( f.open( QIODevice::WriteOnly ) )
		f.write( QJsonDocument( o ).toJson( QJsonDocument::Compact ) );
}

/**
 * @brief Common success path once any source (cache or network) returns lyric text: parses it, renders the texture, and updates the cache.
 * @param synced Synced (LRC-format) lyrics text, or empty if none.
 * @param plain Plain-text lyrics, used only if synced is empty.
 * @param quelle Human-readable source name for logging (e.g. "LRCLIB", "Cache"); the literal "Cache" suppresses re-writing the cache file.
 */
void TrackMedia::lyricsFound( const QString &synced, const QString &plain, const char *quelle )
{
	m_lyricsPending = false;
	if( !synced.isEmpty() )
		parseSynced( synced );
	else if( !plain.isEmpty() )
		parsePlain( plain );

	if( m_lines.empty() )
	{
		lyricsGiveUp();
		return;
	}
	renderLyricsImage();
	m_lyricsRevision++;
	if( QString::fromLatin1(quelle) != "Cache" )
		writeLyricsCache( synced, plain, true );
	fprintf( stderr, "[Lyrics] %d Zeilen (%s, Quelle %s) fuer \"%s - %s\"\n",
	         int(m_lines.size()), syncedLyrics() ? "synchron" : "plain", quelle,
	         m_artist.toLocal8Bit().constData(), m_title.toLocal8Bit().constData() );
}

/** @brief Common failure path once every lyrics source has been exhausted: clears the pending flag and writes a negative cache entry so the chain is skipped next time (until the TTL expires). */
void TrackMedia::lyricsGiveUp()
{
	m_lyricsPending = false;
	writeLyricsCache( QString(), QString(), false );
	fprintf( stderr, "[Lyrics] nichts gefunden fuer \"%s - %s\" (alle Quellen)\n",
	         m_artist.toLocal8Bit().constData(), m_title.toLocal8Bit().constData() );
}

/** @brief First network attempt: LRCLIB's exact get-by-artist/title endpoint; falls through to tryLrclibSearch() on a miss or error. */
void TrackMedia::tryLrclibGet()
{
	QUrlQuery q;
	q.addQueryItem( "artist_name", m_artist );
	q.addQueryItem( "track_name",  m_title );
	QString url = "https://lrclib.net/api/get?" + q.toString( QUrl::FullyEncoded );

	const QString key = m_key;
	QNetworkReply *r = get( url );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r, key]()
	{
		r->deleteLater();
		if( key != m_key ) return;   // superseded by a newer requestTrack(): ignore this callback
		if( r->error() == QNetworkReply::NoError )
		{
			QJsonObject o = QJsonDocument::fromJson( r->readAll() ).object();
			QString synced = o.value( "syncedLyrics" ).toString();
			QString plain  = o.value( "plainLyrics" ).toString();
			if( !synced.isEmpty() || !plain.isEmpty() )
			{
				lyricsFound( synced, plain, "LRCLIB" );
				return;
			}
		}
		tryLrclibSearch();
	} );
}

/** @brief Second network attempt: LRCLIB's fuzzy search endpoint, preferring a result with synced lyrics over the first one with any plain lyrics; falls through to tryNetease() on a miss. */
void TrackMedia::tryLrclibSearch()
{
	QUrlQuery q;
	q.addQueryItem( "q", m_artist + " " + m_title );
	QString url = "https://lrclib.net/api/search?" + q.toString( QUrl::FullyEncoded );

	const QString key = m_key;
	QNetworkReply *r = get( url );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r, key]()
	{
		r->deleteLater();
		if( key != m_key ) return;
		if( r->error() == QNetworkReply::NoError )
		{
			QJsonArray arr = QJsonDocument::fromJson( r->readAll() ).array();
			QJsonObject best;
			for( const auto &v : arr )
			{
				QJsonObject o = v.toObject();
				if( !o.value( "syncedLyrics" ).toString().isEmpty() ) { best = o; break; }
				if( best.isEmpty() && !o.value( "plainLyrics" ).toString().isEmpty() )
					best = o;
			}
			if( !best.isEmpty() )
			{
				lyricsFound( best.value( "syncedLyrics" ).toString(),
				             best.value( "plainLyrics" ).toString(), "LRCLIB-Suche" );
				return;
			}
		}
		tryNetease();
	} );
}

// NetEase Cloud Music: riesige, community-gepflegte LRC-Datenbank - findet
// erstaunlich viel Nischen-Material.  Zwei Schritte: Song-Suche -> Lyric-API.
/** @brief Third network attempt: NetEase Cloud Music song search (title-matched to avoid cover versions) followed by its lyric endpoint; falls through to tryLyricsOvh() on a miss. */
void TrackMedia::tryNetease()
{
	QUrlQuery q;
	q.addQueryItem( "s", m_artist + " " + m_title );
	q.addQueryItem( "type", "1" );
	q.addQueryItem( "limit", "5" );
	QString url = "https://music.163.com/api/search/get?" + q.toString( QUrl::FullyEncoded );

	const QString key = m_key;
	QNetworkReply *r = get( url );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r, key]()
	{
		r->deleteLater();
		if( key != m_key ) return;
		qint64 songId = 0;
		if( r->error() == QNetworkReply::NoError )
		{
			QJsonArray songs = QJsonDocument::fromJson( r->readAll() )
			    .object().value( "result" ).toObject().value( "songs" ).toArray();
			// Titel muss grob passen, sonst landet man bei Cover-Versionen
			// von voellig anderen Stuecken.
			for( const auto &v : songs )
			{
				QJsonObject s = v.toObject();
				QString name = s.value( "name" ).toString();
				if( name.contains( m_title, Qt::CaseInsensitive )
				    || m_title.contains( name, Qt::CaseInsensitive ) )
				{
					songId = qint64(s.value( "id" ).toDouble());
					break;
				}
			}
		}
		if( songId == 0 )
		{
			tryLyricsOvh();
			return;
		}
		QString lurl = QString( "https://music.163.com/api/song/lyric?id=%1&lv=1&kv=1&tv=-1" )
		               .arg( songId );
		QNetworkReply *r2 = get( lurl );
		QObject::connect( r2, &QNetworkReply::finished, r2, [this, r2, key]()
		{
			r2->deleteLater();
			if( key != m_key ) return;
			if( r2->error() == QNetworkReply::NoError )
			{
				QString lrc = QJsonDocument::fromJson( r2->readAll() )
				    .object().value( "lrc" ).toObject().value( "lyric" ).toString();
				if( !lrc.trimmed().isEmpty() )
				{
					// LRC mit Zeitstempeln? Sonst als Plain behandeln.
					bool hatSync = lrc.contains( QRegularExpression( "\\[\\d+:\\d{2}" ) );
					lyricsFound( hatSync ? lrc : QString(),
					             hatSync ? QString() : lrc, "NetEase" );
					return;
				}
			}
			tryLyricsOvh();
		} );
	} );
}

/** @brief Last-resort network attempt: lyrics.ovh plain-text lookup; calls lyricsGiveUp() if this also fails. */
void TrackMedia::tryLyricsOvh()
{
	QString url = "https://api.lyrics.ovh/v1/"
	            + QString::fromLatin1( QUrl::toPercentEncoding( m_artist ) ) + "/"
	            + QString::fromLatin1( QUrl::toPercentEncoding( m_title ) );

	const QString key = m_key;
	QNetworkReply *r = get( url );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r, key]()
	{
		r->deleteLater();
		if( key != m_key ) return;
		if( r->error() == QNetworkReply::NoError )
		{
			QString plain = QJsonDocument::fromJson( r->readAll() )
			                    .object().value( "lyrics" ).toString();
			if( !plain.trimmed().isEmpty() )
			{
				lyricsFound( QString(), plain, "lyrics.ovh" );
				return;
			}
		}
		lyricsGiveUp();
	} );
}

// LRC: "[mm:ss.xx]text" - mehrere Zeitstempel pro Zeile sind erlaubt.
/**
 * @brief Parses LRC-format synced lyrics ("[mm:ss.xx]text", possibly multiple timestamps per line) into time-sorted LyricLine entries.
 * @param lrc Raw LRC lyric text (one entry per '\n'-separated line).
 */
void TrackMedia::parseSynced( const QString &lrc )
{
	static const QRegularExpression reTime(
		"\\[(\\d+):(\\d{2})(?:[.:](\\d{1,3}))?\\]" );

	for( const QString &raw : lrc.split( '\n' ) )
	{
		QString line = raw.trimmed();
		if( line.isEmpty() )
			continue;
		std::vector<double> times;
		int last = 0;
		auto it = reTime.globalMatch( line );
		while( it.hasNext() )
		{
			auto m = it.next();
			if( m.capturedStart() != last )   // Zeitstempel nur am Zeilenanfang
				break;
			double frac = 0.0;
			QString f = m.captured( 3 );
			if( !f.isEmpty() )
				frac = f.toDouble() / std::pow( 10.0, f.size() );
			times.push_back( m.captured( 1 ).toInt() * 60.0
			               + m.captured( 2 ).toInt() + frac );
			last = int(m.capturedEnd());
		}
		QString text = line.mid( last ).trimmed();
		if( times.empty() )
			continue;
		// An empty text after a timestamp is the standard LRC convention for
		// marking an instrumental break (solo, intro, outro) -- kept as a
		// GAP MARKER (t0 only, text stays empty) rather than dropped: without
		// it, the line before swallows the whole gap (its t1 is set to the
		// NEXT entry's t0 below), collapsing any mid-song silence to zero and
		// leaving the long-pause fade-out in glwidget.cpp with nothing to
		// detect except intro/outro.
		for( double t : times )
		{
			LyricLine l;
			l.t0   = t;
			l.text = text;
			m_lines.push_back( l );
		}
	}

	std::sort( m_lines.begin(), m_lines.end(),
	           []( const LyricLine &a, const LyricLine &b ){ return a.t0 < b.t0; } );
	for( size_t i = 0; i < m_lines.size(); ++i )
		m_lines[i].t1 = ( i + 1 < m_lines.size() ) ? m_lines[i + 1].t0
		                                           : m_lines[i].t0 + 6.0;
}

/**
 * @brief Parses plain (unsynchronised) lyric text into LyricLine entries, one per non-empty source line.
 * @param plain Raw plain-text lyrics.
 */
void TrackMedia::parsePlain( const QString &plain )
{
	for( const QString &raw : plain.split( '\n' ) )
	{
		QString text = raw.trimmed();
		if( text.isEmpty() )
			continue;                       // Leerzeilen sparen Texturhöhe
		LyricLine l;
		l.text = text;
		m_lines.push_back( l );
	}
}

// Alle Zeilen untereinander in EINE hohe transparente Textur rendern
// (Stil wie der Titel-Reveal: weiß mit dunklem Halo, lesbar über allem).
/**
 * @brief Renders every parsed lyric line into one tall transparent QImage (white text with a dark halo), truncating if the real-line budget would exceed kLyrMaxH, and fills in each line's v0/v1 texture-V band.
 *
 * Gap markers (empty text) never get a row of their own -- the texture
 * height budgets by the count of REAL (non-empty) lines, and a gap
 * marker's v0/v1 are set to whatever the previous sung line's band was,
 * so it visually "sticks" to that line until glwidget.cpp's long-pause
 * fade-out takes over.
 */
void TrackMedia::renderLyricsImage()
{
	// Gap markers (empty text, see parseSynced) carry timing only -- they
	// never get a row of their own, so the texture height budgets by REAL
	// line count, not m_lines.size().
	int nReal = 0;
	for( const LyricLine &l : m_lines )
		if( !l.text.isEmpty() ) ++nReal;

	int h = nReal * kLyrLineH + kLyrLineH;
	if( h > kLyrMaxH )
	{
		// Truncate once the REAL-line budget is exhausted; any gap markers
		// before the cutoff are kept (free -- they cost no row).
		const int keepReal = ( kLyrMaxH - kLyrLineH ) / kLyrLineH;
		int seen = 0;
		size_t cut = m_lines.size();
		for( size_t k = 0; k < m_lines.size(); ++k )
			if( !m_lines[k].text.isEmpty() && ++seen > keepReal )
			{
				cut = k;
				break;
			}
		m_lines.resize( cut );
		nReal = std::min( nReal, keepReal );
		h = nReal * kLyrLineH + kLyrLineH;
	}

	QImage img( kLyrTexW, h, QImage::Format_ARGB32 );
	img.fill( Qt::transparent );
	QPainter p( &img );
	p.setRenderHint( QPainter::Antialiasing );
	p.setRenderHint( QPainter::TextAntialiasing );

	QFont f( "Segoe UI", 26, QFont::Bold );
	p.setFont( f );
	QFontMetrics fm( f );

	int row = 0;
	float lastV0 = 0.f, lastV1 = 0.f;
	for( size_t i = 0; i < m_lines.size(); ++i )
	{
		if( m_lines[i].text.isEmpty() )
		{
			// Instrumental marker: no row of its own -- visually "sticks" to
			// the last sung line (scroll/highlight stay put there) until the
			// long-pause fade-out in glwidget.cpp takes over.
			m_lines[i].v0 = lastV0;
			m_lines[i].v1 = lastV1;
			continue;
		}
		const int yTop = row * kLyrLineH + kLyrLineH / 2;
		QRect r( 30, yTop, kLyrTexW - 60, kLyrLineH );
		QString t = fm.elidedText( m_lines[i].text, Qt::ElideRight, r.width() );

		p.setPen( QColor( 0, 0, 0, 165 ) );
		for( int dy = -2; dy <= 2; ++dy )
			for( int dx = -2; dx <= 2; ++dx )
				if( dx || dy )
					p.drawText( r.translated( dx, dy ),
					            Qt::AlignHCenter | Qt::AlignVCenter, t );
		p.setPen( QColor( 255, 255, 255, 235 ) );
		p.drawText( r, Qt::AlignHCenter | Qt::AlignVCenter, t );

		m_lines[i].v0 = float(yTop)             / float(h);
		m_lines[i].v1 = float(yTop + kLyrLineH) / float(h);
		lastV0 = m_lines[i].v0;
		lastV1 = m_lines[i].v1;
		++row;
	}
	p.end();
	m_lyricsImage = img;
}

// ===========================================================================
// Künstlerbilder: Cache -> Deezer + TheAudioDB + iTunes (bis 50, gedrosselt)
// ===========================================================================

/**
 * @brief Returns one artist image, decoding it from disk on demand.
 * @param i Index into the available images, [0, imageCount()).
 * @return The decoded, size-capped (max width 640) RGBA8888 image, or a null QImage if i is out of range or the file failed to decode/load.
 */
QImage TrackMedia::imageAt( int i ) const
{
	if( i < 0 || i >= int(m_imagePaths.size()) )
		return QImage();
	if( i == m_decodedIdx && !m_decoded.isNull() )
		return m_decoded;
	QImage img( m_imagePaths[i] );
	if( img.isNull() )
		return QImage();
	if( img.width() > 640 )
		img = img.scaledToWidth( 640, Qt::SmoothTransformation );
	m_decoded    = img.convertToFormat( QImage::Format_RGBA8888 );
	m_decodedIdx = i;
	return m_decoded;
}

/** @brief Entry point of the artist-image chain: loads any already-cached images from disk, then (unless already >= 8 cached) kicks off all three network sources in parallel. */
void TrackMedia::imagesFromCacheOrNet()
{
	QDir dir( artistCacheDir() );
	QStringList vorhandene = dir.entryList( { "*.jpg", "*.png" },
	                                        QDir::Files, QDir::Name );
	for( const QString &f : vorhandene )
		m_imagePaths << dir.filePath( f );
	m_nextImageNr = int(m_imagePaths.size());
	if( !m_imagePaths.isEmpty() )
	{
		m_imagesRevision++;
		fprintf( stderr, "[Artist] Cache: %d Bild(er) fuer \"%s\"\n",
		         int(m_imagePaths.size()), m_artist.toLocal8Bit().constData() );
	}
	// Genug im Cache? Dann kein Netz.  Sonst (auch bei wenigen Treffern
	// eines früheren Laufs) alle Quellen anwerfen - Dedupe läuft über URLs,
	// doppelte DATEIEN entstehen dabei nicht, weil die URL-Liste pro Lauf
	// frisch ist und der Cache-Bestand mitzählt (kMaxImages-Deckel).
	if( m_imagePaths.size() >= 8 )
		return;
	fetchDeezer();
	fetchAudioDb();
	fetchITunes();
}

/**
 * @brief Adds an image URL to the download queue unless it is empty, already seen, or the combined cached+queued count has reached kMaxImages.
 * @param url Image URL to enqueue.
 */
void TrackMedia::enqueueImageUrl( const QString &url )
{
	if( url.isEmpty() || m_seenUrls.contains( url ) )
		return;
	if( int(m_imagePaths.size()) + m_downloadQueue.size() >= kMaxImages )
		return;
	m_seenUrls << url;
	m_downloadQueue << url;
	startNextDownloads();
}

/** @brief Starts additional downloads from m_downloadQueue until kParallelDownloads are in flight; each completion decodes/validates (min width 200px), writes the JPEG to the artist cache dir, and recurses to keep the pipeline full. */
void TrackMedia::startNextDownloads()
{
	const QString key = m_key;
	while( m_activeDownloads < kParallelDownloads && !m_downloadQueue.isEmpty() )
	{
		QString url = m_downloadQueue.takeFirst();
		m_activeDownloads++;
		QNetworkReply *r = get( url );
		QObject::connect( r, &QNetworkReply::finished, r, [this, r, key]()
		{
			r->deleteLater();
			if( key != m_key )
				return;
			m_activeDownloads--;
			if( r->error() == QNetworkReply::NoError )
			{
				QByteArray daten = r->readAll();
				QImage probe;
				if( probe.loadFromData( daten ) && probe.width() >= 200 )
				{
					QDir().mkpath( artistCacheDir() );
					QString pfad = artistCacheDir()
					             + QString( "\\%1.jpg" ).arg( m_nextImageNr++, 3, 10, QChar('0') );
					QFile f( pfad );
					if( f.open( QIODevice::WriteOnly ) )
					{
						f.write( daten );
						f.close();
						m_imagePaths << pfad;
						m_imagesRevision++;
						if( m_imagePaths.size() <= 4
						    || m_imagePaths.size() % 10 == 0 )
							fprintf( stderr, "[Artist] %d Bild(er) geladen\n",
							         int(m_imagePaths.size()) );
					}
				}
			}
			startNextDownloads();   // keep the pipeline full: fills the slot just freed above
		} );
	}
}

/** @brief Queries Deezer for the best-matching artist (preferring one with a real, non-placeholder photo and the most fans) and enqueues its XL photo plus up to 25 album covers. */
void TrackMedia::fetchDeezer()
{
	QUrlQuery q;
	q.addQueryItem( "q", m_artist );
	q.addQueryItem( "limit", "5" );
	QString url = "https://api.deezer.com/search/artist?" + q.toString( QUrl::FullyEncoded );

	const QString key = m_key;
	QNetworkReply *r = get( url );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r, key]()
	{
		r->deleteLater();
		if( key != m_key || r->error() != QNetworkReply::NoError )
			return;
		QJsonArray data = QJsonDocument::fromJson( r->readAll() )
		                      .object().value( "data" ).toArray();
		if( data.isEmpty() )
			return;
		// Der ERSTE Suchtreffer ist oft ein Namensvetter ohne Foto
		// (Platzhalter tragen die MD5 des leeren Strings).  Also: unter den
		// Kandidaten den mit echtem Foto und den meisten Fans nehmen.
		static const char *kEmptyMd5 = "d41d8cd98f00b204e9800998ecf8427e";
		QJsonObject artist;
		double bestFans = -1.0;
		for( const auto &v : data )
		{
			QJsonObject o = v.toObject();
			bool echtesFoto = !o.value( "picture_xl" ).toString().contains( kEmptyMd5 );
			double fans = o.value( "nb_fan" ).toDouble()
			            + ( echtesFoto ? 1e7 : 0.0 );
			if( fans > bestFans ) { bestFans = fans; artist = o; }
		}
		QString pic = artist.value( "picture_xl" ).toString();
		qint64  id  = qint64(artist.value( "id" ).toDouble());
		if( !pic.contains( kEmptyMd5 ) )
			enqueueImageUrl( pic );
		if( id <= 0 )
			return;
		QString aurl = QString( "https://api.deezer.com/artist/%1/albums?limit=25" ).arg( id );
		QNetworkReply *ra = get( aurl );
		QObject::connect( ra, &QNetworkReply::finished, ra, [this, ra, key]()
		{
			ra->deleteLater();
			if( key != m_key || ra->error() != QNetworkReply::NoError )
				return;
			QJsonArray albums = QJsonDocument::fromJson( ra->readAll() )
			                        .object().value( "data" ).toArray();
			for( const auto &v : albums )
			{
				QString cover = v.toObject().value( "cover_xl" ).toString();
				if( !cover.contains( "d41d8cd98f00b204e9800998ecf8427e" ) )
					enqueueImageUrl( cover );
			}
		} );
	} );
}

// TheAudioDB: echte BAND-FOTOS (Thumb + bis zu 4 Fanart-Stills) über den
// öffentlichen Test-Key "2" - gerade für bekannte Nischen-Acts oft gepflegt.
/** @brief Queries TheAudioDB (public test key) for the first matching artist and enqueues its thumbnail plus up to 4 fanart images. */
void TrackMedia::fetchAudioDb()
{
	QUrlQuery q;
	q.addQueryItem( "s", m_artist );
	QString url = "https://www.theaudiodb.com/api/v1/json/2/search.php?"
	            + q.toString( QUrl::FullyEncoded );

	const QString key = m_key;
	QNetworkReply *r = get( url );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r, key]()
	{
		r->deleteLater();
		if( key != m_key || r->error() != QNetworkReply::NoError )
			return;
		QJsonArray arts = QJsonDocument::fromJson( r->readAll() )
		                      .object().value( "artists" ).toArray();
		if( arts.isEmpty() )
			return;
		QJsonObject a = arts.first().toObject();
		for( const char *feld : { "strArtistThumb", "strArtistFanart",
		                          "strArtistFanart2", "strArtistFanart3",
		                          "strArtistFanart4", "strArtistWideThumb",
		                          "strArtistClearart" } )
			enqueueImageUrl( a.value( QString::fromLatin1( feld ) ).toString() );
	} );
}

// iTunes Search: weitere Album-Cover; die 100px-Artwork-URL lässt sich per
// Namenskonvention auf 600px hochsetzen.
/** @brief Queries iTunes Search for albums by the artist (name-matched) and enqueues each cover art URL upscaled from 100px to 600px. */
void TrackMedia::fetchITunes()
{
	QUrlQuery q;
	q.addQueryItem( "term", m_artist );
	q.addQueryItem( "entity", "album" );
	q.addQueryItem( "limit", "30" );
	QString url = "https://itunes.apple.com/search?" + q.toString( QUrl::FullyEncoded );

	const QString key = m_key;
	QNetworkReply *r = get( url );
	QObject::connect( r, &QNetworkReply::finished, r, [this, r, key]()
	{
		r->deleteLater();
		if( key != m_key || r->error() != QNetworkReply::NoError )
			return;
		QJsonArray res = QJsonDocument::fromJson( r->readAll() )
		                     .object().value( "results" ).toArray();
		for( const auto &v : res )
		{
			QJsonObject o = v.toObject();
			// Nur Alben, deren Künstler wirklich passt (die Suche streut).
			if( !o.value( "artistName" ).toString()
			      .contains( m_artist, Qt::CaseInsensitive ) )
				continue;
			QString art = o.value( "artworkUrl100" ).toString();
			art.replace( "100x100", "600x600" );
			enqueueImageUrl( art );
		}
	} );
}
