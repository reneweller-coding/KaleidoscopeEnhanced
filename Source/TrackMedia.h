/**
 * @file TrackMedia.h
 * @brief Optional internet extras for the currently-playing track: chained multi-source lyrics fetching (rendered to a texture) and deduplicated artist-photo downloads, both disk-cached and polled asynchronously from the GL widget.
 */
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

/**
 * @brief Fetches, caches, and renders optional online extras (synced/plain lyrics, artist photos) for the currently-playing track.
 *
 * On requestTrack() it kicks off two independent async chains over
 * QNetworkAccessManager: a lyrics chain that tries a disk cache then falls
 * through LRCLIB (get, then search) -> NetEase -> lyrics.ovh until one
 * source returns text, and an artist-image chain that queries Deezer,
 * TheAudioDB and iTunes Search in parallel (deduplicated by URL, throttled
 * to kParallelDownloads concurrent downloads, capped at kMaxImages).
 * Synced lyrics are parsed into timestamped LyricLine entries and rendered
 * into one tall transparent QImage (lyricsImage()) for GPU upload; artist
 * images are cached as JPEGs on disk under "..\\cache\\artist\\<md5>\\" and
 * decoded lazily (one-image LRU) via imageAt(). A superseded request (a new
 * requestTrack() call, tracked via m_key) makes all in-flight network
 * callbacks for the old track no-ops. All network I/O runs on the Qt main
 * thread; the owning GL widget polls lyricsRevision()/imagesRevision() each
 * frame to notice new results. Every failure degrades silently (empty
 * lyrics/images), never throws or crashes.
 */
class TrackMedia
{
public:
	/** @brief Constructs the network manager and ensures the lyrics/artist cache directories exist. */
	TrackMedia();
	/** @brief Destroys the owned network manager (any in-flight QNetworkReply objects are children of it and are cleaned up via deleteLater() in their own finished() handlers). */
	~TrackMedia();

	/** Neuen Track anfordern (bei Trackwechsel rufen).  Identische
	 *  Wiederholungen werden ignoriert; ein neuer Track verwirft die
	 *  alten Ergebnisse. */
	/**
	 * @brief Requests lyrics + artist images for a (possibly new) track; call on every track change.
	 * @param artist Artist name (trimmed/lower-cased internally for de-duplication and cache keys).
	 * @param title Track title; an empty (trimmed) title is ignored outright.
	 *
	 * A call whose artist+title matches the currently active request is a
	 * no-op. Otherwise all pending/partial results from the previous
	 * request are discarded (their revision counters bump so consumers
	 * reload) and both the lyrics and artist-image fetch chains restart
	 * from cache.
	 */
	void requestTrack( const QString &artist, const QString &title );

	// ---- Lyrics ----
	/**
	 * @brief One line of (possibly time-synced) lyrics, plus its vertical band within lyricsImage().
	 */
	struct LyricLine
	{
		double  t0 = -1.0, t1 = -1.0;   // Sekunden; <0 = unsynchronisiert   ///< Start/end time in seconds for synced lyrics; t0 < 0 means unsynchronised (plain-text mode). An empty-text entry with only t0 set is a GAP MARKER for an instrumental break (see parseSynced()).
		QString text;                    ///< Line text; empty for a gap marker (instrumental break), never empty otherwise.
		float   v0 = 0.f, v1 = 0.f;     // Zeilenband in Textur-V (0..1)   ///< This line's vertical [0,1] band within lyricsImage(), for sampling/highlighting; a gap marker reuses the previous sung line's band.
	};
	bool   lyricsPending() const { return m_lyricsPending; }   ///< True while the lyrics fetch chain (cache/network) for the current track is still in flight.
	bool   hasLyrics()     const { return !m_lines.empty(); }   ///< True once at least one lyric line (synced or plain) has been found and parsed.
	bool   syncedLyrics()  const { return hasLyrics() && m_lines[0].t0 >= 0.0; }   ///< True if the found lyrics carry real timestamps (vs. plain unsynced text).
	const QImage &lyricsImage() const { return m_lyricsImage; }   ///< The single tall transparent texture holding every rendered lyric line (see renderLyricsImage()).
	const std::vector<LyricLine> &lines() const { return m_lines; }   ///< All parsed lyric lines (including gap markers), time-sorted for synced lyrics.
	/** Zählt hoch, wenn neue Lyrics fertig gerendert sind (Upload-Trigger). */
	/** @brief Increments whenever a fresh lyricsImage() has finished rendering. @return Monotonically increasing revision counter; consumers re-upload the texture when it changes. */
	int    lyricsRevision() const { return m_lyricsRevision; }

