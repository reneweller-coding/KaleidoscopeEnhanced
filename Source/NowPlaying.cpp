// C++/WinRT's await adapters pull in <experimental/coroutine> under C++17, which
// MSVC now flags as deprecated.  We only block on the async results with .get()
// (no real coroutines), so silence it.
#define _SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS
#define _SILENCE_CLANG_COROUTINE_MESSAGE

#include "NowPlaying.h"

#include <QtCore/QDateTime>

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
namespace {
struct VlcScan { std::wstring text; };

BOOL CALLBACK vlcEnumProc(HWND hwnd, LPARAM lp)
{
    if (!IsWindowVisible(hwnd)) return TRUE;
    wchar_t buf[512];
    int n = GetWindowTextW(hwnd, buf, 512);
    if (n <= 0) return TRUE;
    std::wstring s(buf, size_t(n));
    static const std::wstring suffix = L" - VLC media player";
    if (s.size() > suffix.size()
        && _wcsicmp(s.c_str() + (s.size() - suffix.size()), suffix.c_str()) == 0)
    {
        reinterpret_cast<VlcScan*>(lp)->text = s.substr(0, s.size() - suffix.size());
        return FALSE;                       // found - stop enumerating
    }
    return TRUE;
}

// "<artist> - <title>" metadata split + filename cleanup (drop the extension,
// underscores become spaces) so a raw file name still reads like a title.
void parseVlcTitle(const std::wstring &raw, QString &title, QString &artist)
{
    QString w = QString::fromStdWString(raw).trimmed();
    if (w.isEmpty()) return;

    static const char *exts[] = { ".mp3", ".flac", ".m4a", ".ogg", ".opus",
                                  ".wav", ".wma", ".aac", ".mp4", ".mkv",
                                  ".avi", ".webm", ".mov" };
    for (const char *ext : exts)
        if (w.endsWith(QString::fromLatin1(ext), Qt::CaseInsensitive))
        {
            w.chop(int(strlen(ext)));
            break;
        }
    w.replace(QChar('_'), QChar(' '));

    int cut = w.indexOf(" - ");
    if (cut > 0)
    {
        artist = w.left(cut).trimmed();
        title  = w.mid(cut + 3).trimmed();
    }
    else
        title = w;
}
}

NowPlaying::NowPlaying() {}

NowPlaying::~NowPlaying()
{
    stop();
    if (m_thread.joinable())
        m_thread.join();
}

void NowPlaying::start()
{
    if (m_running) return;
    m_running = true;
    m_thread = std::thread(&NowPlaying::threadFunc, this);
}

void NowPlaying::stop()
{
    m_running = false;
}

QString NowPlaying::title() const  { QMutexLocker l(&m_mutex); return m_title; }
QString NowPlaying::artist() const { QMutexLocker l(&m_mutex); return m_artist; }

NowPlaying::Timeline NowPlaying::timeline() const
{
    QMutexLocker l(&m_mutex);
    return m_timeline;
}

double NowPlaying::positionNowSec() const
{
    Timeline tl = timeline();
    if (tl.positionSec < 0.0)
        return -1.0;
    if (!tl.playing)
        return tl.positionSec;
    const qint64 nowMs = QDateTime::currentMSecsSinceEpoch();
    double p = tl.positionSec + double(nowMs - tl.stampMs) * 0.001;
    if (tl.durationSec > 0.0 && p > tl.durationSec)
        p = tl.durationSec;
    return p;
}

void NowPlaying::threadFunc()
{
    // WinRT must be initialised per-thread.  SMTC works in the multi-threaded
    // apartment, where blocking on the async results with .get() is allowed.
    bool inited = false;
    try { winrt::init_apartment(winrt::apartment_type::multi_threaded); inited = true; }
    catch (...) { /* already initialised on this thread is fine */ }

    while (m_running)
    {
        QString t, a;
        Timeline tl;
        try
        {
            auto mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();
            if (mgr)
            {
                auto session = mgr.GetCurrentSession();
                if (session)
                {
                    auto props = session.TryGetMediaPropertiesAsync().get();
                    t = QString::fromWCharArray(props.Title().c_str());
                    a = QString::fromWCharArray(props.Artist().c_str());

                    // Zeitachse für den Lyrics-Sync.  TimeSpan zählt in
                    // 100-ns-Ticks; StartTime abziehen (Streams starten
                    // nicht immer bei 0).
                    auto tp  = session.GetTimelineProperties();
                    auto pi  = session.GetPlaybackInfo();
                    const double kTick = 1e-7;
                    double start = double(tp.StartTime().count()) * kTick;
                    tl.positionSec = double(tp.Position().count()) * kTick - start;
                    tl.durationSec = double(tp.EndTime().count())  * kTick - start;
                    tl.playing = (pi.PlaybackStatus()
                        == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing);
                    tl.stampMs = QDateTime::currentMSecsSinceEpoch();
                }
            }
        }
        catch (...) { /* no session / API error -> leave empty */ }

        // No SMTC session?  Try the VLC window-title fallback.
        if (t.isEmpty())
        {
            VlcScan scan;
            EnumWindows(vlcEnumProc, reinterpret_cast<LPARAM>(&scan));
            if (!scan.text.empty())
                parseVlcTitle(scan.text, t, a);
        }

        { QMutexLocker l(&m_mutex); m_title = t; m_artist = a; m_timeline = tl; }

        // ~1 s poll, but wake every 100 ms so stop() is responsive.
        for (int i = 0; i < 10 && m_running; ++i)
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    if (inited)
        try { winrt::uninit_apartment(); } catch (...) {}
}
