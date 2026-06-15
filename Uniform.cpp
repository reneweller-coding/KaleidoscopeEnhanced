//=============================================================================
/** @file:		uniform.cpp
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

#include "uniform.h"
#include "shader_setup.h"
#include "qt6compat.h"   // qrand() shim for Qt6

#include<GL/GLU.h>

Uniform::Uniform( const QString &name, baseType_e type )
{
	m_name = name;
	m_type = type;
}


Uniform::~Uniform(  )
{
}

void Uniform::resetParameters()
{
	if( m_type == BASE_TYPE_FLOAT )
	{
		m_data.vf = (float) (m_dataMin.vf + (((float)qrand() / (float) RAND_MAX) * (m_dataMax.vf - m_dataMin.vf)));
	}
	else if( m_type == BASE_TYPE_BOOL )
	{
		float des = (float) (qrand()) / (float) RAND_MAX;

		if( des > m_dataMin.vf )
			m_data.vi = 1;
		else 
			m_data.vi = 0;
	}
	else if( m_type == BASE_TYPE_INT )
	{
		m_data.vi = m_dataMin.vi + (qrand() % (m_dataMax.vi - m_dataMin.vi));
	}
	else if( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
	{
		//Warning double use of m_dataMax/Min.vf
		m_dataMin.vf = (float) (m_dataMinMin.vf + (((float)qrand() / (float) RAND_MAX) * (m_dataMinMax.vf - m_dataMinMin.vf)));
		m_dataMax.vf = (float) (m_dataMaxMin.vf + (((float)qrand() / (float) RAND_MAX) * (m_dataMaxMax.vf - m_dataMaxMin.vf)));

		m_delta.vf = (m_dataMax.vf - m_dataMin.vf) / m_totalTime.vf * 0.001; //time in sec delta in msec
		
		m_data.vf = m_dataMin.vf;

		m_increasing = false;
		m_initTimer = false;
	}
}

void Uniform::resetParameters( float time )
{
	if( m_type == BASE_TYPE_FLOAT )
	{
		m_data.vf = (float) (m_dataMin.vf + (((float)qrand() / (float) RAND_MAX) * (m_dataMax.vf - m_dataMin.vf)));
	}
	else if( m_type == BASE_TYPE_BOOL )
	{
		float des = (float) (qrand()) / (float) RAND_MAX;

		if( des > m_dataMin.vf )
			m_data.vi = 1;
		else 
			m_data.vi = 0;
	}
	else if( m_type == BASE_TYPE_INT )
	{
		m_data.vi = m_dataMin.vi + (qrand() % (m_dataMax.vi - m_dataMin.vi));
	}
	else if( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
	{	
		//Warning double use of m_dataMax/Min.vf
		m_dataMin.vf = (float) (m_dataMinMin.vf + (((float)qrand() / (float) RAND_MAX) * (m_dataMinMax.vf - m_dataMinMin.vf)));
		m_dataMax.vf = (float) (m_dataMaxMin.vf + (((float)qrand() / (float) RAND_MAX) * (m_dataMaxMax.vf - m_dataMaxMin.vf)));

		m_totalTime.vf = time;

		//m_delta.vf = (m_dataMax.vf - m_dataMin.vf) / m_totalTime.vf * 0.001; //time in sec delta in msec
		
		//m_data.vf = m_dataMin.vf;

		m_increasing = false;
		m_initTimer = false;
	}
}

void Uniform::initUniform( unsigned int sh_prog_id )
{
	
	QByteArray ba = m_name.toLocal8Bit();
	const char* name = ba.data();//toAscii().constData();

	m_location = glGetUniformLocation( sh_prog_id, name );
}

void Uniform::startInterpolator()
{
	if( m_type == BASE_TYPE_INTERPOLATOR_FLOAT )
	{
		m_initTimer = true;
		m_increasing = false;
	}
}


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
			m_delta.vf = (m_dataMax.vf - m_dataMin.vf) / m_totalTime.vf * 0.001; //time in sec delta in msec
			
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
void Uniform::setGLValueScaled(float scale)
{
	if (m_location < 0) return;

	if (m_type == BASE_TYPE_FLOAT || m_type == BASE_TYPE_INTERPOLATOR_FLOAT)
		glUniform1f(m_location, m_data.vf * scale);
	// int / bool uniforms are not scaled
}


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
CUniform::CUniform( const QString & name, int type, int location )
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

	CUniform u( m_name + QString( "[%1]" ).arg( column ), type );

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
QString CUniform::getTypeNameString( int type )
{
	switch( type )
	{
	case GL_FLOAT				: return QString( "GL_FLOAT" ); break;
	case GL_FLOAT_VEC2			: return QString( "GL_FLOAT_VEC2" ); break;
	case GL_FLOAT_VEC3			: return QString( "GL_FLOAT_VEC3" ); break;
	case GL_FLOAT_VEC4			: return QString( "GL_FLOAT_VEC4" ); break;
	case GL_INT					: return QString( "GL_INT" ); break;
	case GL_INT_VEC2			: return QString( "GL_INT_VEC2" ); break;
	case GL_INT_VEC3			: return QString( "GL_INT_VEC3" ); break;
	case GL_INT_VEC4			: return QString( "GL_INT_VEC4" ); break;
	case GL_BOOL				: return QString( "GL_BOOL" ); break;
	case GL_BOOL_VEC2			: return QString( "GL_BOOL_VEC2" ); break;
	case GL_BOOL_VEC3			: return QString( "GL_BOOL_VEC3" ); break;
	case GL_BOOL_VEC4			: return QString( "GL_BOOL_VEC4" ); break;
	case GL_FLOAT_MAT2			: return QString( "GL_FLOAT_MAT2" ); break;
	case GL_FLOAT_MAT3			: return QString( "GL_FLOAT_MAT3" ); break;
	case GL_FLOAT_MAT4			: return QString( "GL_FLOAT_MAT4" ); break;
	case GL_SAMPLER_1D			: return QString( "GL_SAMPLER_1D" ); break;
	case GL_SAMPLER_2D			: return QString( "GL_SAMPLER_2D" ); break;
	case GL_SAMPLER_3D			: return QString( "GL_SAMPLER_3D" ); break;
	case GL_SAMPLER_CUBE		: return QString( "GL_SAMPLER_CUBE" ); break;
	case GL_SAMPLER_1D_SHADOW	: return QString( "GL_SAMPLER_1D_SHADOW" ); break;
	case GL_SAMPLER_2D_SHADOW	: return QString( "GL_SAMPLER_2D_SHADOW" ); break;
	}

	return QString( "<unknown type %1>" ).arg( type );
}


#endif