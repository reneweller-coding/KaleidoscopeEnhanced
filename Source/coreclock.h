/**
 * @file coreclock.h
 * @brief Qt-free drop-in replacement for QElapsedTimer, used in the render core
 *        (Task 5, RendererCore preparation) so that code can be Qt-free.
 */

#ifndef CORECLOCK_H
#define CORECLOCK_H

// Qt-freier Drop-in-Ersatz für QElapsedTimer im Render-Kern (Task 5,
// RendererCore-Vorbereitung): gleiche Semantik - Wanduhr, elapsed() in
// Millisekunden - über std::chrono::steady_clock.

#include <chrono>

/**
 * @brief Wall-clock stopwatch with millisecond elapsed() readout, matching
 *        QElapsedTimer's semantics but built purely on std::chrono::steady_clock.
 *
 * Constructed already started (m_t0 = now()); start()/restart() reset the reference
 * point and elapsed() reports milliseconds since then. Used where the render core
 * needs timing without depending on Qt.
 */
class WallClock
{
public:
	WallClock() : m_t0( std::chrono::steady_clock::now() ) {} ///< Constructs the clock, starting it immediately.
	void start()   { m_t0 = std::chrono::steady_clock::now(); } ///< Resets the reference point to now.
	void restart() { start(); } ///< Alias for start(), matching QElapsedTimer's API.
	/**
	 * @brief Milliseconds since start() - wie QElapsedTimer::elapsed().
	 * @return Elapsed time in milliseconds since the last start()/restart().
	 */
	long long elapsed() const
	{
		return std::chrono::duration_cast<std::chrono::milliseconds>(
		           std::chrono::steady_clock::now() - m_t0 ).count();
	}
private:
	std::chrono::steady_clock::time_point m_t0; ///< Reference time point set by the constructor / start() / restart().
};

#endif
