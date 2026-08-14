#include "TrackMedia.h"

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

// Lyrics-Textur: Breite fix, Zeilenhöhe fix - die Höhe wächst mit der
// Zeilenzahl (gekappt, ~190 Zeilen reichen für jeden Songtext).
static const int kLyrTexW   = 1000;
static const int kLyrLineH  = 60;
static const int kLyrMaxH   = 12000;

TrackMedia::TrackMedia()
{
	m_nam = new QNetworkAccessManager();
}

TrackMedia::~TrackMedia()
{
	delete m_nam;
}

QNetworkReply *TrackMedia::get( const QString &url )
{
	QNetworkRequest req( (QUrl( url )) );
	// LRCLIB bittet um einen identifizierenden User-Agent.
	req.setHeader( QNetworkRequest::UserAgentHeader,
	               "KaleidoscopeVisualizer/1.0 (github.com/reneweller-coding)" );
	req.setTransferTimeout( 15000 );
	return m_nam->get( req );
}

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
	m_images.clear();
	m_imagesRevision++;
	m_pendingImageDownloads = 0;
	m_lyricsPending = true;

	fetchLyrics();
	if( !m_artist.isEmpty() )
		fetchArtist();
}

// ---- Lyrics (LRCLIB) ------------------------------------------------------

void TrackMedia::fetchLyrics()
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
		if( key != m_key )                 // inzwischen ein anderer Track
			return;
		if( r->error() == QNetworkReply::NoError )
		{
			parseLyricsReply( r->readAll() );
			return;
		}
		// Exakter Treffer fehlt: unscharfe Suche, bester Kandidat gewinnt.
		QUrlQuery q;
		q.addQueryItem( "q", m_artist + " " + m_title );
		QString url2 = "https://lrclib.net/api/search?" + q.toString( QUrl::FullyEncoded );
		QNetworkReply *r2 = get( url2 );
		QObject::connect( r2, &QNetworkReply::finished, r2, [this, r2, key]()
		{
			r2->deleteLater();
			if( key != m_key )
				return;
			m_lyricsPending = false;
			if( r2->error() != QNetworkReply::NoError )
				return;
			QJsonArray arr = QJsonDocument::fromJson( r2->readAll() ).array();
			// Kandidat mit synchronisierten Lyrics bevorzugen.
			QJsonObject best;
			for( const auto &v : arr )
			{
				QJsonObject o = v.toObject();
				if( !o.value( "syncedLyrics" ).toString().isEmpty() ) { best = o; break; }
				if( best.isEmpty() && !o.value( "plainLyrics" ).toString().isEmpty() )
					best = o;
			}
			if( !best.isEmpty() )
				parseLyricsReply( QJsonDocument( best ).toJson() );
		} );
	} );
}

void TrackMedia::parseLyricsReply( const QByteArray &json )
{
	m_lyricsPending = false;
	QJsonObject o = QJsonDocument::fromJson( json ).object();
	QString synced = o.value( "syncedLyrics" ).toString();
	QString plain  = o.value( "plainLyrics" ).toString();

	if( !synced.isEmpty() )
		parseSynced( synced );
	else if( !plain.isEmpty() )
		parsePlain( plain );

	if( !m_lines.empty() )
	{
		renderLyricsImage();
		m_lyricsRevision++;
		fprintf( stderr, "[Lyrics] %d Zeilen (%s) fuer \"%s - %s\"\n",
		         int(m_lines.size()), syncedLyrics() ? "synchron" : "plain",
		         m_artist.toLocal8Bit().constData(), m_title.toLocal8Bit().constData() );
	}
	else
		fprintf( stderr, "[Lyrics] nichts gefunden fuer \"%s - %s\"\n",
		         m_artist.toLocal8Bit().constData(), m_title.toLocal8Bit().constData() );
}

