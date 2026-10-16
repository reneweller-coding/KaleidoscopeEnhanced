/*****************************************************************************\
 *                              NowPlaying
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implementation of NowPlaying: WinRT SMTC polling thread, VLC window-title fallback, and playback-position
 *  settling/smoothing.
 *
 *  @author René Weller
 */

// C++/WinRT's await adapters pull in <experimental/coroutine> under C++17, which
// MSVC now flags as deprecated.  We only block on the async results with .get()
// (no real coroutines), so silence it.
#define _SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS
#define _SILENCE_CLANG_COROUTINE_MESSAGE

#include "NowPlaying.h"

#include <QtCore/QDateTime>

#include <cmath>

#ifdef _WIN32
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.Control.h>

#include <windows.h>
#include <string>

using namespace winrt;
using namespace winrt::Windows::Media::Control;

// ---- VLC fallback ---------------------------------------------------------
// Classic VLC (3.x) never registers a Windows SMTC media session, so the
// system-wide "now playing" query above comes back empty for it.  VLC does,
// however, put the media title into its WINDOW TITLE ("<media> - VLC media
// player", suffix not localised) — scan the top-level windows for it.
// (Spotify, browsers and foobar2000-with-Media-Controls-component all speak
// SMTC and never reach this fallback.)
namespace
{
/** Result accumulator for vlcEnumProc(): the matched window's media title, if any. */
struct VlcScan
{
    std::wstring text; ///< Non-empty once a VLC window title has been matched.
};

/**  EnumWindows callback that scans top-level windows for a classic-VLC title suffix.
 *
 * @param hwnd  The window handle being visited. (in)
 * @param lp    A `VlcScan*` cast to LPARAM; receives the matched title (minus the VLC suffix). (in)
 *
 * @return
 *   TRUE to keep enumerating, FALSE to stop (a match was found).
 **/
BOOL CALLBACK vlcEnumProc( HWND hwnd, LPARAM lp )
{
    if ( !IsWindowVisible( hwnd ) )
        return TRUE;
    wchar_t buf[512];
    int     n = GetWindowTextW( hwnd, buf, 512 );
    if ( n <= 0 )
        return TRUE;
    std::wstring              s( buf, static_cast<size_t>( n ) );
    static const std::wstring Suffix = L" - VLC media player";
    if ( s.size() > Suffix.size()
         && _wcsicmp( s.c_str() + ( s.size() - Suffix.size() ), Suffix.c_str() ) == 0 )
    {
        reinterpret_cast<VlcScan *>( lp )->text = s.substr( 0, s.size() - Suffix.size() );
        return FALSE; // found - stop enumerating
    }
    return TRUE;
}

/**  "<artist> - <title>" metadata split + filename cleanup for the VLC fallback.
 *
 * @param raw     The VLC window title with the " - VLC media player" suffix already stripped. (in)
 * @param title   Receives the parsed (or cleaned raw) title. (out)
 * @param artist  Receives the parsed artist, left untouched if no " - " separator was found. (out)
 *
 * Drops a known media-file extension and turns underscores into spaces, so a raw file name still
 * reads like a title; then splits on the first " - " into artist/title if present.
 **/
void parseVlcTitle( const std::wstring &raw, QString &title, QString &artist )
{
    QString w = QString::fromStdWString( raw ).trimmed();
    if ( w.isEmpty() )
        return;

    static const char *exts[] = { ".mp3", ".flac", ".m4a", ".ogg", ".opus",
                                  ".wav", ".wma", ".aac", ".mp4", ".mkv",
                                  ".avi", ".webm", ".mov" };
    for ( const char *ext : exts )
        if ( w.endsWith( QString::fromLatin1( ext ), Qt::CaseInsensitive ) )
        {
            w.chop( static_cast<int>( strlen( ext ) ) );
            break;
        }
    w.replace( QChar( '_' ), QChar( ' ' ) );

    int cut = w.indexOf( " - " );
    if ( cut > 0 )
    {
        artist = w.left( cut ).trimmed();
        title = w.mid( cut + 3 ).trimmed();
    }
    else
        title = w;
}
}
#endif // _WIN32

NowPlaying::NowPlaying()
{
}

NowPlaying::~NowPlaying()
{
    stop();
    if ( m_thread.joinable() )
        m_thread.join();
}

void NowPlaying::start()
{
    if ( m_running )
        return;
    m_running = true;
    m_thread = std::thread( &NowPlaying::threadFunc, this );
}

void NowPlaying::stop()
{
    m_running = false;
}

QString NowPlaying::title() const
{
    QMutexLocker l( &m_mutex );
    return m_title;
}
QString NowPlaying::artist() const
{
    QMutexLocker l( &m_mutex );
    return m_artist;
}

