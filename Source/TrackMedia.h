//---------------------------------------------------------------------------
//                              TrackMedia
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Optional internet extras for the currently-playing track: chained multi-source lyrics fetching (rendered to a
 *  texture), deduplicated artist-photo downloads, and an official-music-video search+download (via yt-dlp), all
 *  disk-cached and polled asynchronously from the GL widget.
 *
 *  @author René Weller
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
//  MUSIKVIDEO (optional, braucht yt-dlp auf PATH) - für Songs unter
//  VideoMaxDurationSec: sucht per yt-dlp-Suche nach dem OFFIZIELLEN
//  Musikvideo (Text-/Kanal-Heuristik + Längenabgleich, siehe
//  scoreCandidate()), lädt es herunter und übernimmt danach denselben
//  Künstlerbild-Eck-Slot (GLwidget spielt es via Source/VideoPiP synchron
//  zur echten Song-Position ab). Fehlt yt-dlp, degradiert das Feature still
//  (kein Absturz, einfach keine Videos) - siehe m_ytdlpProc/errorOccurred.
//
//  CACHE - alles landet neben den Presets unter ..\cache\:
//    cache\lyrics\<md5>.json      (auch "nicht gefunden", TTL 7 Tage)
//    cache\artist\<md5>\NN.jpg    (Bilder; lazy von Platte dekodiert)
//    cache\video\<md5>\video.mp4  (oder negative.json, TTL 14 Tage)
//  Ein erneut gespielter Track kommt damit komplett ohne Netz aus.
//
// Lyrics/Bilder laufen asynchron über QNetworkAccessManager, das Musikvideo
// über QProcess (yt-dlp) - beides auf dem Qt-Hauptthread; GLwidget pollt die
// Ergebnisse pro Frame. Fehler degradieren in jedem Zweig still.

#include <QtCore/QString>
#include <QtCore/QStringList>
#include <QtGui/QImage>
#include <vector>

class QNetworkAccessManager;
class QNetworkReply;
class QProcess;

/** @class TrackMedia
 *
 * Fetches, caches, and renders optional online extras (synced/plain lyrics, artist photos, an official music video)
 * for the currently-playing track.
 *
 * On requestTrack() it kicks off up to three independent async chains: a
 * lyrics chain (QNetworkAccessManager) that tries a disk cache then falls
 * through LRCLIB (get, then search) -> NetEase -> lyrics.ovh until one
 * source returns text, an artist-image chain (also QNetworkAccessManager)
 * that queries Deezer, TheAudioDB and iTunes Search in parallel
 * (deduplicated by URL, throttled to ParallelDownloads concurrent
 * downloads, capped at MaxImages), and -- for tracks under
 * VideoMaxDurationSec, when a duration is passed in -- a music-video chain
 * (QProcess, shelling out to yt-dlp) that searches YouTube, scores the
 * candidates, and downloads the best-scoring one.
 * Synced lyrics are parsed into timestamped LyricLine entries and rendered
 * into one tall transparent QImage (lyricsImage()) for GPU upload; artist
 * images are cached as JPEGs on disk under "..\\cache\\artist\\<md5>\\" and
 * decoded lazily (one-image LRU) via imageAt(). A superseded request (a new
 * requestTrack() call, tracked via m_key) makes all in-flight network
 * callbacks for the old track no-ops. All network I/O runs on the Qt main
 * thread; the owning GL widget polls lyricsRevision()/imagesRevision() each
 * frame to notice new results. Every failure degrades silently (empty
 * lyrics/images), never throws or crashes.
 **/
class TrackMedia
{
public:
    /** Constructs the network manager and ensures the lyrics/artist cache directories exist. */
    TrackMedia();
    /**  Destroys the owned network manager (any in-flight QNetworkReply objects are children of it and are cleaned up
     * via deleteLater() in their own finished() handlers).
     **/
    ~TrackMedia();

