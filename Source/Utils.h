//---------------------------------------------------------------------------
//                              Utils
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Misc small helper utilities used across the engine: a nanosecond-resolution timer (NanoTimer) and a QImage
 *  helper used to prepare textures.
 *
 *  @author René Weller
 */

#ifndef UTILS_H
#define UTILS_H

#include <QtGui/QImage>

/** @class NanoTimer
 *
 * High-resolution wall-clock stopwatch (nanosecond-scale, Windows QPC backed).
 *
 * Wraps the Windows high-performance counter (QueryPerformanceCounter/Frequency) to
 * measure elapsed wall-clock time. The reported unit is always nanoseconds, though the
 * actual resolution depends on whether a high-frequency counter is available (checked
 * once, lazily, the first time a NanoTimer is constructed). If no high-frequency counter
 * exists the readings are bogus/coarse rather than failing outright.
 **/
class NanoTimer
{
public:
    /** Constructs the timer, lazily checking the counter frequency once, and calls start(). */
    NanoTimer();

    /** Resets the timer's reference point to the current time. */
    void start( void );
    /**  Returns the time elapsed since the last start() call.
     *
     * @return
     *   Elapsed time in nanoseconds (scaled by the measured counter frequency when a high-frequency counter is in
     *   use, otherwise raw counter ticks). Elapsed nanoseconds (or raw counter ticks if no high-frequency counter).
     **/
    double elapsed( void ) const;

    /**  Reports whether the high-frequency hardware counter is being used.
     *
     * @return
     *   True if QueryPerformanceFrequency succeeded; valid only after the first NanoTimer has been constructed.
     *   True if the high-frequency counter path is active.
     **/
    static bool usesHighFrequ( void );
    /**  Returns the measured counter frequency.
     *
     * @return
     *   Frequency in GHz; valid only when usesHighFrequ() is true. Counter frequency in GHz.
     **/
    static double frequ( void );

private:
    unsigned long long int m_timeStamp; ///< Timestamp (counter ticks) captured by the last start().

    static bool   M_UseHighFrequ;     ///< True once checkFrequency() found a usable high-frequency counter.
    static double M_GHz;              ///< Measured counter frequency in GHz (or a fallback of 0.001 if unavailable).
    static bool   M_FrequencyChecked; ///< Guards checkFrequency() so it only runs once, on first construction.

    /**  Reads the raw hardware counter value.
     *
     * @return
     *   Current QueryPerformanceCounter tick count. Meaning depends on M_UseHighFrequ. Raw QueryPerformanceCounter
     *   tick count.
     **/
    static long long unsigned int getTimeStamp( void );
    /**  Determines the CPU/counter frequency once and caches it in M_GHz / M_UseHighFrequ.
     *
     * @sideeffects
     *   Changes M_FrequencyChecked, M_GHz, M_UseHighFrequ.
     **/
    static void checkFrequency( void );

private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    NanoTimer( const NanoTimer & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    NanoTimer &operator=( const NanoTimer & ) = delete;
};

/**  Converts an arbitrary QImage into the format used for OpenGL textures.
 *
 * @param image  Source image to convert. (in)
 *
 * @return
 *   A new QImage ready to be uploaded as a texture.
 *
 * Converts to Format_ARGB32, swaps the byte order (rgbSwapped) to match GL's expected
 * channel layout, and scales it down to at most 1024x1024.
 **/
QImage prepareImage( const QImage &image );

#endif
