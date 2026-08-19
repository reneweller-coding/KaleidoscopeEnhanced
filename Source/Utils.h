/**
 * @file Utils.h
 * @brief Misc small helper utilities used across the engine: a nanosecond-resolution
 *        timer (NanoTimer) and a QImage helper used to prepare textures.
 */

#ifndef UTILS_H
#define UTILS_H

#include <QtGui/QImage>

/**
 * @brief High-resolution wall-clock stopwatch (nanosecond-scale, Windows QPC backed).
 *
 * Wraps the Windows high-performance counter (QueryPerformanceCounter/Frequency) to
 * measure elapsed wall-clock time. The reported unit is always nanoseconds, though the
 * actual resolution depends on whether a high-frequency counter is available (checked
 * once, lazily, the first time a NanoTimer is constructed). If no high-frequency counter
 * exists the readings are bogus/coarse rather than failing outright.
 */
class NanoTimer
{
public:

	NanoTimer(); ///< Constructs the timer, lazily checking the counter frequency once, and calls start().

	/**
	 * @brief Resets the timer's reference point to the current time.
	 */
	void start( void );
	/**
	 * @brief Returns the time elapsed since the last start() call.
	 * @return Elapsed time in nanoseconds (scaled by the measured counter frequency
	 *         when a high-frequency counter is in use, otherwise raw counter ticks).
	 */
	double elapsed( void ) const;

	/**
	 * @brief Reports whether the high-frequency hardware counter is being used.
	 * @return True if QueryPerformanceFrequency succeeded; valid only after the first
	 *         NanoTimer has been constructed.
	 */
	static bool usesHighFrequ( void );
	/**
	 * @brief Returns the measured counter frequency.
	 * @return Frequency in GHz; valid only when usesHighFrequ() is true.
	 */
	static double frequ( void );

private:

	unsigned long long int m_time_stamp; ///< Timestamp (counter ticks) captured by the last start().

	static bool		M_Use_High_Frequ;		///< True once checkFrequency() found a usable high-frequency counter.
	static double	M_GHz;					///< Measured counter frequency in GHz (or a fallback of 0.001 if unavailable).
	static bool		M_FrequencyChecked;		///< Guards checkFrequency() so it only runs once, on first construction.

	/**
	 * @brief Reads the raw hardware counter value.
	 * @return Current QueryPerformanceCounter tick count. Meaning depends on M_Use_High_Frequ.
	 */
	static long long unsigned int getTimeStamp( void );
	/**
	 * @brief Determines the CPU/counter frequency once and caches it in M_GHz / M_Use_High_Frequ.
	 */
	static void checkFrequency( void );
};

/**
 * @brief Converts an arbitrary QImage into the format used for OpenGL textures.
 *
 * Converts to Format_ARGB32, swaps the byte order (rgbSwapped) to match GL's expected
 * channel layout, and scales it down to at most 1024x1024.
 * @param image Source image to convert.
 * @return A new QImage ready to be uploaded as a texture.
 */
QImage prepareImage( const QImage &image);

#endif