// LRC: "[mm:ss.xx]text" - mehrere Zeitstempel pro Zeile sind erlaubt.
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
		if( times.empty() || text.isEmpty() )
			continue;
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
// Die Zeilen-V-Bereiche wandern in die LyricLine-Einträge - der Shader
// braucht sie fürs Karaoke-Highlight und die Scroll-Zentrierung.
void TrackMedia::renderLyricsImage()
{
	int h = int(m_lines.size()) * kLyrLineH + kLyrLineH;
	if( h > kLyrMaxH )
	{
		m_lines.resize( size_t(( kLyrMaxH - kLyrLineH ) / kLyrLineH) );
		h = int(m_lines.size()) * kLyrLineH + kLyrLineH;
	}

	QImage img( kLyrTexW, h, QImage::Format_ARGB32 );
	img.fill( Qt::transparent );
	QPainter p( &img );
	p.setRenderHint( QPainter::Antialiasing );
	p.setRenderHint( QPainter::TextAntialiasing );

	QFont f( "Segoe UI", 26, QFont::Bold );
	p.setFont( f );
	QFontMetrics fm( f );

	for( size_t i = 0; i < m_lines.size(); ++i )
	{
		const int yTop = int(i) * kLyrLineH + kLyrLineH / 2;
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
	}
	p.end();
	m_lyricsImage = img;
}

// ---- Künstlerbilder (Deezer) ---------------------------------------------

void TrackMedia::fetchArtist()
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
		// Der ERSTE Suchtreffer ist oft ein Namensvetter-Karteileiche ohne
		// Foto (Platzhalter-Bilder tragen die MD5 des leeren Strings).  Also:
		// unter den Kandidaten den mit echtem Foto und den meisten Fans
		// nehmen - das ist praktisch immer der gesuchte Künstler.
		static const char *kEmptyMd5 = "d41d8cd98f00b204e9800998ecf8427e";
		QJsonObject artist;
		double bestFans = -1.0;
		for( const auto &v : data )
		{
			QJsonObject o = v.toObject();
			bool echtesFoto = !o.value( "picture_xl" ).toString().contains( kEmptyMd5 );
			double fans = o.value( "nb_fan" ).toDouble()
			            + ( echtesFoto ? 1e7 : 0.0 );   // Foto schlägt Fanzahl
			if( fans > bestFans )
			{
				bestFans = fans;
				artist   = o;
			}
		}
		QString pic = artist.value( "picture_xl" ).toString();
		qint64  id  = qint64(artist.value( "id" ).toDouble());
		if( pic.contains( kEmptyMd5 ) )
			pic.clear();
		if( !pic.isEmpty() )
		{
			m_pendingImageDownloads++;
			QNetworkReply *ri = get( pic );
			QObject::connect( ri, &QNetworkReply::finished, ri,
			                  [this, ri, key](){ if( key == m_key ) addImageFromReply( ri ); } );
		}
		if( id <= 0 )
			return;
		// Ein paar Album-Cover dazu - "verschiedene Bilder des Künstlers".
		QString aurl = QString( "https://api.deezer.com/artist/%1/albums?limit=6" ).arg( id );
		QNetworkReply *ra = get( aurl );
		QObject::connect( ra, &QNetworkReply::finished, ra, [this, ra, key]()
		{
			ra->deleteLater();
			if( key != m_key || ra->error() != QNetworkReply::NoError )
				return;
			QJsonArray albums = QJsonDocument::fromJson( ra->readAll() )
			                        .object().value( "data" ).toArray();
			int n = 0;
			QStringList seen;
			for( const auto &v : albums )
			{
				QString cover = v.toObject().value( "cover_xl" ).toString();
				if( cover.isEmpty() || seen.contains( cover )
				    || cover.contains( "d41d8cd98f00b204e9800998ecf8427e" ) )
					continue;               // Platzhalter-Cover (leere MD5)
				seen << cover;
				m_pendingImageDownloads++;
				QNetworkReply *ri = get( cover );
				QObject::connect( ri, &QNetworkReply::finished, ri,
				                  [this, ri, key](){ if( key == m_key ) addImageFromReply( ri ); } );
				if( ++n >= 3 )
					break;
			}
		} );
	} );
}

void TrackMedia::addImageFromReply( QNetworkReply *r )
{
	r->deleteLater();
	m_pendingImageDownloads--;
	if( r->error() != QNetworkReply::NoError )
		return;
	QImage img;
	if( !img.loadFromData( r->readAll() ) || img.width() < 64 )
		return;
	if( img.width() > 640 )
		img = img.scaledToWidth( 640, Qt::SmoothTransformation );
	m_images.push_back( img.convertToFormat( QImage::Format_RGBA8888 ) );
	m_imagesRevision++;
	fprintf( stderr, "[Artist] Bild %d geladen (%dx%d)\n",
	         int(m_images.size()), m_images.back().width(), m_images.back().height() );
}
