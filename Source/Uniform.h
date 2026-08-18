//=============================================================================
/** @file		uniform.h
 * @brief Defines Uniform: per-shader-uniform value storage, min/max range randomisation, and audio-reactive min/max interpolation ("interpolator") state.
 *
 * Defines a uniform variable management class
 *
	@internal
	created:	2007-11-16
	last mod:	2007-12-16

    Shader Maker - a cross-platform GLSL editor.
    Copyright (C) 2007-2008 Markus Kramer
    For details, see main.cpp or COPYING.

    NOTE (Kaleidoscope Enhanced): the class below has been trimmed down from
    the original "Shader Maker" CUniform (see the #if 0 block at the end of
    Uniform.cpp for the original, matrix/vector-capable implementation this
    project no longer uses) to just the bool/int/float/interpolator-float
    scalar cases actually needed by this project's shaders. The class-level
    doc comment further down (originally written for CUniform) is kept for
    historical context but describes capabilities (matrices, getColumnVector
    etc.) that are no longer present on this class.

=============================================================================*/

#ifndef __UNIFORM_H_INCLUDED__
#define __UNIFORM_H_INCLUDED__

#include <string>
#include "coreclock.h"


//=============================================================================
//	CUniform  - contains info about a programs's uniform variable
//=============================================================================

/** Stores infos about uniform variables of a GLSL program.
 * This class is capable of storing uniform variable data of
 * different types and formats used in GLSL program. It stores the
 * data itself and the metadata, like variable name, type and location.
 * It also provides methods that return meta information about
 * those meta informations ( example: getBaseType() ).
 *
 * This class supports bool, int and float variables with up to 4x4 elements.
 * The methods for accessing the data of these types are exclusive to its type.
 * For example, results are undefined if the uniform type is int and
 * the method setValueAsFloat is called. These types are also called base types,
 * because they are the scalars used in vectors an matrix uniforms.
 *
 * A CUniform object can be accessed like a matrix and like a vector.
 * the getValue and setValue methods treat it like a 4 component vector,
 * even if only one component is available! Accessing the other components is possible,
 * but they are not passed to OpenGL via applyToGL. Matrices are also treated
 * like vectors by accessing only the first column of the matrix.
 * To access the other columns you need to extract/insert the individual
 * column with the getColumnVector() and setColumnVector() methods.
 */



/** Uniform base type.
 * Since uniforms can be vectors and matrices, this defines the
 * type if the scalars stored in those vectors and matrices.
 */
enum baseType_e
{
	BASE_TYPE_BAD = 0,          ///< Invalid/unset type; not otherwise used by Uniform's own logic.
	BASE_TYPE_BOOL,              ///< Boolean uniform: rolled true/false per resetParameters() from a probability stored in m_dataMin.vf.
	BASE_TYPE_INT,                ///< Integer uniform: rolled uniformly in [m_dataMin.vi, m_dataMax.vi) per resetParameters().
	BASE_TYPE_UNSIGNED_INT,        ///< Reserved for an unsigned-int uniform; not currently constructed anywhere in this project (all `new Uniform(...)` call sites use BOOL/INT/FLOAT/INTERPOLATOR_FLOAT).
	BASE_TYPE_FLOAT,                ///< Float uniform: rolled uniformly in [m_dataMin.vf, m_dataMax.vf) per resetParameters().
	BASE_TYPE_INTERPOLATOR_FLOAT      ///< Float uniform whose min AND max are themselves re-rolled from ranges (m_dataMinMin/m_dataMinMax/m_dataMaxMin/m_dataMaxMax), then ramped from min to max over m_totalTime by setUniform() each frame it runs.
	//BASE_TYPE_SAMPLER,
};

/**
 * @brief Per-shader-uniform runtime state: current value, its randomisation range, and (for BASE_TYPE_INTERPOLATOR_FLOAT) a timed min-to-max ramp.
 *
 * One Uniform instance backs one named GLSL uniform on an EffectShader. Its
 * behaviour is dictated entirely by m_type (set once at construction):
 * BASE_TYPE_BOOL/INT/FLOAT are rolled to a single random value within
 * [m_dataMin, m_dataMax] by resetParameters() and pushed to the GL program
 * as-is by setUniform(); BASE_TYPE_INTERPOLATOR_FLOAT additionally re-rolls
 * its own min and max from four outer bounds (m_dataMinMin/m_dataMinMax/
 * m_dataMaxMin/m_dataMaxMax) and then linearly ramps the uploaded value from
 * that min to that max over m_totalTime seconds, driven by a wall clock
 * (m_time) restarted every setUniform() call. setGLValueScaled() offers a
 * second, scaled re-upload path used to make float uniforms audio-reactive
 * without touching the rolled base value. snapshotValue()/restoreValue()
 * let a caller save and later exactly replay a rolled value (used by the
 * song-structure "replay this section's look" memory).
 */
