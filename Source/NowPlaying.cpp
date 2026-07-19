// C++/WinRT's await adapters pull in <experimental/coroutine> under C++17, which
// MSVC now flags as deprecated.  We only block on the async results with .get()
// (no real coroutines), so silence it.
#define _SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS
#define _SILENCE_CLANG_COROUTINE_MESSAGE

#include "NowPlaying.h"

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.Control.h>

using namespace winrt;
using namespace winrt::Windows::Media::Control;

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
                }
            }
        }
        catch (...) { /* no session / API error -> leave empty */ }

        { QMutexLocker l(&m_mutex); m_title = t; m_artist = a; }

        // ~1 s poll, but wake every 100 ms so stop() is responsive.
        for (int i = 0; i < 10 && m_running; ++i)
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    if (inited)
        try { winrt::uninit_apartment(); } catch (...) {}
}
