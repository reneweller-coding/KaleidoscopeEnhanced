#pragma once

// TrackMedia: Internet-Zusatzmaterial zum laufenden Track (optional).
// ---------------------------------------------------------------------------
//  LYRICS - Ketten-Fallback über drei kostenlose Dienste (ohne API-Key),
//  damit auch Abseits-vom-Mainstream-Musik gefunden wird:
//    1. LRCLIB (lrclib.net)          - synchronisiert + plain, exakt & Suche
//    2. NetEase Cloud Music (163.com)- riesige LRC-Datenbank, oft synchron
//    3. lyrics.ovh                   - Plain-Text als letzte Rettung
//
//  KÜNSTLERBILDER - bis zu 50 pro Künstler aus drei Quellen (dedupliziert,
//  max. 4 parallele Downloads):
//    Deezer   (Artist-Foto XL + bis zu ~25 Album-Cover)
//    TheAudioDB (echte Band-Fotos: Thumb + Fanarts, freier Test-Key)
//    iTunes Search (weitere Album-Cover, auf 600px hochskalierte URLs)
//
//  CACHE - alles landet neben den Configurations unter ..\cache\:
//    cache\lyrics\<md5>.json      (auch "nicht gefunden", TTL 7 Tage)
//    cache\artist\<md5>\NN.jpg    (Bilder; lazy von Platte dekodiert)
//  Ein erneut gespielter Track kommt damit komplett ohne Netz aus.
//
// Alles asynchron über QNetworkAccessManager auf dem Qt-Hauptthread;
// GLwidget pollt die Ergebnisse pro Frame.  Fehler degradieren still.

#include <QtCore/QString>
#include <QtCore/QStringList>
#include <QtGui/QImage>
#include <vector>

class QNetworkAccessManager;
class QNetworkReply;

class TrackMedia
{
public:
	TrackMedia();
	~TrackMedia();

	/** Neuen Track anfordern (bei Trackwechsel rufen).  Identische
	 *  Wiederholungen werden ignoriert; ein neuer Track verwirft die
	 *  alten Ergebnisse. */
	void requestTrack( const QString &artist, const QString &title );

	// ---- Lyrics ----
	struct LyricLine
	{
		double  t0 = -1.0, t1 = -1.0;   // Sekunden; <0 = unsynchronisiert
		QString text;
		float   v0 = 0.f, v1 = 0.f;     // Zeilenband in Textur-V (0..1)
	};
	bool   lyricsPending() const { return m_lyricsPending; }
	bool   hasLyrics()     const { return !m_lines.empty(); }
	bool   syncedLyrics()  const { return hasLyrics() && m_lines[0].t0 >= 0.0; }
	const QImage &lyricsImage() const { return m_lyricsImage; }
	const std::vector<LyricLine> &lines() const { return m_lines; }
	/** Zählt hoch, wenn neue Lyrics fertig gerendert sind (Upload-Trigger). */
	int    lyricsRevision() const { return m_lyricsRevision; }

	// ---- Künstlerbilder ----
	int    imageCount() const { return int(m_imagePaths.size()); }
	/** Lazy: dekodiert bei Bedarf von der Platte (LRU-Cache: 1 Bild). */
	QImage imageAt( int i ) const;
	int    imagesRevision() const { return m_imagesRevision; }

private:
	// Lyrics-Quellen-Kette
	void   lyricsFromCacheOrNet();
	void   tryLrclibGet();
	void   tryLrclibSearch();
	void   tryNetease();
	void   tryLyricsOvh();
	void   lyricsFound( const QString &synced, const QString &plain, const char *quelle );
	void   lyricsGiveUp();
	void   parseSynced( const QString &lrc );
	void   parsePlain( const QString &plain );
	void   renderLyricsImage();

	// Bilder
	void   imagesFromCacheOrNet();
	void   fetchDeezer();
	void   fetchAudioDb();
	void   fetchITunes();
	void   enqueueImageUrl( const QString &url );
	void   startNextDownloads();

	QNetworkReply *get( const QString &url );
	QString lyricsCachePath() const;
	QString artistCacheDir()  const;
	void    writeLyricsCache( const QString &synced, const QString &plain, bool found );

	QNetworkAccessManager *m_nam = nullptr;
	QString m_artist, m_title, m_key;

	bool    m_lyricsPending = false;
	std::vector<LyricLine> m_lines;
	QImage  m_lyricsImage;
	int     m_lyricsRevision = 0;

	// Bilder: Pfade auf Platte (Cache-Verzeichnis); Download-Warteschlange
	static const int kMaxImages          = 50;
	static const int kParallelDownloads  = 4;
	QStringList m_imagePaths;
	int         m_imagesRevision = 0;
	QStringList m_downloadQueue;          // noch zu ladende Bild-URLs
	QStringList m_seenUrls;               // Dedupe über alle Quellen
	int         m_activeDownloads = 0;
	int         m_nextImageNr     = 0;    // Dateinummer im Cache-Ordner
	mutable int    m_decodedIdx = -1;     // Mini-LRU für imageAt()
	mutable QImage m_decoded;
};
