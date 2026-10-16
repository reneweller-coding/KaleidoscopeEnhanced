//---------------------------------------------------------------------------
//                              NowPlaying
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Reads the currently-playing track title/artist from the OS media session (with a VLC fallback) for the
 *  title-reveal overlay.
 *
 *  @author René Weller
 */

#pragma once

#include <QtCore/QMutex>
#include <QtCore/QString>
#include <thread>
#include <atomic>

/** @class NowPlaying
 *
 * Background poller that publishes the OS-wide "now playing" track title/artist and timeline.
 *
 * Polls the Windows "now playing" media session (System Media Transport Controls) for the
 * currently playing track's title / artist from ANY app (Spotify, browser, foobar2000, …) and
 * publishes them thread-safely.
 *
 * Uses C++/WinRT (GlobalSystemMediaTransportControlsSessionManager). Runs in its own std::thread
 * and degrades silently to empty strings if the API or a session is unavailable, so it never
 * affects the visualizer otherwise.
 **/
class NowPlaying
{
public:
    /** Constructs the object without starting the polling thread; call start() to begin polling. */
    NowPlaying();
    /** Stops the polling thread and joins it. */
    ~NowPlaying();

    /** Starts the background polling thread, if not already running. */
    void start();
    /** Signals the background polling thread to exit (asynchronous; does not join — see the destructor). */
    void stop();

    /**  The most recently published track title.
     *
     * @return
     *   The title, thread-safely copied; empty if unknown or no session/fallback matched.
     **/
    QString title() const;
    /**  The most recently published track artist.
     *
     * @return
     *   The artist, thread-safely copied; empty if unknown.
     **/
    QString artist() const;

    /** Playback timeline of the SMTC session (for the lyrics sync).
     *
     * Many players report the position only every few seconds - positionNowSec()
     * therefore extrapolates with the local clock while playing holds.
     **/
    struct Timeline
    {
        double positionSec = -1.0; ///< Seconds into the track; <0 = unknown (not confirmed yet, see
                                   ///< threadFunc()).
        double durationSec = 0.0;  ///< Total length of the track in seconds; 0 = unknown.
        bool   playing = false;    ///< true if the session reports "Playing" (not paused/stopped).
        qint64 stampMs = 0;        ///< Local clock (QDateTime::currentMSecsSinceEpoch) when this snapshot was taken.
        /** Extrapolation RATE instead of position jumps.
         *
         * Differences between SMTC and our own extrapolation are evened out as a slightly changed
         * playing speed (gliding).  The published position is thus MONOTONIC - it never runs
         * backwards, which used to flip karaoke briefly to the previous line and make the scroll hop.
         **/
        double rate = 1.0;
    };
    /**  The most recently published playback timeline snapshot.
     *
     * @return
     *   A thread-safe copy of the current Timeline.
     **/
    Timeline timeline() const;
    /**  The current playback position extrapolated to "now" via the local clock and Timeline::rate.
     *
     * @return
     *   Seconds into the track (clamped to durationSec when known), or <0 if the position is unknown/unconfirmed.
     **/
    double positionNowSec() const;

private:
    /**  Body of the background polling thread: SMTC query, VLC-window-title fallback, and position-settling/smoothing
     * logic.
     **/
    void threadFunc();

    mutable QMutex m_mutex; ///< Guards all published state below against concurrent access from threadFunc() and the
                            ///< accessor methods.
    QString           m_title;            ///< Last published track title.
    QString           m_artist;           ///< Last published track artist.
    Timeline          m_timeline;         ///< Last published playback timeline snapshot.
    std::atomic<bool> m_running{ false }; ///< Set true by start(), false by stop(); polled by threadFunc() as its run
                                          ///< condition.
    std::thread m_thread; ///< The background polling thread started by start() and joined by the destructor.
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    NowPlaying( const NowPlaying & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    NowPlaying &operator=( const NowPlaying & ) = delete;
};
