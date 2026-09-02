//=============================================================================
/** @file:		uniform.cpp
 * @brief Implements Uniform: value rolling (resetParameters), GL upload (setUniform/setGLValueScaled), and the interpolator ramp timing.
 *
 * Implements CUniform.
 *
	@internal
	created:	2007-11-21
	last mod:	2008-03-30

    Shader Maker - a cross-platform GLSL editor.
    Copyright (C) 2007-2008 Markus Kramer
    For details, see main.cpp or COPYING.

=============================================================================*/

#include <cstring>
#include <cstdlib>
#include "uniform.h"
#include "shader_setup.h"

#include<GL/GLU.h>

/**
 * @brief Stores the name and type; all data fields are left uninitialised until setMinMax()/setInterpolator()/setProbability() and resetParameters() are called.
 */
Uniform::Uniform( const std::string &name, baseType_e type )
{
	m_name = name;
	m_type = type;
}


/** @brief No-op (no owned resources). */
Uniform::~Uniform(  )
{
}

/**
 * @brief Rolls a fresh random value for the current type (or fresh interpolator bounds), using whatever m_totalTime is already set.
 *
 * BASE_TYPE_INT guards against `minValue == maxValue` (range == 0), which
 * used to crash with an integer division by zero in `rand() % range`; it now
 * just pins the value to the min instead.
 */
// KALEIDO_PARAM_CORNER=min|max|alt zieht statt zu wuerfeln die ECKE des
// Bereichs.  Eine Szene, die im Mittel gut misst, kann an einem Rand ihrer
// Bereiche trotzdem leer sein -- FuturisticCityFlight lag je nach Ziehung
// zwischen 0,0062 und 0,0837, und die 0,0062 war eine legitime Ziehung am
// dunklen Ende von glowP/fogP.  Nur fuer Messlaeufe; ohne die Variable
// wird gewuerfelt wie immer.
static float roll01()
{
	static int mode = -1;
	if( mode < 0 )
	{
		const char *e = getenv( "KALEIDO_PARAM_CORNER" );
		mode = !e ? 0 : !strcmp( e, "min" ) ? 1 : !strcmp( e, "max" ) ? 2
		               : !strcmp( e, "alt" ) ? 3 : 0;
	}
	static unsigned k = 0;
	switch( mode )
	{
		case 1:  return 0.f;
		case 2:  return 1.f;
		case 3:  return ( ( k++ & 1u ) ? 1.f : 0.f );   // abwechselnd je Parameter
		default: return (float) rand() / (float) RAND_MAX;
	}
}