    /** Neuen Track anfordern (bei Trackwechsel rufen).  Identische
     *  Wiederholungen werden ignoriert; ein neuer Track verwirft die
     *  alten Ergebnisse. */
    /**  Requests lyrics + artist images (+ an optional music video) for a (possibly new) track; call on every track
     * change.
     *
     * @param artist       Artist name (trimmed/lower-cased internally for de-duplication and cache keys). (in)
     * @param title        Track title; an empty (trimmed) title is ignored outright. (in)
     * @param durationSec  The track's known duration in seconds, or <=0 if not (yet) known. Gates the music-video
     *                     search: only attempted for tracks under VideoMaxDurationSec, and skipped entirely (not
     *                     just deferred) when the duration is unknown at call time, since guessing wrong here means
     *                     silently downloading something the user didn't ask for. (in)
     *
     * A call whose artist+title matches the currently active request is a
     * no-op. Otherwise all pending/partial results from the previous
     * request are discarded (their revision counters bump so consumers
     * reload) and the lyrics, artist-image and (when eligible) music-video
     * fetch chains restart from cache.
     **/
    void requestTrack( const QString &artist, const QString &title, double durationSec = -1.0 );

    // ---- Lyrics ----
    /** One line of (possibly time-synced) lyrics, plus its vertical band within lyricsImage(). */
    struct LyricLine
    {
        /** Start time of this line in song seconds for synced lyrics; < 0 means unsynchronised (plain-text mode,
         * both times stay -1).
         *
         * An empty-text entry with only t0 meaningful is a GAP MARKER for an instrumental break (see parseSynced()).
         **/
        double t0 = -1.0, t1 = -1.0; ///< End time in song seconds: the following line's t0 after time-sorting, or t0 +
                                     ///< 6 s for the last line; -1 for unsynchronised lyrics. A gap marker's t1 is
                                     ///< likewise the next sung line's t0, which is exactly what keeps mid-song
                                     ///< silences measurable.
        QString text;                ///< Line text; empty for a gap marker (instrumental break), never empty otherwise.
        /** Top edge of this line's vertical band within lyricsImage(), in texture-V units [0,1] (0 = image top); a
         * gap marker reuses the previous sung line's band.
         **/
        float v0 = 0.f, v1 = 0.f; ///< Bottom edge of the same band in texture-V units [0,1] (v0 + one line height /
                                  ///< image height); consumers sample/highlight the strip v0..v1.
        float overflowU = 0.f;    ///< How far (in lyricsImage()-wide texture-U units) this line's full, un-elided text
                                  ///< extends past the normally-visible window; 0 if it fits. Drives the host-side
                                  ///< horizontal marquee scroll for the currently focused line (see glwidget.cpp).
    };
    /**  The nominal (normally-visible, pre-marquee) width of lyricsImage() in pixels -- the actual image can be wider
     * to hold overflowing lines' full text; callers use this fixed value (not img.width()) to keep the on-screen
     * text SIZE stable regardless of how wide any one line's overflow makes the texture.
     *
     * @return
     *   The width in pixels.
     **/
    static int lyricsNominalTexWidth();
    /**  True while the lyrics fetch chain (cache/network) for the current track is still in flight.
     *
     * @return
     *   True while the lyrics fetch chain (cache/network) for the current track is still in flight.
     **/
    bool lyricsPending() const
    {
        return m_lyricsPending;
    }
    /**  True once at least one lyric line (synced or plain) has been found and parsed.
     *
     * @return
     *   True once at least one lyric line (synced or plain) has been found and parsed.
     **/
    bool hasLyrics() const
    {
        return !m_lines.empty();
    }
    /**  True if the found lyrics carry real timestamps (vs. plain unsynced text).
     *
     * @return
     *   True if the found lyrics carry real timestamps (vs. plain unsynced text).
     **/
    bool syncedLyrics() const
    {
        return hasLyrics() && m_lines[0].t0 >= 0.0;
    }
    /**  The single tall transparent texture holding every rendered lyric line (see renderLyricsImage()).
     *
     * @return
     *   The single tall transparent texture holding every rendered lyric line (see renderLyricsImage()).
     **/
    const QImage &lyricsImage() const
    {
        return m_lyricsImage;
    }
    /**  All parsed lyric lines (including gap markers), time-sorted for synced lyrics.
     *
     * @return
     *   All parsed lyric lines (including gap markers), time-sorted for synced lyrics.
     **/
    const std::vector<LyricLine> &lines() const
    {
        return m_lines;
    }
    /** Zählt hoch, wenn neue Lyrics fertig gerendert sind (Upload-Trigger). */
    /**  Increments whenever a fresh lyricsImage() has finished rendering.
     *
     * @return
     *   Monotonically increasing revision counter; consumers re-upload the texture when it changes.
     **/
    int lyricsRevision() const { return m_lyricsRevision; }

