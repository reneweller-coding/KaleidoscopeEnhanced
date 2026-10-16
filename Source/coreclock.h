//---------------------------------------------------------------------------
//                              coreclock
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Qt-free drop-in replacement for QElapsedTimer, used in the render core (Task 5, RendererCore preparation) so
 *  that code can be Qt-free.
 *
 *  @author René Weller
 */

#ifndef CORECLOCK_H
#define CORECLOCK_H

// Qt-free drop-in replacement for QElapsedTimer in the render core (task 5,
// RendererCore preparation): the same semantics - wall clock, elapsed() in
// milliseconds - via std::chrono::steady_clock.

#include <chrono>

/** @class WallClock
 *
 * Wall-clock stopwatch with millisecond elapsed() readout, matching QElapsedTimer's semantics but built purely on
 * std::chrono::steady_clock.
 *
 * Constructed already started (m_t0 = now()); start()/restart() reset the reference
 * point and elapsed() reports milliseconds since then. Used where the render core
 * needs timing without depending on Qt.
 **/
class WallClock
{
public:
    /** Constructs the clock, starting it immediately. */
    WallClock()
        : m_t0( std::chrono::steady_clock::now() )
    {
    }
    /** Resets the reference point to now. */
    void start() { m_t0 = std::chrono::steady_clock::now(); }
    /** Alias for start(), matching QElapsedTimer's API. */
    void restart() { start(); }
    /**  Milliseconds since start() - like QElapsedTimer::elapsed().
     *
     * @return
     *   Elapsed time in milliseconds since the last start()/restart().
     **/
    long long elapsed() const
    {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
                   std::chrono::steady_clock::now() - m_t0 )
            .count();
    }

private:
    std::chrono::steady_clock::time_point m_t0; ///< Reference time point set by the constructor / start() / restart().
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
