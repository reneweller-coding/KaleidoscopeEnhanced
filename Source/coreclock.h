#ifndef CORECLOCK_H
#define CORECLOCK_H

// Qt-freier Drop-in-Ersatz für QElapsedTimer im Render-Kern (Task 5,
// RendererCore-Vorbereitung): gleiche Semantik - Wanduhr, elapsed() in
// Millisekunden - über std::chrono::steady_clock.

#include <chrono>

class WallClock
{
public:
	WallClock() : m_t0( std::chrono::steady_clock::now() ) {}
	void start()   { m_t0 = std::chrono::steady_clock::now(); }
	void restart() { start(); }
	/** Millisekunden seit start() - wie QElapsedTimer::elapsed(). */
	long long elapsed() const
	{
		return std::chrono::duration_cast<std::chrono::milliseconds>(
		           std::chrono::steady_clock::now() - m_t0 ).count();
	}
private:
	std::chrono::steady_clock::time_point m_t0;
};

#endif