    // ---- Künstlerbilder ----
    /**  Number of artist images currently available on disk for the active track's artist.
     *
     * @return
     *   Number of artist images currently available on disk for the active track's artist.
     **/
    int imageCount() const
    {
        return static_cast<int>( m_imagePaths.size() );
    }
    /** Lazy: dekodiert bei Bedarf von der Platte (LRU-Cache: 1 Bild). */
    /**  Returns one artist image, decoding it from disk on demand.
     *
     * @param i  Index into the available images, [0, imageCount()). (in)
     *
     * @return
     *   The decoded, size-capped (max width 640) RGBA8888 image, or a null QImage if i is out of range or the file
     *   failed to decode/load.
     *
     * Single-slot LRU: repeated calls for the same index reuse the last
     * decode; a different index re-decodes from disk (this class does not
     * keep all images resident in memory).
     **/
    QImage imageAt( int i ) const;
    /**  Increments each time a new artist image finishes downloading and is added to m_imagePaths.
     *
     * @return
     *   Increments each time a new artist image finishes downloading and is added to m_imagePaths.
     **/
    int imagesRevision() const
    {
        return m_imagesRevision;
    }

    // ---- Musikvideo (optional, via yt-dlp) ----
    /** Tracks longer than this are never searched for a video -- picked because the request explicitly framed it as
     * "songs, not DJ sets".
     **/
    static const int VideoMaxDurationSec = 20 * 60;
    /**  True once a cached music video is ready to play for the CURRENT track (from disk cache or a finished
     * download).
     *
     * @return
     *   True once a cached music video is ready to play for the CURRENT track (from disk cache or a finished
     *   download).
     **/
    bool videoReady() const
    {
        return !m_videoPath.isEmpty();
    }
    /**  Absolute path to the cached mp4, or empty if none is ready.
     *
     * @return
     *   Absolute path to the cached mp4, or empty if none is ready.
     **/
    QString videoPath() const { return m_videoPath; }
    /**  Increments whenever videoPath() changes for the current track (cache hit, or a background download just
     * finished); consumers use it to notice new content the same way as lyricsRevision()/imagesRevision().
     *
     * @return
     *   Increments whenever videoPath() changes for the current track (cache hit, or a background download just
     *   finished); consumers use it to notice new content the same way as lyricsRevision()/imagesRevision().
     **/
    int videoRevision() const
    {
        return m_videoRevision;
    }

private:
    // Lyrics-Quellen-Kette
    /**  Entry point of the lyrics chain: checks the on-disk cache (positive or still-valid negative) before falling
     * through to the network chain (tryLrclibGet()).
     **/
    void lyricsFromCacheOrNet();
    /**  First network attempt: LRCLIB's exact get-by-artist/title endpoint; falls through to tryLrclibSearch() on a
     * miss or error.
     **/
    void tryLrclibGet();
    /**  Second network attempt: LRCLIB's fuzzy search endpoint, preferring a result with synced lyrics over the first
     * one with any plain lyrics; falls through to tryNetease() on a miss.
     **/
    void tryLrclibSearch();
    /**  Third network attempt: NetEase Cloud Music song search (title-matched to avoid cover versions) followed by
     * its lyric endpoint; falls through to tryLyricsOvh() on a miss.
     **/
    void tryNetease();
    /** Last-resort network attempt: lyrics.ovh plain-text lookup; calls lyricsGiveUp() if this also fails. */
    void tryLyricsOvh();
    /**  Common success path once any source (cache or network) returns lyric text: parses it, renders the texture,
     * and updates the cache.
     *
     * @param synced  Synced (LRC-format) lyrics text, or empty if none. (in)
     * @param plain   Plain-text lyrics, used only if synced is empty. (in)
     * @param quelle  Human-readable source name for logging (e.g. "LRCLIB", "Cache"); the literal "Cache"
     *                suppresses re-writing the cache file. (in)
     **/
    void lyricsFound( const QString &synced, const QString &plain, const char *quelle );
    /**  Common failure path once every lyrics source has been exhausted: clears the pending flag and writes a
     * negative cache entry so the chain is skipped next time (until the TTL expires).
     **/
    void lyricsGiveUp();
    /**  Parses LRC-format synced lyrics ("[mm:ss.xx]text", possibly multiple timestamps per line) into time-sorted
     * LyricLine entries.
     *
     * @param lrc  Raw LRC lyric text (one entry per '\\n'-separated line). (in)
     *
     * An empty text after a timestamp is kept as a GAP MARKER (t0 only)
     * rather than dropped: without it, the preceding line's t1 would be
     * set to the next entry's t0, collapsing any mid-song silence to zero
     * and leaving the long-pause fade-out logic in glwidget.cpp with
     * nothing to detect except intro/outro silence.
     **/
    void parseSynced( const QString &lrc );
    /**  Parses plain (unsynchronised) lyric text into LyricLine entries, one per non-empty source line.
     *
     * @param plain  Raw plain-text lyrics. (in)
     **/
    void parsePlain( const QString &plain );
    /**  Renders every parsed lyric line into one tall transparent QImage (white text with a dark halo), truncating if
     * the real-line budget would exceed LyrMaxH, and fills in each line's v0/v1 texture-V band.
     **/
    void renderLyricsImage();

