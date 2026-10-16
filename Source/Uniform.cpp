/*****************************************************************************\
 *                              Uniform
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implements Uniform: value rolling (resetParameters), GL upload (setUniform/setGLValueScaled), and the
 *  interpolator ramp timing.
 *
 *  Implements CUniform.  It comes from Shader Maker, a cross-platform GLSL editor; Copyright (C) 2007-2008 Markus
 *  Kramer; for details, see main.cpp or COPYING there.
 *
 *  @author Markus Kramer (Shader Maker, 2007-2008); trimmed down by René Weller
 *
 *  @internal
 *    created:  2007-11-21
 *    last mod: 2008-03-30
 */

#include <cstring>
#include <string>
#include <cstdlib>
#include "uniform.h"
#include "shader_setup.h"

#include <GL/GLU.h>

/**  Stores the name and type; all data fields are left uninitialised until
 * setMinMax()/setInterpolator()/setProbability() and resetParameters() are called.
 **/
Uniform::Uniform( const std::string &name, BaseTypeE type )
{
    m_name = name;
    m_type = type;
}


/** No-op (no owned resources). */
Uniform::~Uniform()
{
}

/**  A random number in [0, 1] for a parameter roll, or a corner of the range for measurement runs.
 *
 * @param name  Name of the uniform being rolled. (in)
 *
 * @return
 *   A uniform random value in [0, 1]; under KALEIDO_PARAM_CORNER 0 (min), 1 (max), 0 and 1 alternately (alt) or 0.5
 *   (mid).
 *
 * KALEIDO_PARAM_CORNER=min|max|alt|mid[:name1,name2] takes the CORNER of the range instead of rolling.  A scene that
 * measures well on average can still be empty at one edge of its ranges -- FuturisticCityFlight lay between 0.0062
 * and 0.0837 depending on the draw, and 0.0062 was a legitimate draw at the dark end of glowP/fogP.  With a name list
 * ONLY these uniforms take the corner and all others the middle, so that a single parameter can be held responsible
 * (13 of 30 widely scattering scenes had an empty corner -- the corner does not tell WHICH parameter it is).  For
 * measurement runs only; without the variable every value is rolled as always.
 **/
static float roll01( const std::string &name )
{
    static int         mode = -1; // 0 roll, 1 min, 2 max, 3 alt, 4 mid
    static std::string names;     // ",a,b," or empty = all
    if ( mode < 0 )
    {
        const char  *e = getenv( "KALEIDO_PARAM_CORNER" );
        std::string  m = e ? e : "";
        const size_t colon = m.find( ':' );
        if ( colon != std::string::npos )
        {
            names = "," + m.substr( colon + 1 ) + ",";
            m = m.substr( 0, colon );
        }
        mode = ( m == "min" ) ? 1 : ( m == "max" ) ? 2
                                : ( m == "alt" )   ? 3
                                : ( m == "mid" )   ? 4
                                                   : 0;
    }
    if ( mode == 0 )
        return static_cast<float>( rand() ) / static_cast<float>( RAND_MAX );
    if ( !names.empty() && names.find( "," + name + "," ) == std::string::npos )
        return 0.5f; // not selected: the middle
    static unsigned k = 0;
    switch ( mode )
    {
        case 1: return 0.f;
        case 2: return 1.f;
        case 3: return ( ( k++ & 1u ) ? 1.f : 0.f ); // alternating per parameter
        default: return 0.5f;
    }
}

/**  Rolls a fresh random value for the current type (or fresh interpolator bounds), using whatever m_totalTime is
 * already set.
 *
 * BASE_TYPE_INT guards against `minValue == maxValue` (range == 0), which
 * used to crash with an integer division by zero in `rand() % range`; it now
 * just pins the value to the min instead.
 **/
