#pragma once

#include <QtCore/QMutex>
#include <QtCore/QString>
#include <thread>
#include <atomic>

/**
 * NowPlaying
 * ---------------------------------------------------------------------------
 * Polls the Windows "now playing" media session (System Media Transport
 * Controls) for the currently playing track's title / artist from ANY app
 * (Spotify, browser, foobar2000, …) and publishes them thread-safely.
 *
 * Uses C++/WinRT (GlobalSystemMediaTransportControlsSessionManager).  Runs in
 * its own std::thread and degrades silently to empty strings if the API or a
 * session is unavailable, so it never affects the visualizer otherwise.
 * ---------------------------------------------------------------------------
 */
class NowPlaying
{
public:
    NowPlaying();
    ~NowPlaying();

    void start();
    void stop();

    QString title()  const;
    QString artist() const;

private:
    void threadFunc();

    mutable QMutex     m_mutex;
    QString            m_title;
    QString            m_artist;
    std::atomic<bool>  m_running { false };
    std::thread        m_thread;
};