NowPlaying::Timeline NowPlaying::timeline() const
{
    QMutexLocker l( &m_mutex );
    return m_timeline;
}

// Extrapolates the last published Timeline forward to "now" using the local clock and the
// settled extrapolation rate, rather than returning the (possibly seconds-stale) raw SMTC value.
double NowPlaying::positionNowSec() const
{
    Timeline tl = timeline();
    if ( tl.positionSec < 0.0 )
        return -1.0;
    if ( !tl.playing )
        return tl.positionSec;
    const qint64 now_ms = QDateTime::currentMSecsSinceEpoch();
    double       p = tl.positionSec + static_cast<double>( now_ms - tl.stampMs ) * 0.001 * tl.rate;
    if ( tl.durationSec > 0.0 && p > tl.durationSec )
        p = tl.durationSec;
    return p;
}

// See NowPlaying.h for the class-level summary. This is the ~1s poll loop: query SMTC (or fall
// back to the VLC window-title scan), then run the two-stage "settle" state machine below that
// turns the raw, sometimes-stale-for-1-2-polls position reports into a monotonic, smoothly
// extrapolated Timeline (see the German inline comments for the detailed reasoning per branch).
void NowPlaying::threadFunc()
{
#ifndef _WIN32
    // There is no OS-wide "now playing" contract outside Windows: SMTC is a
    // WinRT service, and neither Linux nor macOS has an equivalent every
    // player speaks (MPRIS covers only some, and needs a D-Bus dependency).
    // The consumers already cope with an empty title -- that is the normal
    // state whenever nothing is playing -- so lyrics, artist images and the
    // video PiP simply stay idle here instead of reporting wrong metadata.
    m_running = false;
    return;
#else
    // WinRT must be initialised per-thread.  SMTC works in the multi-threaded
    // apartment, where blocking on the async results with .get() is allowed.
    bool inited = false;
    try
    {
        winrt::init_apartment( winrt::apartment_type::multi_threaded );
        inited = true;
    }
    catch ( ... )
    { /* already initialised on this thread is fine */
    }

    // Running baseline for the drift correction below (stays on THIS thread,
    // no lock needed - only the published m_timeline needs one).
    Timeline prev_tl;
    QString  prev_title;
    qint64   track_change_ms = 0;   // when WE recognised the current title
    bool     pos_confirmed = false; // TRUE only once two reports agree with each other
    Timeline candidate;             // first (not yet confirmed) report of the new track

    // Title confirmation (like the position confirmation above, but it NEVER
    // existed before): the published title changes only when two successive
    // polls deliver the same (title, artist) pair.  Without it a single
    // wrong/empty SMTC read (the OS briefly delivers a stale or empty
    // property, common around play/pause flicker or app-internal transitions)
    // triggered a complete "new track" reset in glwidget.cpp - PLL set up
    // again, lyrics + artist image reloaded, scroll to 0 - and the NEXT poll
    // (SMTC corrects itself) undid it again: a single outlier thus became TWO
    // visible jumps.  Affects only the PUBLISHED m_title/m_artist; the
    // new-track detection and the position confirmation below keep working
    // on the raw `t` (a spurious new-track flag on a title blip is harmless -
    // at most it briefly yields positionSec=-1, and the caller already falls
    // back to its own clock for that).
    QString pending_title, pending_artist;
    QString published_title, published_artist;

    while ( m_running )
    {
        QString  t, a;
        Timeline tl;
        try
        {
            auto mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();
            if ( mgr )
            {
                auto session = mgr.GetCurrentSession();
                if ( session )
                {
                    auto props = session.TryGetMediaPropertiesAsync().get();
                    t = QString::fromWCharArray( props.Title().c_str() );
                    a = QString::fromWCharArray( props.Artist().c_str() );

                    // Timeline for the lyrics sync.  TimeSpan counts in
                    // 100 ns ticks; subtract StartTime (streams do not always
                    // start at 0).
                    auto         tp = session.GetTimelineProperties();
                    auto         pi = session.GetPlaybackInfo();
                    const double Tick = 1e-7;
                    double       start = static_cast<double>( tp.StartTime().count() ) * Tick;
                    tl.positionSec = static_cast<double>( tp.Position().count() ) * Tick - start;
                    tl.durationSec = static_cast<double>( tp.EndTime().count() ) * Tick - start;
                    tl.playing = ( pi.PlaybackStatus()
                                   == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing );
                    tl.stampMs = QDateTime::currentMSecsSinceEpoch();
                }
            }
        }
        catch ( ... )
        { /* no session / API error -> leave empty */
        }

        // No SMTC session?  Try the VLC window-title fallback.
        if ( t.isEmpty() )
        {
            VlcScan scan;
            EnumWindows( vlcEnumProc, reinterpret_cast<LPARAM>( &scan ) );
            if ( !scan.text.empty() )
                parseVlcTitle( scan.text, t, a );
        }

        // The RAW SMTC value of this poll stays untouched in `raw` - `tl` is
        // the version that is published at the end.
        const Timeline raw = tl;
        const bool     ist_neuer_track = !t.isEmpty() && ( t != prev_title );

        if ( ist_neuer_track )
        {
            // NEW track: right after a change, SMTC sometimes still delivers
            // the position of the PREVIOUS title for 1-2 polls (the OS has not
            // updated the property yet) - exactly that caused the reported
            // "jump in two steps": first the wrong old position, shortly after
            // the correction to the real one.  A fixed threshold ("must be
            // near 0") would be wrong, though - a track can quite legitimately
            // begin with a large position, e.g. when the app is started only
            // IN THE MIDDLE of the song.  Therefore every report is published
            // only once the NEXT one confirms it (see below); until then the
            // caller uses its own local clock since the change (position < 0).
            track_change_ms = raw.stampMs;
            pos_confirmed = false;
            candidate = raw;
            tl.positionSec = -1.0;
        }
        else if ( !pos_confirmed && raw.positionSec >= 0.0 && candidate.positionSec >= 0.0 )
        {
            // Sliding window (not just "1st vs. 2nd report"): does THIS report
            // match the PREVIOUS one (within normal playing time, < 0.6s off -
            // clearly tighter than the ~1s poll interval, so that two equally
            // FROZEN old values do not wrongly pass as "consistent")?  Then
            // both confirm each other - from now on we trust the course.  If
            // it does NOT match, IT becomes the new candidate for the next
            // comparison (it may be stale too - only two SUCCESSIVE reports
            // that match each other count as safe).
            const double erwartet = candidate.positionSec
                                    + static_cast<double>( raw.stampMs - candidate.stampMs ) * 0.001;
            if ( std::fabs( raw.positionSec - erwartet ) < 0.6 )
                pos_confirmed = true;
            else
            {
                fprintf( stderr, "[NowPlaying] Settle: Meldung (%.1fs) passt nicht zur vorherigen "
                                 "(%.1fs erwartet) - noch %.1fs seit Trackwechsel, warte weiter\n",
                         raw.positionSec, erwartet, static_cast<double>( raw.stampMs - track_change_ms ) * 0.001 );
                candidate = raw;
                tl.positionSec = -1.0;
            }
        }
        else if ( pos_confirmed && prev_tl.positionSec >= 0.0 && prev_tl.playing
                  && tl.playing == prev_tl.playing )
        {
            // MONOTONIC position update (confirmed track, unchanged and
            // playing): SMTC often updates the position only every few
            // seconds, and the fresh value almost always lies a little off our
            // own extrapolation.  Earlier versions took part of the difference
            // as a POSITION step - every poll thus caused a small jump (even
            // backwards!), visible as a hopping scroll and as a karaoke flip to
            // the previous line when the step back crossed a line boundary.
            // Now the position stays exactly on the extrapolation (continuous,
            // monotonic) and the difference goes into the RATE instead: with
            // up to ±15% tempo adjustment the display glides imperceptibly onto
            // SMTC's timeline instead of jumping.  Only a real seek (>1.5s) is
            // still taken over at once as a jump (rate back to 1).
            const double erwartet = prev_tl.positionSec
                                    + static_cast<double>( tl.stampMs - prev_tl.stampMs ) * 0.001
                                          * prev_tl.rate;
            const double abweichung = tl.positionSec - erwartet;
            if ( std::fabs( abweichung ) < 1.5 )
            {
                tl.positionSec = erwartet;
                double r = 1.0 + abweichung * 0.15;
                tl.rate = ( r < 0.85 ) ? 0.85 : ( r > 1.15 ? 1.15 : r );
            }
            // else: echter Seek - roher Wert + rate 1.0 (Default) bleiben.
        }
        prev_tl = tl;
        prev_title = t;

        if ( t == pending_title && a == pending_artist )
        {
            published_title = t;
            published_artist = a;
        }
        else
        {
            pending_title = t;
            pending_artist = a;
            // published_title/published_artist stay at the last CONFIRMED
            // value this poll -- see the declaration comment above.
        }

        {
            QMutexLocker l( &m_mutex );
            m_title = published_title;
            m_artist = published_artist;
            m_timeline = tl;
        }

        // ~1 s poll, but wake every 100 ms so stop() is responsive.
        for ( int i = 0; i < 10 && m_running; ++i )
            std::this_thread::sleep_for( std::chrono::milliseconds( 100 ) );
    }

    if ( inited )
        try
        {
            winrt::uninit_apartment();
        }
        catch ( ... )
        {
        }
#endif // _WIN32
}