    // Bilder
    /**  Entry point of the artist-image chain: loads any already-cached images from disk, then (unless already >= 8
     * cached) kicks off all three network sources in parallel.
     **/
    void imagesFromCacheOrNet();
    /**  Queries Deezer for the best-matching artist (preferring one with a real, non-placeholder photo and the most
     * fans) and enqueues its XL photo plus up to 25 album covers.
     **/
    void fetchDeezer();
    /**  Queries TheAudioDB (public test key) for the first matching artist and enqueues its thumbnail plus up to 4
     * fanart images.
     **/
    void fetchAudioDb();
    /**  Queries iTunes Search for albums by the artist (name-matched) and enqueues each cover art URL upscaled from
     * 100px to 600px.
     **/
    void fetchITunes();
    /**  Adds an image URL to the download queue unless it is empty, already seen, or the combined cached+queued count
     * has reached MaxImages.
     *
     * @param url  Image URL to enqueue. (in)
     **/
    void enqueueImageUrl( const QString &url );
    /**  Starts additional downloads from m_downloadQueue until ParallelDownloads are in flight; each completion
     * decodes/validates (min width 200px), writes the JPEG to the artist cache dir, and recurses to keep the
     * pipeline full.
     **/
    void startNextDownloads();

    /**  Issues a GET request with the project's identifying User-Agent and a 15s transfer timeout.
     *
     * @param url  Request URL. (in)
     *
     * @return
     *   The in-flight QNetworkReply (caller connects to its finished() signal and must deleteLater() it).
     **/
    QNetworkReply *get( const QString &url );
    /**  Path to this track's lyrics cache JSON, keyed by the MD5 of m_key.
     *
     * @return
     *   Cache file path under "..\\cache\\lyrics\\".
     **/
    QString lyricsCachePath() const;
    /**  Path to this artist's image cache directory, keyed by the MD5 of the lower-cased artist name.
     *
     * @return
     *   Cache directory path under "..\\cache\\artist\\".
     **/
    QString artistCacheDir() const;