void Uniform::resetParameters()
{
    if ( m_type == BASE_TYPE_FLOAT )
    {
        m_data.vf = ( m_dataMin.vf + roll01( m_name ) * ( m_dataMax.vf - m_dataMin.vf ) );
    }
    else if ( m_type == BASE_TYPE_BOOL )
    {
        float des = static_cast<float>( rand() ) / static_cast<float>( RAND_MAX );

        if ( des > m_dataMin.vf )
            m_data.vi = 1;
        else
            m_data.vi = 0;
    }
    else if ( m_type == BASE_TYPE_INT )
    {
        // Guard: an <int> with minValue == maxValue used to crash with an
        // integer division by zero (rand() % 0).
        int range = m_dataMax.vi - m_dataMin.vi;
        m_data.vi = ( range > 0 ) ? m_dataMin.vi + static_cast<int>( roll01( m_name ) * 0.999f * range ) : m_dataMin.vi;
    }
    else if ( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
    {
        // Warning double use of m_dataMax/Min.vf
        m_dataMin.vf = ( m_dataMinMin.vf + roll01( m_name ) * ( m_dataMinMax.vf - m_dataMinMin.vf ) );
        m_dataMax.vf = ( m_dataMaxMin.vf + roll01( m_name ) * ( m_dataMaxMax.vf - m_dataMaxMin.vf ) );

        m_delta.vf = ( m_dataMax.vf - m_dataMin.vf ) / m_totalTime.vf * 0.001f; // time in sec delta in msec

        m_data.vf = m_dataMin.vf;

        m_increasing = false;
        m_initTimer = false;
    }
}

/**  Like resetParameters(), but for BASE_TYPE_INTERPOLATOR_FLOAT also overrides the ramp duration with @p time before
 * rolling new min/max bounds.
 *
 * @p time is the new ramp duration in seconds; the other types ignore it and
 * behave exactly like resetParameters() (the parameter is documented on the
 * declaration in Uniform.h).
 *
 * Note this overload does NOT recompute m_delta/m_data here (those two
 * lines are commented out below) — it only rolls fresh m_dataMin/m_dataMax
 * bounds and stores the new m_totalTime; the actual delta/start-value
 * (re)computation happens lazily in setUniform() the next time m_initTimer
 * is set (see startInterpolator()).
 **/
void Uniform::resetParameters( float time )
{
    if ( m_type == BASE_TYPE_FLOAT )
    {
        m_data.vf = ( m_dataMin.vf + roll01( m_name ) * ( m_dataMax.vf - m_dataMin.vf ) );
    }
    else if ( m_type == BASE_TYPE_BOOL )
    {
        float des = static_cast<float>( rand() ) / static_cast<float>( RAND_MAX );

        if ( des > m_dataMin.vf )
            m_data.vi = 1;
        else
            m_data.vi = 0;
    }
    else if ( m_type == BASE_TYPE_INT )
    {
        // Guard: an <int> with minValue == maxValue used to crash with an
        // integer division by zero (rand() % 0).
        int range = m_dataMax.vi - m_dataMin.vi;
        m_data.vi = ( range > 0 ) ? m_dataMin.vi + static_cast<int>( roll01( m_name ) * 0.999f * range ) : m_dataMin.vi;
    }
    else if ( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
    {
        // Warning double use of m_dataMax/Min.vf
        m_dataMin.vf = ( m_dataMinMin.vf + roll01( m_name ) * ( m_dataMinMax.vf - m_dataMinMin.vf ) );
        m_dataMax.vf = ( m_dataMaxMin.vf + roll01( m_name ) * ( m_dataMaxMax.vf - m_dataMaxMin.vf ) );

        m_totalTime.vf = time;

        // m_delta.vf = (m_dataMax.vf - m_dataMin.vf) / m_totalTime.vf * 0.001f; //time in sec delta in msec

        // m_data.vf = m_dataMin.vf;

        m_increasing = false;
        m_initTimer = false;
    }
}

/** Looks up and caches m_location for m_name in the given linked GL program. */
void Uniform::initUniform( unsigned int sh_prog_id )
{

    const char *name = m_name.c_str();

    m_location = glGetUniformLocation( sh_prog_id, name );
}

/**  Arms the ramp: the next setUniform() call will (re-)start the wall clock and recompute m_delta/m_data from the
 * current m_dataMin/m_dataMax before advancing.
 *
 * No-op for non-interpolator types.
 **/
void Uniform::startInterpolator()
{
    if ( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
    {
        m_initTimer = true;
        m_increasing = false;
    }
}


/**  Uploads the current value to the cached GL location; for BASE_TYPE_INTERPOLATOR_FLOAT this is also where the ramp
 * is timed and advanced.
 *
 * Interpolator timing: m_delta.vf is expressed as "value change per
 * millisecond" (computed as (max-min)/totalTime, i.e. per-second, times
 * 0.001), so multiplying it directly by m_time.elapsed() (milliseconds since
 * the previous call) gives the correct per-frame increment regardless of
 * frame rate — this call is expected to run every frame, and each call both
 * consumes the elapsed time AND restarts the clock for the next one. The
 * "decrease after half the time" ping-pong behaviour is commented out: as
 * shipped, the ramp only ever counts up and is not clamped at m_dataMax.
 **/
void Uniform::setUniform()
{
    if ( m_type == BASE_TYPE_BOOL )
        glUniform1i( m_location, m_data.vi );

    else if ( m_type == BASE_TYPE_FLOAT )
        glUniform1f( m_location, m_data.vf );

    else if ( m_type == BASE_TYPE_INT )
        glUniform1i( m_location, m_data.vi );

    else if ( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
    {
        if ( m_initTimer )
        {
            m_time.start();
            // m_initTimer = true;
            m_delta.vf = ( m_dataMax.vf - m_dataMin.vf ) / m_totalTime.vf * 0.001f; // time in sec delta in msec

            m_data.vf = m_dataMin.vf;

            m_increasing = true;
            m_initTimer = false;
        }
        if ( m_increasing )
        {
            m_data.vf += m_delta.vf * ( static_cast<float>( m_time.elapsed() ) );

            // decrease value after half of the time
            /*if( m_increasing && ( m_data.vf > m_dataMax.vf ) )
            {
                m_increasing = false;
                m_delta.vf = -m_delta.vf;
            }*/

            m_time.start();

            glUniform1f( m_location, m_data.vf );

            printf( "Speed: %f (Min: %f)(Max: %f)(Delta: %f)(Time: %f)\n", m_data.vf, m_dataMin.vf, m_dataMax.vf,
                    m_delta.vf, m_totalTime.vf );
        }
    }
}




// ---------------------------------------------------------------------------
// setGLValueScaled – audio reactivity override
// Call after setUniform() to modulate the uploaded float value.
// ---------------------------------------------------------------------------
/**  Re-uploads m_data.vf * @p scale to the GL location, without altering the stored value — a non-destructive way to
 * layer audio reactivity on top of the rolled/ramped base value.
 *
 * The multiplier applies to this upload only; float and interpolator-float
 * uniforms are affected, int/bool uniforms are left alone (the parameter is
 * documented on the declaration in Uniform.h).
 **/
void Uniform::setGLValueScaled( float scale ) const
{
    if ( m_location < 0 )
        return;

    if ( m_type == BASE_TYPE_FLOAT || m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
        glUniform1f( m_location, m_data.vf * scale );
    // int / bool uniforms are not scaled
}