class Uniform
{
public:
	/**
	 * @brief Constructs a named, typed uniform with no data yet assigned.
	 * @param name GLSL uniform variable name; looked up in the shader program by initUniform().
	 * @param type Which scalar kind (and, for BASE_TYPE_INTERPOLATOR_FLOAT, which rolling behaviour) this uniform has.
	 */
	Uniform( const std::string &name, baseType_e type );
	/** @brief Virtual no-op destructor (no owned resources to release). */
	virtual ~Uniform( void );


	/**
	 * @brief Sets the four outer bounds and ramp duration for a BASE_TYPE_INTERPOLATOR_FLOAT uniform.
	 * @param interpolatorMinMinf Lower bound for the randomised ramp-start value.
	 * @param interpolatorMinMaxf Upper bound for the randomised ramp-start value.
	 * @param interpolatorMaxMinf Lower bound for the randomised ramp-end value.
	 * @param interpolatorMaxMaxf Upper bound for the randomised ramp-end value.
	 * @param interpolatorTime Ramp duration in seconds (used as m_totalTime; see resetParameters()'s delta-per-millisecond computation).
	 */
	void setInterpolator( float interpolatorMinMinf,
						  float interpolatorMinMaxf,
						  float interpolatorMaxMinf,
						  float interpolatorMaxMaxf,
						  float interpolatorTime )
	{
		m_dataMinMin.vf = interpolatorMinMinf;
		m_dataMinMax.vf = interpolatorMinMaxf;
		m_dataMaxMin.vf = interpolatorMaxMinf;
		m_dataMaxMax.vf = interpolatorMaxMaxf;

		m_totalTime.vf = interpolatorTime;
	}


	/** @brief Sets the randomisation range for a BASE_TYPE_FLOAT uniform.
	 * @param minf Lower bound rolled by resetParameters().
	 * @param maxf Upper bound rolled by resetParameters(). */
	void setMinMax(float minf, float maxf)
	{
		m_dataMin.vf = minf;
		m_dataMax.vf = maxf;
	}


	/** @brief Sets the randomisation range for a BASE_TYPE_INT uniform.
	 * @param minf Lower bound (inclusive) rolled by resetParameters().
	 * @param maxf Upper bound (exclusive) rolled by resetParameters(). */
	void setMinMax(int minf, int maxf)
	{
		m_dataMin.vi = minf;
		m_dataMax.vi = maxf;
	}


	/** @brief Sets the randomisation range for a BASE_TYPE_UNSIGNED_INT uniform (stored the same way as the int overload).
	 * @param minf Lower bound (inclusive) rolled by resetParameters().
	 * @param maxf Upper bound (exclusive) rolled by resetParameters(). */
	void setMinMax(unsigned int minf, unsigned int maxf)
	{
		m_dataMin.vi = minf;
		m_dataMax.vi = maxf;
	}


	/** @brief Sets the "true" probability for a BASE_TYPE_BOOL uniform.
	 * @param pro Probability in [0,1] that resetParameters() rolls the value true (stored in m_dataMin.vf, reused as the threshold). */
	void setProbability( float pro )
	{
		m_dataMin.vf = pro;
	}

	/** @brief Uploads the current value to the bound GL program via the appropriate glUniform* call; for BASE_TYPE_INTERPOLATOR_FLOAT this also advances the ramp based on elapsed wall-clock time. */
	void setUniform();
	/**
	 * @brief Resolves and caches this uniform's location in a linked GL shader program.
	 * @param sh_prog_id GL program object id to query via glGetUniformLocation().
	 */
	void initUniform( unsigned int sh_prog_id );
	/** @brief Rolls a fresh random value (or, for INTERPOLATOR_FLOAT, fresh min/max bounds and ramp delta) using the current m_totalTime. */
	void resetParameters();
	/**
	 * @brief Rolls a fresh random value like resetParameters(), but for BASE_TYPE_INTERPOLATOR_FLOAT overrides the ramp duration with @p time instead of reusing the previously-set one.
	 * @param time New ramp duration in seconds (BASE_TYPE_INTERPOLATOR_FLOAT only; ignored by the other types).
	 */
	void resetParameters( float time );
	/** @brief Arms a BASE_TYPE_INTERPOLATOR_FLOAT uniform so its next setUniform() call (re-)starts the ramp timer from the current rolled min. No-op for other types. */
	void startInterpolator();

	/** Re-upload the current float value scaled by 'scale'.
	 *  Call this AFTER setUniform() to override the value for audio reactivity.
	 *  Has no effect on int/bool uniforms.
	 *  @param scale Multiplier applied to the current float value before re-upload. */
	void setGLValueScaled(float scale);