    // Musikvideo
    /**  Path to this track's video cache directory, keyed by the MD5 of m_key.
     *
     * @return
     *   Cache directory path under "..\\cache\\video\\".
     **/
    QString videoCacheDir() const;
    /**  Entry point of the video search: checks the on-disk cache (a ready video, or a still-valid negative marker)
     * before shelling out to yt-dlp.
     *
     * @param durationSec  The requesting call's known track duration, already gated (>0 and <= VideoMaxDurationSec)
     *                     by the caller. (in)
     **/
    void videoFromCacheOrNet( double durationSec );
    /** One candidate returned by the yt-dlp search step, before scoring (parsed from one
     * "id|||title|||channel|||duration" --print line).
     **/
    struct VideoCandidate
    {
        QString id, title, channel;
        double  duration = 0.0;
    };
    /** @var TrackMedia::VideoCandidate::id
     *  @brief YouTube video id as printed by yt-dlp (%(id)s); the winner's id is what startVideoDownload() fetches. */
    /** @var TrackMedia::VideoCandidate::title
     *  @brief Video title (%(title)s); scanned case-insensitively for "official (music) video" and for wrong-kind
     * signals such as lyric/live/remix. */
    /** @var TrackMedia::VideoCandidate::channel
     *  @brief Uploading channel name (%(channel)s); a match with the artist name or "vevo" raises the score. */
    /** @var TrackMedia::VideoCandidate::duration
     *  @brief Video length in seconds (%(duration)s); 0 if yt-dlp gave none. Must lie within max(20 s, 15 %) of the
     * track's real duration or the candidate is rejected outright. */
    /**  Shells out to `yt-dlp ytsearchN:...` (no download, just metadata) for up to VideoSearchCount candidates;
     * parses its stdout on completion and picks a candidate via scoreCandidate(), then either starts the download
     * or gives up (writing a negative cache entry).
     **/
    void startVideoSearch();
    /**  Scores one search candidate against the target duration and "does this look like the OFFICIAL music video"
     * text signals in its title/channel.
     *
     * @param c                  The candidate from the yt-dlp search. (in)
     * @param artist             Artist of the current track; a channel of that name scores higher. (in)
     * @param targetDurationSec  Real length of the track in seconds; candidates outside max(20 s, 15 %) of it are
     *                           rejected. (in)
     *
     * @return
     *   A score where higher is better; callers reject anything <= 0.
     **/
    static double scoreCandidate( const VideoCandidate &c, const QString &artist, double targetDurationSec );
    /**  Shells out to `yt-dlp <watch-url> -f ...` to download the chosen candidate into a temp file in
     * videoCacheDir(), then atomically renames it to video.mp4 on success.
     *
     * @param videoId  YouTube id of the chosen candidate (VideoCandidate::id). (in)
     **/
    void startVideoDownload( const QString &videoId );
    /**  Writes a timestamped "no acceptable video found" marker so repeated plays of the same track don't re-search
     * every time (see VideoNegCacheTtlSec).
     **/
    void writeVideoNegativeCache();
    /**  Writes (or overwrites) the lyrics cache JSON for the current track.
     *
     * @param synced  Synced lyrics text to persist (may be empty). (in)
     * @param plain   Plain lyrics text to persist (may be empty). (in)
     * @param found   Whether any lyrics were actually found; false writes a timestamped negative-cache entry (see
     *                NegCacheTtlSec). (in)
     **/
    void writeLyricsCache( const QString &synced, const QString &plain, bool found );

    QNetworkAccessManager *m_nam = nullptr; ///< Shared network manager for every request this object issues; owned,
                                            ///< created in the ctor.
    /** Current track's artist name, whitespace-trimmed (case preserved for display/queries; lower-cased only for
     * cache keys).
     *
     * Empty skips the artist-image chain.
     **/
    QString m_artist, m_title, m_key; ///< Lower-cased "artist|title" identity of the active request; used to detect
                                      ///< duplicate requestTrack() calls and to invalidate stale async callbacks (each
                                      ///< callback captures it and bails if it no longer matches).
    /** @var TrackMedia::m_title
     *  @brief Current track's title, whitespace-trimmed; used verbatim in every lyrics/video query. */

