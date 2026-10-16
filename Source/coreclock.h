//---------------------------------------------------------------------------
//                              coreclock
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  The engine clock (wall time in a live show, frame time in a video export) and WallClock, the Qt-free stopwatch
 *  on top of it that replaced QElapsedTimer in the render core (Task 5, RendererCore preparation).
 *
 *  @author René Weller
 */

#ifndef CORECLOCK_H
#define CORECLOCK_H

#include <atomic>
#include <chrono>
#include <cmath>

/** @class EngineClock
 *
 * The clock every engine timer reads: the steady wall clock in a live show, the frame clock in a video export.
 *
 * A live show measures what the viewer actually watched, so its timers (scene solos and fades, the photo
 * cross-fade, the parameter interpolators, the lab walk, the 3D flight) run on wall time. A video export cannot:
 * it renders faster or slower than real time, and every frame has to show exactly one frame period more of the
 * show than the one before -- otherwise a slow frame (a shader compile, a model upload) would be a visible
 * jump in the video, and a fast one a frozen picture. So those timers read this clock instead of
 * std::chrono::steady_clock, and the export switches it to virtual time (startVirtual()) and sets it frame by
 * frame (setVirtualSeconds()).
 *
 * The time_point type is steady_clock's own, and virtual time begins at the wall-clock moment of the switch, so
 * every time point taken before the switch stays comparable with the ones after it. Timers that measure real
 * cost -- compile and upload times in the logs, pacing of background builds -- keep reading steady_clock.
 **/
class EngineClock
{
public:
    using duration = std::chrono::steady_clock::duration;     ///< The steady clock's own tick (nanoseconds on MSVC).
    using rep = duration::rep;                                ///< Arithmetic type of a tick count.
    using period = duration::period;                          ///< Tick length as a std::ratio of seconds.
    using time_point = std::chrono::steady_clock::time_point; ///< steady_clock's point type: freely mixable.
    static constexpr bool is_steady = true;                   ///< Never runs backwards, in either mode.

    /**  The current engine time.
     *
     * @return
     *   steady_clock::now() in a live show; the time last set by setVirtualSeconds() in an export.
     **/
    static time_point now() noexcept
    {
        if ( s_virtual.load( std::memory_order_acquire ) )
            return time_point( duration( s_ticks.load( std::memory_order_relaxed ) ) );
        return std::chrono::steady_clock::now();
    }

    /**  Switches to virtual time: from now on the clock stands still until setVirtualSeconds() moves it.
     *
     * The origin is the wall-clock moment of this call, so time points taken earlier keep their meaning. Called
     * once, by the video export, before its first frame.
     **/
    static void startVirtual() noexcept
    {
        const rep origin = std::chrono::steady_clock::now().time_since_epoch().count();
        s_origin.store( origin, std::memory_order_relaxed );
        s_ticks.store( origin, std::memory_order_relaxed );
        s_epochOrigin.store( std::chrono::duration<double>( std::chrono::system_clock::now().time_since_epoch() )
                                 .count(),
                             std::memory_order_relaxed );
        s_virtual.store( true, std::memory_order_release );
    }

    /**  Sets the virtual time to @p seconds after the origin of startVirtual().
     *
     * @param seconds  Show time of the frame about to be rendered, in seconds. (in)
     *
     * Set from the frame index (frame / fps), not advanced by adding a rounded period each frame, so an hour of
     * video does not accumulate rounding drift.
     **/
    static void setVirtualSeconds( double seconds ) noexcept
    {
        const rep off = static_cast<rep>( std::llround( seconds * static_cast<double>( period::den )
                                                        / static_cast<double>( period::num ) ) );
        s_ticks.store( s_origin.load( std::memory_order_relaxed ) + off, std::memory_order_relaxed );
    }

    /**  Whether the clock runs on virtual (frame) time.
     *
     * @return
     *   true during a video export.
     **/
    static bool isVirtual() noexcept { return s_virtual.load( std::memory_order_acquire ); }

    /**  Calendar time in seconds since the Unix epoch, on the engine clock.
     *
     * @return
     *   system_clock's time in a live show; in an export the calendar time of startVirtual() plus the virtual time
     *   since, so a stamp the show keeps (the class memory) ages with the show rather than with the render.
     **/
    static double epochSeconds() noexcept
    {
        if ( !isVirtual() )
            return std::chrono::duration<double>( std::chrono::system_clock::now().time_since_epoch() ).count();
        const duration since( s_ticks.load( std::memory_order_relaxed ) - s_origin.load( std::memory_order_relaxed ) );
        return s_epochOrigin.load( std::memory_order_relaxed ) + std::chrono::duration<double>( since ).count();
    }

private:
    inline static std::atomic<bool>   s_virtual{ false };   ///< Virtual (frame) time instead of the wall clock.
    inline static std::atomic<rep>    s_origin{ 0 };        ///< Tick count of the switch to virtual time.
    inline static std::atomic<rep>    s_ticks{ 0 };         ///< The virtual time as a steady_clock tick count.
    inline static std::atomic<double> s_epochOrigin{ 0.0 }; ///< Calendar seconds at the switch (epochSeconds()).
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    EngineClock( const EngineClock & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    EngineClock &operator=( const EngineClock & ) = delete;
};

/** @class WallClock
 *
 * Stopwatch with millisecond elapsed() readout, matching QElapsedTimer's semantics, on the engine clock.
 *
 * Constructed already started (m_t0 = now()); start()/restart() reset the reference point and elapsed() reports
 * milliseconds since then. It reads EngineClock, so in a video export it measures show time, not wall time --
 * which is what the interpolators and state machines built on it are about.
 **/
class WallClock
{
public:
    /** Constructs the clock, starting it immediately. */
    WallClock()
        : m_t0( EngineClock::now() )
    {
    }
    /** Resets the reference point to now. */
    void start() { m_t0 = EngineClock::now(); }
    /** Alias for start(), matching QElapsedTimer's API. */
    void restart() { start(); }
    /**  Milliseconds since start() - like QElapsedTimer::elapsed().
     *
     * @return
     *   Elapsed time in milliseconds since the last start()/restart().
     **/
    long long elapsed() const
    {
        return std::chrono::duration_cast<std::chrono::milliseconds>( EngineClock::now() - m_t0 ).count();
    }

private:
    EngineClock::time_point m_t0; ///< Reference time point set by the constructor / start() / restart().
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    WallClock( const WallClock & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    WallClock &operator=( const WallClock & ) = delete;
};

#endif