void Uniform::resetParameters()
{
	if( m_type == BASE_TYPE_FLOAT )
	{
		m_data.vf = (float) (m_dataMin.vf + roll01() * (m_dataMax.vf - m_dataMin.vf));
	}
	else if( m_type == BASE_TYPE_BOOL )
	{
		float des = (float) (rand()) / (float) RAND_MAX;

		if( des > m_dataMin.vf )
			m_data.vi = 1;
		else 
			m_data.vi = 0;
	}
	else if( m_type == BASE_TYPE_INT )
	{
		// Guard: an <int> with minValue == maxValue used to crash with an
		// integer division by zero (rand() % 0).
		int range = m_dataMax.vi - m_dataMin.vi;
		m_data.vi = (range > 0) ? m_dataMin.vi + (int)( roll01() * 0.999f * range ) : m_dataMin.vi;
	}
	else if( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
	{
		//Warning double use of m_dataMax/Min.vf
		m_dataMin.vf = (float) (m_dataMinMin.vf + roll01() * (m_dataMinMax.vf - m_dataMinMin.vf));
		m_dataMax.vf = (float) (m_dataMaxMin.vf + roll01() * (m_dataMaxMax.vf - m_dataMaxMin.vf));

		m_delta.vf = (m_dataMax.vf - m_dataMin.vf) / m_totalTime.vf * 0.001f; //time in sec delta in msec
		
		m_data.vf = m_dataMin.vf;

		m_increasing = false;
		m_initTimer = false;
	}
}

/**
 * @brief Like resetParameters(), but for BASE_TYPE_INTERPOLATOR_FLOAT also overrides the ramp duration with @p time before rolling new min/max bounds.
 * @param time New ramp duration in seconds (BASE_TYPE_INTERPOLATOR_FLOAT only; ignored for the other types, which behave exactly like resetParameters()).
 *
 * Note this overload does NOT recompute m_delta/m_data here (those two
 * lines are commented out below) — it only rolls fresh m_dataMin/m_dataMax
 * bounds and stores the new m_totalTime; the actual delta/start-value
 * (re)computation happens lazily in setUniform() the next time m_initTimer
 * is set (see startInterpolator()).
 */
void Uniform::resetParameters( float time )
{
	if( m_type == BASE_TYPE_FLOAT )
	{
		m_data.vf = (float) (m_dataMin.vf + roll01() * (m_dataMax.vf - m_dataMin.vf));
	}
	else if( m_type == BASE_TYPE_BOOL )
	{
		float des = (float) (rand()) / (float) RAND_MAX;

		if( des > m_dataMin.vf )
			m_data.vi = 1;
		else 
			m_data.vi = 0;
	}
	else if( m_type == BASE_TYPE_INT )
	{
		// Guard: an <int> with minValue == maxValue used to crash with an
		// integer division by zero (rand() % 0).
		int range = m_dataMax.vi - m_dataMin.vi;
		m_data.vi = (range > 0) ? m_dataMin.vi + (int)( roll01() * 0.999f * range ) : m_dataMin.vi;
	}
	else if( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
	{
		//Warning double use of m_dataMax/Min.vf
		m_dataMin.vf = (float) (m_dataMinMin.vf + roll01() * (m_dataMinMax.vf - m_dataMinMin.vf));
		m_dataMax.vf = (float) (m_dataMaxMin.vf + roll01() * (m_dataMaxMax.vf - m_dataMaxMin.vf));

		m_totalTime.vf = time;

		//m_delta.vf = (m_dataMax.vf - m_dataMin.vf) / m_totalTime.vf * 0.001f; //time in sec delta in msec
		
		//m_data.vf = m_dataMin.vf;

		m_increasing = false;
		m_initTimer = false;
	}
}

/** @brief Looks up and caches m_location for m_name in the given linked GL program. */
void Uniform::initUniform( unsigned int sh_prog_id )
{

	const char* name = m_name.c_str();

	m_location = glGetUniformLocation( sh_prog_id, name );
}

/** @brief Arms the ramp: the next setUniform() call will (re-)start the wall clock and recompute m_delta/m_data from the current m_dataMin/m_dataMax before advancing. No-op for non-interpolator types. */
void Uniform::startInterpolator()
{
	if( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
	{
		m_initTimer = true;
		m_increasing = false;
	}
}


/**
 * @brief Uploads the current value to the cached GL location; for BASE_TYPE_INTERPOLATOR_FLOAT this is also where the ramp is timed and advanced.
 *
 * Interpolator timing: m_delta.vf is expressed as "value change per
 * millisecond" (computed as (max-min)/totalTime, i.e. per-second, times
 * 0.001), so multiplying it directly by m_time.elapsed() (milliseconds since
 * the previous call) gives the correct per-frame increment regardless of
 * frame rate — this call is expected to run every frame, and each call both
 * consumes the elapsed time AND restarts the clock for the next one. The
 * "decrease after half the time" ping-pong behaviour is commented out: as
 * shipped, the ramp only ever counts up and is not clamped at m_dataMax.
 */
void Uniform::setUniform()
{
	if( m_type == BASE_TYPE_BOOL )
		glUniform1i( m_location, m_data.vi );
	
	else if( m_type == BASE_TYPE_FLOAT )
		glUniform1f( m_location, m_data.vf );
	
	else if( m_type == BASE_TYPE_INT )
		glUniform1i( m_location, m_data.vi );
	
	else if( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
	{
		if( m_initTimer )
		{
			m_time.start();
			//m_initTimer = true;	
			m_delta.vf = (m_dataMax.vf - m_dataMin.vf) / m_totalTime.vf * 0.001f; //time in sec delta in msec
			
			m_data.vf = m_dataMin.vf;

			m_increasing = true;
			m_initTimer = false;

		}
		if( m_increasing )
		{
			m_data.vf += m_delta.vf * ( (float) m_time.elapsed() );

			//decrease value after half of the time
			/*if( m_increasing && ( m_data.vf > m_dataMax.vf ) )
			{
				m_increasing = false;
				m_delta.vf = -m_delta.vf;
			}*/

			m_time.start();

			glUniform1f( m_location, m_data.vf );

			printf( "Speed: %f (Min: %f)(Max: %f)(Delta: %f)(Time: %f)\n", m_data.vf, m_dataMin.vf, m_dataMax.vf, m_delta.vf, m_totalTime.vf ); 
		}
	}
}




// ---------------------------------------------------------------------------
// setGLValueScaled – audio reactivity override
// Call after setUniform() to modulate the uploaded float value.
// ---------------------------------------------------------------------------
/**
 * @brief Re-uploads m_data.vf * @p scale to the GL location, without altering the stored value — a non-destructive way to layer audio reactivity on top of the rolled/ramped base value.
 * @param scale Multiplier applied to the current float value for this upload only.
 */
void Uniform::setGLValueScaled(float scale)
{
	if (m_location < 0) return;

	if (m_type == BASE_TYPE_FLOAT || m_type == BASE_TYPE_INTERPOLATOR_FLOAT)
		glUniform1f(m_location, m_data.vf * scale);
	// int / bool uniforms are not scaled
}


// Reference-only: the original "Shader Maker" CUniform this class was
// trimmed down from (see the file-header NOTE in Uniform.h). Disabled via
// #if 0 rather than deleted — kept as documentation of the fuller
// vector/matrix uniform API (applyToGL, getColumnVector/setColumnVector,
// getBaseType, etc.) that this project's stripped-down Uniform no longer
// implements. Not compiled; already carries its own Doxygen comments.
#if 0
//=============================================================================
//	CUniform implementation
//=============================================================================

/** Constructs a named uniform variable object.
 * If the uniform type is a matrix, the object is initialized to
 * the identity matrix of the dimension specified in that type.
 * Otherwise all data elements are initialized to zero.
 * @param name Name of the unifrom variable.
 * @param type Type of the variable. Possible types are those 
 *	      defined in the OpenGL 2.0 specification.
 * @param location Location of the uniform variable.
 * */
CUniform::CUniform( const std::string & name, int type, int location )
 : m_name( name ), m_type( type ), m_location( location )
{
	memset( &m_data, 0, sizeof(m_data) );
	
	// use a nonzero default for float scalars
	if( m_type == GL_FLOAT )
		m_data._float[ 0 ] = 0.1f;
	// and for float vectors
	if ( m_type == GL_FLOAT_VEC2 || GL_FLOAT_VEC3 || GL_FLOAT_VEC4 )
	{
		m_data._float[ 0 ] = 0.1f;
		m_data._float[ 1 ] = 0.2f;
		m_data._float[ 2 ] = 0.3f;
		m_data._float[ 3 ] = 0.4f;
	}

	// do more intelligent initialization:
	//  default to identity matrices
	if( m_type == GL_FLOAT_MAT2 )
		m_data._float[ 0 ] = m_data._float[ 3 ] = 1.0f;
	if( m_type == GL_FLOAT_MAT3 )
		m_data._float[ 0 ] = m_data._float[ 4 ] = m_data._float[ 8 ] = 1.0f;
	if( m_type == GL_FLOAT_MAT4 )
		m_data._float[ 0 ] = m_data._float[ 5 ] = m_data._float[ 10 ] = m_data._float[ 15 ] = 1.0f;
}


/** Constructs a copy of a giver CUniform object.
 * An location must be specified, which overrides the location
 * stored in the source object.
 * @param u Source uniform variable.
 * @param location New location of the uniform variable.
 */
CUniform::CUniform( const CUniform & u, int location )
: m_name( u.getName() ), m_type( u.getType() ), m_location( location )
{
	memcpy( &m_data, &u.m_data, sizeof(m_data) );
}


/** Destructor. */
CUniform::~CUniform( void )
{
}


//======================
/** Sets a component to a boolean value.
 * Treats the uniform like a vector.
 * The component index must be in range [0,3].
 * If the index is out of range, the behavior is undefined.
 * @param component Component index.
 * @param value Value to be stored.
 */
//========================
void CUniform::setValueAsBool( int component, bool value )
{
	setValueAsInt( component, value );
}


//======================
/** Sets a component to an integer value.
 * Treats the uniform like a vector.
 * The component index must be in range [0,3].
 * If the index is out of range, the behavior is undefined.
 * @param component Component index.
 * @param value Value to be stored.
 */
//========================
void CUniform::setValueAsInt( int component, int value )
{
	assert( component >= 0 && component < 4 );
	m_data._int[ component ] = value;
}


//======================
/** Sets a component to a floating point value.
 * Treats the uniform like a vector.
 * The component index must be in range [0,3].
 * If the index is out of range, the behavior is undefined.
 * @param component Component index.
 * @param value Value to be stored.
 */
//========================
void CUniform::setValueAsFloat( int component, double value )
{
	assert( component >= 0 && component < 4 );
	m_data._float[ component ] = static_cast<float>( value );
}


//======================
/** Returns a boolean value.
 * Treats the uniform like a vector.
 * The component index must be in range [0,3].
 * If the index is out of range, the behavior is undefined.
 * @param component Component index.
 * @return The indexed component data.
 */
//======================
bool CUniform::getValueAsBool( int component ) const
{
	assert( component >= 0 && component < 4 );
	return m_data._int[ component ] ? true : false;
}


//======================
/** Returns an integer value.
 * Treats the uniform like a vector.
 * The component index must be in range [0,3].
 * If the index is out of range, the behavior is undefined.
 * @param component Component index.
 * @return The indexed component data.
 */
//======================
int CUniform::getValueAsInt( int component ) const
{
	assert( component >= 0 && component < 4 );
	return m_data._int[ component ];
}



//======================
/** Returns a floating point value.
 * Treats the uniform like a vector.
 * The component index must be in range [0,3].
 * If the index is out of range, the behavior is undefined.
 * @param component Component index.
 * @return The indexed component data.
 */
//======================
double CUniform::getValueAsFloat( int component ) const
{
	assert( component >= 0 && component < 4 );
	return static_cast<double>( m_data._float[ component ] );
}


//======================
/** Passes the currently stored uniform data to OpenGL.
 * It uses the glUniform* command based on the stored type.
 * If the location of this uniform is -1, this call has no effect.
 */
//======================
void CUniform::applyToGL( void )
{
	// can't be set
	if( m_location == -1 )
		return;

	switch( m_type )
	{
	case GL_FLOAT:		glUniform1fv( m_location, 1, m_data._float ); break;
	case GL_FLOAT_VEC2:	glUniform2fv( m_location, 1, m_data._float ); break;
	case GL_FLOAT_VEC3:	glUniform3fv( m_location, 1, m_data._float ); break;
	case GL_FLOAT_VEC4:	glUniform4fv( m_location, 1, m_data._float ); break;

	case GL_FLOAT_MAT2:	glUniformMatrix2fv( m_location, 1, false, m_data._float ); break;
	case GL_FLOAT_MAT3:	glUniformMatrix3fv( m_location, 1, false, m_data._float ); break;
	case GL_FLOAT_MAT4:	glUniformMatrix4fv( m_location, 1, false, m_data._float ); break;

	case GL_INT:		glUniform1iv( m_location, 1, m_data._int ); break;
	case GL_INT_VEC2:	glUniform2iv( m_location, 1, m_data._int ); break;
	case GL_INT_VEC3:	glUniform3iv( m_location, 1, m_data._int ); break;
	case GL_INT_VEC4:	glUniform4iv( m_location, 1, m_data._int ); break;

	case GL_BOOL:		glUniform1iv( m_location, 1, m_data._int ); break;
	case GL_BOOL_VEC2:	glUniform2iv( m_location, 1, m_data._int ); break;
	case GL_BOOL_VEC3:	glUniform3iv( m_location, 1, m_data._int ); break;
	case GL_BOOL_VEC4:	glUniform4iv( m_location, 1, m_data._int ); break;

	case GL_SAMPLER_1D:			glUniform1iv( m_location, 1, m_data._int ); break;
	case GL_SAMPLER_2D:			glUniform1iv( m_location, 1, m_data._int ); break;
	case GL_SAMPLER_3D:			glUniform1iv( m_location, 1, m_data._int ); break;
	case GL_SAMPLER_CUBE:		glUniform1iv( m_location, 1, m_data._int ); break;
	case GL_SAMPLER_1D_SHADOW:	glUniform1iv( m_location, 1, m_data._int ); break;
	case GL_SAMPLER_2D_SHADOW:	glUniform1iv( m_location, 1, m_data._int ); break;
	}
}


//======================
/** Extracts the scalar types for vectors and matrices
 * out of the OpenGL type of this uniform.
 * @return A baseType_e value describing the scalar type.
 *         If the stored uniform type is invalid, BASE_TYPE_BAD will be returned.
 */
//======================
CUniform::baseType_e CUniform::getBaseType( void ) const
{
	switch( m_type )
	{
	case GL_BOOL:
	case GL_BOOL_VEC2:
	case GL_BOOL_VEC3:
	case GL_BOOL_VEC4:
		return BASE_TYPE_BOOL;
		break;

	case GL_INT:
	case GL_INT_VEC2:
	case GL_INT_VEC3:
	case GL_INT_VEC4:
		return BASE_TYPE_INT;
		break;

	case GL_FLOAT:
	case GL_FLOAT_VEC2:
	case GL_FLOAT_VEC3:
	case GL_FLOAT_VEC4:
	case GL_FLOAT_MAT2:
	case GL_FLOAT_MAT3:
	case GL_FLOAT_MAT4:
		return BASE_TYPE_FLOAT;
		break;
	}

	return BASE_TYPE_BAD;
}


//======================
/** Returns the number of matrix columns.
 * If this uniform is a matrix, this call return the number of matrix columns.
 * Otherwise it returns 1.
 * @return Number of matrix columns.
 */
//======================
int CUniform::getColumnCount( void ) const
{
	switch( m_type )
	{
	case GL_FLOAT_MAT2: return 2; break;
	case GL_FLOAT_MAT3: return 3; break;
	case GL_FLOAT_MAT4: return 4; break;
	}

	return 1;
}


//======================
/** Get an indexed matrix column.
 * This can be used to extract a column out of a matrix uniform.
 * If the column index is out of range for the stored type,
 * or the type is not a matrix, then behavior is undefined.
 * @param column Column index.
 * @return A CUniform that represents the column vector.
 *
 * @internal
 *  - Matrices are stored in column-major order.
========================
*/
CUniform CUniform::getColumnVector( int column ) const
{
	assert( column < getColumnCount() );

	int components = 0;
	int type = 0;

	switch( getType() )
	{
	case GL_FLOAT_MAT2: components = 2; type = GL_FLOAT_VEC2; break;
	case GL_FLOAT_MAT3: components = 3; type = GL_FLOAT_VEC3; break;
	case GL_FLOAT_MAT4: components = 4; type = GL_FLOAT_VEC4; break;

	default: // not a valid matrix...
		return CUniform();
		break;
	}

	CUniform u( m_name + "[" + std::to_string( column ) + "]", type );

	// copy components
	for( int i = 0 ; i < components ; i++ )
	{
		u.m_data._float[ i ] = m_data._float[ components * column + i ];
	}

	return u;
}


//======================
/** Set an indexed matrix column.
 * This can be used to replace a column of a matrix uniform.
 * If the column index is out of range for the stored type,
 * or the type is not a matrix, or the new base type is not equal
 * to the current base type, then behavior is undefined.
 * @param column Column index.
 * @param u A CUniform that represents the source column vector.
 *
 * @internal
 *  - matrices are stored in column major order.
 */
//======================
void CUniform::setColumnVector( int column, const CUniform & u )
{
	assert( column < getColumnCount() );
	assert( u.getBaseType() == getBaseType() );

	int components = 0;

	switch( getType() )
	{
	case GL_FLOAT_MAT2: components = 2; break;
	case GL_FLOAT_MAT3: components = 3; break;
	case GL_FLOAT_MAT4: components = 4; break;
	}

	// copy values
	for( int i = 0 ; i < components ; i++ )
	{
		m_data._float[ components * column + i ] = u.m_data._float[ i ];
	}
}


//======================
/** Returns the number of vector components in the uniform.
 * It treats the uniform as a vector.
 * For matrices, this returns the number of components of each column vector.
 * @return Vector component count. Returns 0 for invalid types.
 *
 * @internal
 *   The GL spec also uses 'size' as array size.
========================
*/
int CUniform::getComponentCount( void ) const
{
	switch( m_type )
	{
	// base type vectors
	case GL_BOOL:		return 1; break;
	case GL_BOOL_VEC2:	return 2; break;
	case GL_BOOL_VEC3:	return 3; break;
	case GL_BOOL_VEC4:	return 4; break;
	case GL_INT:		return 1; break;
	case GL_INT_VEC2:	return 2; break;
	case GL_INT_VEC3:	return 3; break;
	case GL_INT_VEC4:	return 4; break;
	case GL_FLOAT:		return 1; break;
	case GL_FLOAT_VEC2:	return 2; break;
	case GL_FLOAT_VEC3:	return 3; break;
	case GL_FLOAT_VEC4:	return 4; break;

	// matrices
	case GL_FLOAT_MAT2: return 2; break;
	case GL_FLOAT_MAT3: return 3; break;
	case GL_FLOAT_MAT4: return 4; break;

	// samplers
	case GL_SAMPLER_1D:
	case GL_SAMPLER_2D:
	case GL_SAMPLER_3D:
	case GL_SAMPLER_CUBE:
	case GL_SAMPLER_1D_SHADOW:
	case GL_SAMPLER_2D_SHADOW:
		return 1;
		break;
	}

	return 0;
}


//======================
/** Returns TRUE, if hte uniform is of a matrix type.
 * @return Wether this is a matrix.
 */
//======================
bool CUniform::isMatrix( void ) const
{
	if( m_type == GL_FLOAT_MAT2 ||
		m_type == GL_FLOAT_MAT3 ||
		m_type == GL_FLOAT_MAT4 )
	{
		return true;
	}

	return false;
}


//======================
/** Converts OpenGL's symbolic type constants from integer to string representation.
 * This can be used to translate a queried type identifier into format the user can read.
 * If the type is unknown, a string containing the integer representation will be returned.
 * @param type The type symbol to translate.
 * @return A QString object with the string representation of the type.
 */
//======================
std::string CUniform::getTypeNameString( int type )
{
	switch( type )
	{
	case GL_FLOAT				: return std::string( "GL_FLOAT" ); break;
	case GL_FLOAT_VEC2			: return std::string( "GL_FLOAT_VEC2" ); break;
	case GL_FLOAT_VEC3			: return std::string( "GL_FLOAT_VEC3" ); break;
	case GL_FLOAT_VEC4			: return std::string( "GL_FLOAT_VEC4" ); break;
	case GL_INT					: return std::string( "GL_INT" ); break;
	case GL_INT_VEC2			: return std::string( "GL_INT_VEC2" ); break;
	case GL_INT_VEC3			: return std::string( "GL_INT_VEC3" ); break;
	case GL_INT_VEC4			: return std::string( "GL_INT_VEC4" ); break;
	case GL_BOOL				: return std::string( "GL_BOOL" ); break;
	case GL_BOOL_VEC2			: return std::string( "GL_BOOL_VEC2" ); break;
	case GL_BOOL_VEC3			: return std::string( "GL_BOOL_VEC3" ); break;
	case GL_BOOL_VEC4			: return std::string( "GL_BOOL_VEC4" ); break;
	case GL_FLOAT_MAT2			: return std::string( "GL_FLOAT_MAT2" ); break;
	case GL_FLOAT_MAT3			: return std::string( "GL_FLOAT_MAT3" ); break;
	case GL_FLOAT_MAT4			: return std::string( "GL_FLOAT_MAT4" ); break;
	case GL_SAMPLER_1D			: return std::string( "GL_SAMPLER_1D" ); break;
	case GL_SAMPLER_2D			: return std::string( "GL_SAMPLER_2D" ); break;
	case GL_SAMPLER_3D			: return std::string( "GL_SAMPLER_3D" ); break;
	case GL_SAMPLER_CUBE		: return std::string( "GL_SAMPLER_CUBE" ); break;
	case GL_SAMPLER_1D_SHADOW	: return std::string( "GL_SAMPLER_1D_SHADOW" ); break;
	case GL_SAMPLER_2D_SHADOW	: return std::string( "GL_SAMPLER_2D_SHADOW" ); break;
	}

	return std::string( "<unknown type %1>" ).arg( type );
}


#endif