    bool m_lyricsPending = false; ///< True while the lyrics chain (cache or any network attempt) for the current track
                                  ///< is still unresolved.
    std::vector<LyricLine> m_lines; ///< Parsed lyric lines (including gap markers) for the current track, time-sorted
                                    ///< when synced.
    QImage m_lyricsImage;     ///< Rendered lyrics texture (see renderLyricsImage()); null until lyrics are found and
                              ///< rendered.
    int m_lyricsRevision = 0; ///< Bumped whenever m_lyricsImage is (re)rendered or the track changes; consumers use it
                              ///< to detect new content.

    // Bilder: Pfade auf Platte (Cache-Verzeichnis); Download-Warteschlange
    static const int MaxImages = 50; ///< Hard cap on the number of artist images kept (cached + queued) per track.
    static const int ParallelDownloads = 4; ///< Maximum number of artist-image downloads in flight at once.
    QStringList      m_imagePaths; ///< Disk paths (cache dir) of every artist image available so far, in the order
                                   ///< discovered/downloaded.
    int m_imagesRevision = 0;      ///< Bumped whenever an image is added to m_imagePaths (from cache load or a finished
                                   ///< download).
    QStringList m_downloadQueue; ///< Image URLs accepted by enqueueImageUrl() but not yet started; startNextDownloads()
                                 ///< pops from the front. Counts toward MaxImages together with m_imagePaths.
    QStringList m_seenUrls;      ///< Every URL enqueued so far for this track (across all three sources), used to drop
                                 ///< duplicates that Deezer/TheAudioDB/iTunes return in common.
    int m_activeDownloads = 0;   ///< Number of artist-image downloads currently in flight (<= ParallelDownloads).
    int m_nextImageNr = 0; ///< Next file number (zero-padded to 3 digits, "NNN.jpg") to use when writing a downloaded
                           ///< image into the artist cache dir; starts after the images already found on disk.
    mutable int m_decodedIdx = -1; ///< Index into m_imagePaths currently held in the one-slot decode cache used by
                                   ///< imageAt() (-1 = empty); mutable because imageAt() is const.
    mutable QImage m_decoded; ///< The single decoded QImage cached by imageAt() for m_decodedIdx; mutable for the same
                              ///< reason.

    // Musikvideo: at most ONE yt-dlp process (search or download) in flight
    // at a time, process-wide -- if a track change comes in while one is
    // already running for a DIFFERENT track, the new track's video is simply
    // skipped for this play-through (a later replay retries from scratch).
    // Keeps process lifetime management simple; lyrics/artist-images don't
    // need this because QNetworkAccessManager already handles many
    // concurrent requests safely, but a single QProcess member can't.
    static const int    VideoSearchCount = 8;                 ///< Candidates requested from yt-dlp's search step.
    static const qint64 VideoNegCacheTtlSec = 14 * 24 * 3600; ///< TTL for a "no acceptable video found" cache entry.
    QString             m_videoPath; ///< Absolute path to the ready cached video for the CURRENT track, or empty.
    int                 m_videoRevision = 0; ///< Bumped whenever m_videoPath changes for the current track.
    double m_videoDurationSec = -1.0; ///< The current track's duration, captured at requestTrack() time, used to score
                                      ///< search candidates.
    QString m_videoKeyAtRequest; ///< m_key snapshot when the in-flight search/download started; a result is discarded
                                 ///< (not applied) if m_key has since moved on to a different track.
    QProcess *m_ytdlpProc = nullptr; ///< The in-flight yt-dlp search-or-download process, if any (see the class comment
                                     ///< above).
    bool m_ytdlpUpdateTried = false; ///< One-shot: fires a best-effort background `yt-dlp -U` the first time this run
                                     ///< actually needs the video feature (YouTube's extraction breaks on a stale
                                     ///< yt-dlp often enough that silent staleness would otherwise slowly kill this
                                     ///< feature).
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    TrackMedia( const TrackMedia & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    TrackMedia &operator=( const TrackMedia & ) = delete;
};
