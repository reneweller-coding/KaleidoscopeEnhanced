//=============================================================================
/** @file		uniform.h
 *
 * Defines a uniform variable management class
 *
	@internal
	created:	2007-11-16
	last mod:	2007-12-16

    Shader Maker - a cross-platform GLSL editor.
    Copyright (C) 2007-2008 Markus Kramer
    For details, see main.cpp or COPYING.

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
	BASE_TYPE_BAD = 0,
	BASE_TYPE_BOOL,
	BASE_TYPE_INT,
	BASE_TYPE_UNSIGNED_INT,
	BASE_TYPE_FLOAT,
	BASE_TYPE_INTERPOLATOR_FLOAT
	//BASE_TYPE_SAMPLER,
};

class Uniform
{
public:
	Uniform( const std::string &name, baseType_e type );
	virtual ~Uniform( void );

	
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


	void setMinMax(float minf, float maxf)
	{
		m_dataMin.vf = minf;
		m_dataMax.vf = maxf;
	}

	
	void setMinMax(int minf, int maxf)
	{
		m_dataMin.vi = minf;
		m_dataMax.vi = maxf;
	}

	
	void setMinMax(unsigned int minf, unsigned int maxf)
	{
		m_dataMin.vi = minf;
		m_dataMax.vi = maxf;
	}

	
	void setProbability( float pro )
	{
		m_dataMin.vf = pro;
	}

	void setUniform();
	void initUniform( unsigned int sh_prog_id );
	void resetParameters();
	void resetParameters( float time );
	void startInterpolator();

	/** Re-upload the current float value scaled by 'scale'.
	 *  Call this AFTER setUniform() to override the value for audio reactivity.
	 *  Has no effect on int/bool uniforms. */
	void setGLValueScaled(float scale);

	/** Name of the uniform variable (for lookup by EffectShader). */
	const std::string& getName() const { return m_name; }

	/** Snapshot / restore of the rolled per-activation value, for the song-
	 *  structure memory: a recognised section replays its exact look instead of
	 *  re-rolling.  Ints/bools round-trip through float losslessly here (they
	 *  are small). */
	float snapshotValue() const
	{
		return (m_type == BASE_TYPE_FLOAT || m_type == BASE_TYPE_INTERPOLATOR_FLOAT)
		       ? m_data.vf : float(m_data.vi);
	}
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
		float vf;
		int vi;
	} dataUnit_t;


	std::string	m_name;
	int			m_type; // GL_xxx type identifier
	int			m_location;
	dataUnit_t	m_data;
	dataUnit_t	m_dataMin;
	dataUnit_t	m_dataMax;


	//Interpolator
	dataUnit_t	m_dataMinMin;
	dataUnit_t	m_dataMinMax;
	
	dataUnit_t	m_dataMaxMin;
	dataUnit_t	m_dataMaxMax;

	dataUnit_t  m_delta;
	dataUnit_t  m_totalTime;

	bool	m_increasing;
	bool	m_initTimer;

	WallClock m_time;
};



#endif	// __UNIFORM_H_INCLUDED__