	// ---- Künstlerbilder ----
	int    imageCount() const { return int(m_imagePaths.size()); }   ///< Number of artist images currently available on disk for the active track's artist.
	/** Lazy: dekodiert bei Bedarf von der Platte (LRU-Cache: 1 Bild). */
	/**
	 * @brief Returns one artist image, decoding it from disk on demand.
	 * @param i Index into the available images, [0, imageCount()).
	 * @return The decoded, size-capped (max width 640) RGBA8888 image, or a null QImage if i is out of range or the file failed to decode/load.
	 *
	 * Single-slot LRU: repeated calls for the same index reuse the last
	 * decode; a different index re-decodes from disk (this class does not
	 * keep all images resident in memory).
	 */
	QImage imageAt( int i ) const;
	int    imagesRevision() const { return m_imagesRevision; }   ///< Increments each time a new artist image finishes downloading and is added to m_imagePaths.

private:
	// Lyrics-Quellen-Kette
	/** @brief Entry point of the lyrics chain: checks the on-disk cache (positive or still-valid negative) before falling through to the network chain (tryLrclibGet()). */
	void   lyricsFromCacheOrNet();
	/** @brief First network attempt: LRCLIB's exact get-by-artist/title endpoint; falls through to tryLrclibSearch() on a miss or error. */
	void   tryLrclibGet();
	/** @brief Second network attempt: LRCLIB's fuzzy search endpoint, preferring a result with synced lyrics over the first one with any plain lyrics; falls through to tryNetease() on a miss. */
	void   tryLrclibSearch();
	/** @brief Third network attempt: NetEase Cloud Music song search (title-matched to avoid cover versions) followed by its lyric endpoint; falls through to tryLyricsOvh() on a miss. */
	void   tryNetease();
	/** @brief Last-resort network attempt: lyrics.ovh plain-text lookup; calls lyricsGiveUp() if this also fails. */
	void   tryLyricsOvh();
	/**
	 * @brief Common success path once any source (cache or network) returns lyric text: parses it, renders the texture, and updates the cache.
	 * @param synced Synced (LRC-format) lyrics text, or empty if none.
	 * @param plain Plain-text lyrics, used only if synced is empty.
	 * @param quelle Human-readable source name for logging (e.g. "LRCLIB", "Cache"); the literal "Cache" suppresses re-writing the cache file.
	 */
	void   lyricsFound( const QString &synced, const QString &plain, const char *quelle );
	/** @brief Common failure path once every lyrics source has been exhausted: clears the pending flag and writes a negative cache entry so the chain is skipped next time (until the TTL expires). */
	void   lyricsGiveUp();
	/**
	 * @brief Parses LRC-format synced lyrics ("[mm:ss.xx]text", possibly multiple timestamps per line) into time-sorted LyricLine entries.
	 * @param lrc Raw LRC lyric text (one entry per '\\n'-separated line).
	 *
	 * An empty text after a timestamp is kept as a GAP MARKER (t0 only)
	 * rather than dropped: without it, the preceding line's t1 would be
	 * set to the next entry's t0, collapsing any mid-song silence to zero
	 * and leaving the long-pause fade-out logic in glwidget.cpp with
	 * nothing to detect except intro/outro silence.
	 */
	void   parseSynced( const QString &lrc );
	/**
	 * @brief Parses plain (unsynchronised) lyric text into LyricLine entries, one per non-empty source line.
	 * @param plain Raw plain-text lyrics.
	 */
	void   parsePlain( const QString &plain );
	/** @brief Renders every parsed lyric line into one tall transparent QImage (white text with a dark halo), truncating if the real-line budget would exceed kLyrMaxH, and fills in each line's v0/v1 texture-V band. */
	void   renderLyricsImage();