	/** Name of the uniform variable (for lookup by EffectShader). */
	const std::string& getName() const { return m_name; }

	/** Snapshot / restore of the rolled per-activation value, for the song-
	 *  structure memory: a recognised section replays its exact look instead of
	 *  re-rolling.  Ints/bools round-trip through float losslessly here (they
	 *  are small).
	 *  @return The current value as a float (m_data.vf for float types, m_data.vi widened to float otherwise). */
	float snapshotValue() const
	{
		return (m_type == BASE_TYPE_FLOAT || m_type == BASE_TYPE_INTERPOLATOR_FLOAT)
		       ? m_data.vf : float(m_data.vi);
	}
	/** @brief Restores a value previously captured by snapshotValue(), replacing whatever resetParameters() would otherwise have rolled.
	 * @param v The value to restore; for non-float types it is rounded to the nearest int (symmetric rounding for negatives) rather than truncated. */
	void restoreValue(float v)
	{
		if (m_type == BASE_TYPE_FLOAT || m_type == BASE_TYPE_INTERPOLATOR_FLOAT)
			m_data.vf = v;
		else
			m_data.vi = int(v + ((v >= 0.f) ? 0.5f : -0.5f));
	}

private:


	/** The actual data container.
	 * @internal
	 *   - Must match for each basic type!
	 */
	typedef union dataUnit_u {
		//GLfloat	_float	[ 16 ]; ///< up to mat4, in column major order!
		//GLint	_int	[ 4 ];  ///< up to ivec4 and bvec4
		float vf;   ///< Value interpreted as a float (BASE_TYPE_FLOAT / BASE_TYPE_INTERPOLATOR_FLOAT, and re-used to stash the bool "true" probability / int threshold in some fields).
		int vi;     ///< Value interpreted as an int (BASE_TYPE_INT / BASE_TYPE_BOOL / BASE_TYPE_UNSIGNED_INT).
	} dataUnit_t;


	std::string	m_name;      ///< GLSL uniform variable name.
	int			m_type; // GL_xxx type identifier
	                         ///< Actually a baseType_e value (declared as plain int); selects which branch of every method's type switch runs.
	int			m_location;  ///< Cached GL uniform location from initUniform(); -1 (or uninitialised) means "not yet resolved / not found".
	dataUnit_t	m_data;      ///< The current, uploadable value: the rolled bool/int/float, or the live-ramping float for BASE_TYPE_INTERPOLATOR_FLOAT.
	dataUnit_t	m_dataMin;   ///< Lower bound of the randomisation range (bool: reused as the "true" probability threshold); for BASE_TYPE_INTERPOLATOR_FLOAT, the currently-rolled ramp start value.
	dataUnit_t	m_dataMax;   ///< Upper bound of the randomisation range; for BASE_TYPE_INTERPOLATOR_FLOAT, the currently-rolled ramp end value.


	//Interpolator
	dataUnit_t	m_dataMinMin;  ///< BASE_TYPE_INTERPOLATOR_FLOAT only: lower bound from which the ramp-start value (m_dataMin) is rolled.
	dataUnit_t	m_dataMinMax;  ///< BASE_TYPE_INTERPOLATOR_FLOAT only: upper bound from which the ramp-start value (m_dataMin) is rolled.

	dataUnit_t	m_dataMaxMin;  ///< BASE_TYPE_INTERPOLATOR_FLOAT only: lower bound from which the ramp-end value (m_dataMax) is rolled.
	dataUnit_t	m_dataMaxMax;  ///< BASE_TYPE_INTERPOLATOR_FLOAT only: upper bound from which the ramp-end value (m_dataMax) is rolled.

	dataUnit_t  m_delta;       ///< BASE_TYPE_INTERPOLATOR_FLOAT only: per-millisecond increment applied to m_data.vf while ramping, i.e. (max-min)/totalTime/1000.
	dataUnit_t  m_totalTime;   ///< BASE_TYPE_INTERPOLATOR_FLOAT only: ramp duration in seconds, as set by setInterpolator()/resetParameters(float).

	bool	m_increasing;  ///< BASE_TYPE_INTERPOLATOR_FLOAT only: whether setUniform() should currently be advancing the ramp (set true once the timer is (re-)armed).
	bool	m_initTimer;   ///< BASE_TYPE_INTERPOLATOR_FLOAT only: one-shot flag telling the next setUniform() call to (re-)start m_time and recompute m_delta/m_data before ramping.

	WallClock m_time;  ///< Wall-clock timer used to measure elapsed milliseconds between setUniform() calls while ramping (BASE_TYPE_INTERPOLATOR_FLOAT only).
};



#endif	// __UNIFORM_H_INCLUDED__
