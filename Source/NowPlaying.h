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

    /** Playback-Zeitachse der SMTC-Session (für Lyrics-Sync).  Viele Player
     *  melden die Position nur alle paar Sekunden - positionNowSec()
     *  extrapoliert deshalb mit der lokalen Uhr, solange playing gilt. */
    struct Timeline
    {
        double positionSec = -1.0;   // <0 = unbekannt
        double durationSec = 0.0;
        bool   playing     = false;
        qint64 stampMs     = 0;      // lokale Uhr beim Erfassen
    };
    Timeline timeline() const;
    double   positionNowSec() const;   // extrapoliert; <0 = unbekannt

private:
    void threadFunc();

    mutable QMutex     m_mutex;
    QString            m_title;
    QString            m_artist;
    Timeline           m_timeline;
    std::atomic<bool>  m_running { false };
    std::thread        m_thread;
};