	// Bilder
	/** @brief Entry point of the artist-image chain: loads any already-cached images from disk, then (unless already >= 8 cached) kicks off all three network sources in parallel. */
	void   imagesFromCacheOrNet();
	/** @brief Queries Deezer for the best-matching artist (preferring one with a real, non-placeholder photo and the most fans) and enqueues its XL photo plus up to 25 album covers. */
	void   fetchDeezer();
	/** @brief Queries TheAudioDB (public test key) for the first matching artist and enqueues its thumbnail plus up to 4 fanart images. */
	void   fetchAudioDb();
	/** @brief Queries iTunes Search for albums by the artist (name-matched) and enqueues each cover art URL upscaled from 100px to 600px. */
	void   fetchITunes();
	/**
	 * @brief Adds an image URL to the download queue unless it is empty, already seen, or the combined cached+queued count has reached kMaxImages.
	 * @param url Image URL to enqueue.
	 */
	void   enqueueImageUrl( const QString &url );
	/** @brief Starts additional downloads from m_downloadQueue until kParallelDownloads are in flight; each completion decodes/validates (min width 200px), writes the JPEG to the artist cache dir, and recurses to keep the pipeline full. */
	void   startNextDownloads();

	/**
	 * @brief Issues a GET request with the project's identifying User-Agent and a 15s transfer timeout.
	 * @param url Request URL.
	 * @return The in-flight QNetworkReply (caller connects to its finished() signal and must deleteLater() it).
	 */
	QNetworkReply *get( const QString &url );
	/** @brief Path to this track's lyrics cache JSON, keyed by the MD5 of m_key. @return Cache file path under "..\\cache\\lyrics\\". */
	QString lyricsCachePath() const;
	/** @brief Path to this artist's image cache directory, keyed by the MD5 of the lower-cased artist name. @return Cache directory path under "..\\cache\\artist\\". */
	QString artistCacheDir()  const;
	/**
	 * @brief Writes (or overwrites) the lyrics cache JSON for the current track.
	 * @param synced Synced lyrics text to persist (may be empty).
	 * @param plain Plain lyrics text to persist (may be empty).
	 * @param found Whether any lyrics were actually found; false writes a timestamped negative-cache entry (see kNegCacheTtlSec).
	 */
	void    writeLyricsCache( const QString &synced, const QString &plain, bool found );

	QNetworkAccessManager *m_nam = nullptr;   ///< Shared network manager for every request this object issues; owned, created in the ctor.
	QString m_artist, m_title, m_key;   ///< Current track's trimmed artist/title, and m_key = lower-cased "artist|title" identity used to detect duplicate requests and to invalidate stale async callbacks.

	bool    m_lyricsPending = false;   ///< True while the lyrics chain (cache or any network attempt) for the current track is still unresolved.
	std::vector<LyricLine> m_lines;   ///< Parsed lyric lines (including gap markers) for the current track, time-sorted when synced.
	QImage  m_lyricsImage;   ///< Rendered lyrics texture (see renderLyricsImage()); null until lyrics are found and rendered.
	int     m_lyricsRevision = 0;   ///< Bumped whenever m_lyricsImage is (re)rendered or the track changes; consumers use it to detect new content.

	// Bilder: Pfade auf Platte (Cache-Verzeichnis); Download-Warteschlange
	static const int kMaxImages          = 50;   ///< Hard cap on the number of artist images kept (cached + queued) per track.
	static const int kParallelDownloads  = 4;    ///< Maximum number of artist-image downloads in flight at once.
	QStringList m_imagePaths;   ///< Disk paths (cache dir) of every artist image available so far, in the order discovered/downloaded.
	int         m_imagesRevision = 0;   ///< Bumped whenever an image is added to m_imagePaths (from cache load or a finished download).
	QStringList m_downloadQueue;          // noch zu ladende Bild-URLs   ///< URLs queued but not yet downloading.
	QStringList m_seenUrls;               // Dedupe über alle Quellen   ///< Every URL enqueued so far (across all three sources), used to prevent duplicate downloads.
	int         m_activeDownloads = 0;   ///< Number of artist-image downloads currently in flight (<= kParallelDownloads).
	int         m_nextImageNr     = 0;    // Dateinummer im Cache-Ordner   ///< Next zero-padded filename number to use when writing a downloaded image into the artist cache dir.
	mutable int    m_decodedIdx = -1;     // Mini-LRU für imageAt()   ///< Index currently held in the one-slot decode cache (-1 = empty); mutable because imageAt() is const.
	mutable QImage m_decoded;   ///< The single decoded QImage cached by imageAt() for m_decodedIdx; mutable for the same reason.
};
