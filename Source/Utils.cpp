/**
 * @file Utils.cpp
 * @brief Implements NanoTimer (a Windows QueryPerformanceCounter-based nanosecond
 *        timer) and prepareImage() (QImage -> GL-texture-ready conversion).
 */

#include <stdlib.h>
#include <time.h>
#include <math.h>
#include <windows.h>
#include <stdio.h>

#include "glcore.h"        // GL types / functions (GLint, glGetIntegerv, ...)
#include <GL/gl.h>
#include "Utils.h"




/** @class NanoTimer
 *
 * @brief Timer with nanoseconds resolution.
 *
 * The units of this timer are always nanoseconds,
 * but on some platforms, the actual resolution might be less (microseconds or
 * even less).
 *
 * Where implemented, this class uses the high-speed, high-performance, hardware
 * timers/counters.
 * Otherwise, we just use @a gettimeofday(), which, at least on Linux/Pentium,
 * has microsecond resolution.
 *
 * Currently, the time is @e wall-clock time, not user time!
 *
 * @see
 * - http://www.ncsa.uiuc.edu/UserInfo/Resources/Hardware/IA32LinuxCluster/Doc/timing.html
 * - cedar.intel.com/software/idap/media/pdf/rdtscpm1.pdf
 * - /raphael/knowledge/programming/c/code-snippets/cpu_clock_timer.c
 *
 * @todo
 * - Try to estimate the overhead of a function call to start()
 *   or elapsed().
 * - Use PAPI (http://icl.cs.utk.edu/projects/papi/)
 *   or the "high resolution timers project"
 *   (http://high-res-timers.sourceforge.net/)
 *   when they become widely available (without kernel patches).
 *
 **/


/**
 * @brief Create a new timer with nanoseconds resolution.
 *
 * Saves the current time stamp, too.
 *
 * @note Side effects: see @a checkFrequency().
 *
 **/

NanoTimer::NanoTimer(void)
{
	if ( ! M_FrequencyChecked )
		checkFrequency();
	start();
}



/**
 * @brief Save the current time (stamp) in the timer.
 *
 **/

void NanoTimer::start( void )
{
	m_time_stamp = getTimeStamp();
}



/**
 * @brief Return the time elapsed since the last @a start() in nanoseconds.
 * @return Elapsed nanoseconds (or raw counter ticks if no high-frequency counter).
 *
 **/

double NanoTimer::elapsed( void ) const
{
	unsigned long long int now = getTimeStamp();
    //printf ( "%llu\t%llu\n", now, m_time_stamp );
	if ( M_Use_High_Frequ )
		return static_cast<double>(now - m_time_stamp) / ( M_GHz * 1000000.0 );
	else
    {
		return static_cast<double>(now - m_time_stamp);
    }
}



/**
 * @brief Return current time stamp.
 *
 * Should be used only internally by this class,
 * because the meaning of the return value is different depending on whether
 * @a M_Use_High_Frequ is true or not.
 *
 * @return Raw QueryPerformanceCounter tick count.
 *
 * @warning
 *   We don't check whether checkFrequency succeded!
 *   If it failed, the times will be bogus, or, in the worst case, the program
 *   might even crash.
 **/

long long unsigned int NanoTimer::getTimeStamp( void )
{
	LARGE_INTEGER stamp;
	QueryPerformanceCounter( &stamp );
	return stamp.QuadPart;
}


/**
 * @brief Determine the clock frequency of the CPU.
 *
 * Try to determine the speed at which the CPUs time-stamp counter is running
 * (on those plastforms where NanoTimer uses this counter),
 * and whether or not there is a high-frequency counter at all.
 *
 * @pre
 *   Assumes that all CPUs in one system run with the same clock frequency!
 *
 * @note Side effects: sets the class variable M_GHz.
 *
 * @todo
 * - SGI
 *
 * @par Implementation
 *   Under Linux, we parse /proc/cpuinfo (if __pentiumpro was defined at compile
 *   time); under Windoze, we use QueryPerformanceFrequency.
 *
 * @see
 *   getTimeStamp(). The ifdefs must match!
 *
 **/

void NanoTimer::checkFrequency( void )
{
	M_GHz = 0.001;
	M_Use_High_Frequ = false;

	LARGE_INTEGER hz;
	bool use_high_frequ = QueryPerformanceFrequency( &hz );
	if ( ! use_high_frequ )
		printf("col::NanoTimer: Can't use high-frequency counter!\n");
	else
	{
		M_GHz = hz.QuadPart / 1.0E9;
		M_Use_High_Frequ = true;
	}

	if ( M_Use_High_Frequ )
		printf("col::NanoTimer: found %lf GHz\n", M_GHz );
	else
	{
		printf("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
		printf("col::NanoTimer: will be bogus !!");
		printf("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
	}

	M_FrequencyChecked = true;
}



/**
 * @brief Tells whether or not the NanoTimer use the high frequency counter.
 * @return True if the high-frequency counter path is active.
 *
 * @warning
 *   Valid only after the first NanoTimer has been created!
 **/

bool NanoTimer::usesHighFrequ( void )
{
	return M_Use_High_Frequ;
}



/**
 * @brief Returns the frequency (resolution) of the counter in GHz.
 * @return Counter frequency in GHz.
 *
 * @warning
 *   Valid only if @a NanoTimer::usesHighFrequ() = @a true !
 **/

double NanoTimer::frequ( void )
{
	return M_GHz;
}


bool	NanoTimer::M_Use_High_Frequ		= false;	///< Definition of NanoTimer::M_Use_High_Frequ.
double	NanoTimer::M_GHz				= 0.001;	///< Definition of NanoTimer::M_GHz.
bool	NanoTimer::M_FrequencyChecked	= false;	///< Definition of NanoTimer::M_FrequencyChecked.




/**
 * @brief Prepare an image to use as an OpenGL texture.
 * @param image Source image to convert.
 * @return Converted QImage (ARGB32, byte-swapped, scaled to at most 1024x1024).
 */
QImage prepareImage( const QImage &image )
{
	GLint maxSize = 1024;

	// convert image into a useful format
	QImage convertedImage = image.
		convertToFormat( QImage::Format_ARGB32 ).
		rgbSwapped().
		scaled( maxSize, maxSize );
	return convertedImage;
}