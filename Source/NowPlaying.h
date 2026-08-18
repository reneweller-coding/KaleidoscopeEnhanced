/**
 * @file NowPlaying.h
 * @brief Reads the currently-playing track title/artist from the OS media session (with a VLC fallback) for the title-reveal overlay.
 */
#pragma once

#include <QtCore/QMutex>
#include <QtCore/QString>
#include <thread>
#include <atomic>

/**
 * @brief Background poller that publishes the OS-wide "now playing" track title/artist and timeline.
 *
 * Polls the Windows "now playing" media session (System Media Transport Controls) for the
 * currently playing track's title / artist from ANY app (Spotify, browser, foobar2000, …) and
 * publishes them thread-safely.
 *
 * Uses C++/WinRT (GlobalSystemMediaTransportControlsSessionManager). Runs in its own std::thread
 * and degrades silently to empty strings if the API or a session is unavailable, so it never
 * affects the visualizer otherwise.
 */
class NowPlaying
{
public:
    /** @brief Constructs the object without starting the polling thread; call start() to begin polling. */
    NowPlaying();
    /** @brief Stops the polling thread and joins it. */
    ~NowPlaying();

    /** @brief Starts the background polling thread, if not already running. */
    void start();
    /** @brief Signals the background polling thread to exit (asynchronous; does not join — see the destructor). */
    void stop();

    /**
     * @brief The most recently published track title.
     * @return The title, thread-safely copied; empty if unknown or no session/fallback matched.
     */
    QString title()  const;
    /**
     * @brief The most recently published track artist.
     * @return The artist, thread-safely copied; empty if unknown.
     */
    QString artist() const;

    /**
     * @brief Playback-Zeitachse der SMTC-Session (für Lyrics-Sync).
     *
     * Viele Player melden die Position nur alle paar Sekunden - positionNowSec()
     * extrapoliert deshalb mit der lokalen Uhr, solange playing gilt.
     */
    struct Timeline
    {
        double positionSec = -1.0;   ///< Sekunden in den Track; <0 = unbekannt (noch nicht bestätigt, siehe threadFunc()).
        double durationSec = 0.0;    ///< Gesamtlänge des Tracks in Sekunden; 0 = unbekannt.
        bool   playing     = false;  ///< true, wenn die Session "Playing" meldet (nicht pausiert/gestoppt).
        qint64 stampMs     = 0;      ///< Lokale Uhr (QDateTime::currentMSecsSinceEpoch) beim Erfassen dieser Momentaufnahme.
        /**
         * @brief Extrapolations-RATE statt Positions-Sprüngen.
         *
         * Abweichungen zwischen SMTC und eigener Hochrechnung werden als leicht veränderte
         * Laufgeschwindigkeit ausgeglichen (Gleiten). Die veröffentlichte Position ist dadurch
         * MONOTON - sie läuft nie rückwärts, was vorher Karaoke kurz in die Vorzeile flippen und
         * den Scroll hüpfen ließ.
         */
        double rate        = 1.0;
    };
    /**
     * @brief The most recently published playback timeline snapshot.
     * @return A thread-safe copy of the current Timeline.
     */
    Timeline timeline() const;
    /**
     * @brief The current playback position extrapolated to "now" via the local clock and Timeline::rate.
     * @return Seconds into the track (clamped to durationSec when known), or <0 if the position is unknown/unconfirmed.
     */
    double   positionNowSec() const;

private:
    /** @brief Body of the background polling thread: SMTC query, VLC-window-title fallback, and position-settling/smoothing logic. */
    void threadFunc();

    mutable QMutex     m_mutex;              ///< Guards all published state below against concurrent access from threadFunc() and the accessor methods.
    QString            m_title;              ///< Last published track title.
    QString            m_artist;             ///< Last published track artist.
    Timeline           m_timeline;           ///< Last published playback timeline snapshot.
    std::atomic<bool>  m_running { false };  ///< Set true by start(), false by stop(); polled by threadFunc() as its run condition.
    std::thread        m_thread;             ///< The background polling thread started by start() and joined by the destructor.
};
