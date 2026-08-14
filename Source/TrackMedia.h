#pragma once

// TrackMedia: Internet-Zusatzmaterial zum laufenden Track (optional).
// ---------------------------------------------------------------------------
//  - LYRICS von LRCLIB (lrclib.net): kostenlos, ohne API-Key, liefert wenn
//    vorhanden SYNCHRONISIERTE Zeilen ([mm:ss.xx]-Zeitstempel) - Basis für
//    den Karaoke-Modus; sonst Plain-Text für den Scroll-Modus.
//  - KÜNSTLERBILDER von Deezer (api.deezer.com): ebenfalls ohne Key.
//    Artist-Foto (XL) + einige Album-Cover als kleine Bildrotation.
//
// Alles asynchron über QNetworkAccessManager auf dem Qt-Hauptthread;
// GLwidget pollt die Ergebnisse pro Frame.  Fehler (kein Netz, Track
// unbekannt) degradieren still zu "nichts anzuzeigen".  Die fertige
// Lyrics-TEXTUR (eine hohe RGBA-Grafik, alle Zeilen untereinander, mit
// Zeilen-Pixelbereichen) wird hier Qt-seitig gerendert - der Qt-freie
// PresentPass bekommt nur Pixel + Koordinaten.

#include <QtCore/QString>
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
	int    imageCount() const { return int(m_images.size()); }
	const QImage &imageAt( int i ) const { return m_images[size_t(i)]; }
	int    imagesRevision() const { return m_imagesRevision; }

private:
	void   fetchLyrics();
	void   fetchArtist();
	void   parseLyricsReply( const QByteArray &json );
	void   parseSynced( const QString &lrc );
	void   parsePlain( const QString &plain );
	void   renderLyricsImage();
	void   addImageFromReply( QNetworkReply *r );
	QNetworkReply *get( const QString &url );

	QNetworkAccessManager *m_nam = nullptr;
	QString m_artist, m_title, m_key;

	bool    m_lyricsPending = false;
	std::vector<LyricLine> m_lines;
	QImage  m_lyricsImage;
	int     m_lyricsRevision = 0;

	std::vector<QImage> m_images;
	int     m_imagesRevision = 0;
	int     m_pendingImageDownloads = 0;
};
