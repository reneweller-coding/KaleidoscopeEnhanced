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

    // Laufende Basislinie für die Drift-Korrektur unten (bleibt auf DIESEM
    // Thread, kein Lock nötig - nur der veröffentlichte m_timeline braucht ihn).
    Timeline prev_tl;
    QString  prev_title;
    qint64   track_change_ms = 0;   // wann WIR den aktuellen Titel erkannt haben
    bool     pos_confirmed = false; // erst TRUE, sobald zwei Meldungen zueinander passen
    Timeline candidate;             // erste (noch unbestätigte) Meldung des neuen Tracks

    // Titel-Bestätigung (analog zur Positions-Bestätigung oben, aber bisher
    // NIE existiert): der publizierte Titel wechselt erst, wenn zwei
    // aufeinanderfolgende Polls dasselbe (Titel,Artist)-Paar liefern. Ohne
    // das löste ein einzelner falscher/leerer SMTC-Read (OS liefert kurz
    // eine stale oder leere Property, üblich rund um Play/Pause-Flackern
    // oder App-interne Übergänge) in glwidget.cpp einen kompletten
    // "neuer Track"-Reset aus - PLL neu aufgesetzt, Lyrics+Künstlerbild neu
    // geladen, Scroll auf 0 - und der NÄCHSTE Poll (SMTC korrigiert sich
    // von selbst) kehrte das wieder um: ein einzelner Ausreißer wurde so zu
    // ZWEI sichtbaren Sprüngen. Trifft nur das PUBLIZIERTE m_title/m_artist;
    // ist_neuer_track/die Positions-Bestätigung unten bleiben unverändert auf
    // dem rohen `t` (ein spuriges ist_neuer_track=true bei einem Titel-Blip
    // ist harmlos - es liefert höchstens kurz positionSec=-1, und der
    // Aufrufer fällt dafür schon auf seine eigene Uhr zurück).
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

                    // Zeitachse für den Lyrics-Sync.  TimeSpan zählt in
                    // 100-ns-Ticks; StartTime abziehen (Streams starten
                    // nicht immer bei 0).
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

        // Der ROHE SMTC-Wert dieses Polls bleibt unangetastet in `raw` -
        // `tl` ist die Version, die am Ende veröffentlicht wird.
        const Timeline raw = tl;
        const bool     ist_neuer_track = !t.isEmpty() && ( t != prev_title );

        if ( ist_neuer_track )
        {
            // NEUER Track: SMTC liefert direkt nach einem Wechsel manchmal
            // noch 1-2 Polls lang die Position des VORHERIGEN Titels (das OS
            // hat die Property noch nicht aktualisiert) - genau das erzeugte
            // den gemeldeten "Sprung in zwei Stufen": erst die falsche
            // Alt-Position, kurz danach die Korrektur auf die echte. EIN
            // fixer Schwellwert ("muss nahe 0 sein") wäre aber falsch - ein
            // Track kann völlig legitim mit einer großen Position beginnen,
            // z.B. wenn die App erst MITTEN im Song gestartet wird. Deshalb:
            // jede Meldung wird erst veröffentlicht, sobald sie von der
            // NÄCHSTEN bestätigt wird (siehe unten); bis dahin nutzt der
            // Aufrufer seine eigene lokale Uhr seit dem Wechsel (Position < 0).
            track_change_ms = raw.stampMs;
            pos_confirmed = false;
            candidate = raw;
            tl.positionSec = -1.0;
        }
        else if ( !pos_confirmed && raw.positionSec >= 0.0 && candidate.positionSec >= 0.0 )
        {
            // Gleitendes Fenster (nicht nur "1. vs. 2. Meldung"): passt DIESE
            // Meldung zu der VORHERIGEN (im Rahmen normaler Weiterspielzeit,
            // < 0.6s Abweichung - deutlich enger als der ~1s-Poll-Abstand,
            // damit zwei gleich EINGEFRORENE Alt-Werte nicht fälschlich als
            // "konsistent" durchgehen)? Dann bestätigen sich beide gegenseitig
            // - ab jetzt vertrauen wir dem Verlauf. Passt sie NICHT, wird SIE
            // selbst der neue Kandidat für den nächsten Vergleich (kann sein,
            // dass auch sie noch stale ist - erst zwei AUFEINANDERFOLGENDE,
            // zueinander passende Meldungen gelten als sicher).
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
            // MONOTONE Positions-Fortschreibung (bestätigter Track, laufend
            // unverändert): SMTC aktualisiert die Position oft nur alle paar
            // Sekunden, und der frische Wert liegt fast immer etwas neben
            // unserer eigenen Hochrechnung. Frühere Fassungen übernahmen einen
            // Teil der Abweichung als POSITIONS-Schritt - jeder Poll erzeugte
            // damit einen kleinen Sprung (auch rückwärts!), sichtbar als
            // hüpfender Scroll und als Karaoke-Flip in die Vorzeile, wenn der
            // Rückschritt eine Zeilengrenze kreuzte. Jetzt bleibt die Position
            // exakt auf der Hochrechnung (kontinuierlich, monoton) und die
            // Abweichung wird stattdessen in die LAUFRATE gelegt: bei bis zu
            // ±15% Tempo-Anpassung gleitet die Anzeige unmerklich auf SMTCs
            // Zeitachse zu, statt zu springen. Nur ein echter Seek (>1.5s)
            // wird weiterhin sofort als Sprung übernommen (Rate zurück auf 1).
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
