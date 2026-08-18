#include <float.h>

#include "shader_setup.h"
#include "FxEffectKaleidoscope.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

// Constructor
FxEffectKaleidoscope::FxEffectKaleidoscope(): 
m_minSides(2)
, m_maxSides(14)
, m_speedAct(0.01)
, m_speed(0.02)
, m_speedMin(0.02)//-0.02
, m_speedMax(0.09)//0.4
, m_sides(8.0)
{
	EffectShader();
	m_vertexShaderFilename = "..\\standard.vert";
	m_fragmentShaderFilename = "..\\FX\\FxKaleidoscope.frag";

	m_sides = (float) ( (qrand() % m_maxSides) + m_minSides);
}

// Destructor
FxEffectKaleidoscope::~FxEffectKaleidoscope()
{
}

void FxEffectKaleidoscope::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 )
{
	EffectShader::setUniforms( time, interpolation, texLoc1, texLoc2 );

    glUniform1f( m_speedUni, m_speedAct );
	glUniform1f( m_sidesUni, m_sides );
}


/**
 * Sets up the GLSL runtime and creates shader.
 */
void FxEffectKaleidoscope::initUniforms(int width, int height)
{	
	EffectShader::initUniforms(width, height);
    m_sidesUni = glGetUniformLocation( m_sh_prog_id, "sides" );
    m_speedUni = glGetUniformLocation( m_sh_prog_id, "speed" );

	checkGLErrors("loadShader 2");
}

void FxEffectKaleidoscope::resetParameters()
{
	
	m_speed = (float) (m_speedMin + (((float)qrand() / (float) RAND_MAX) * (m_speedMax - m_speedMin)));
	if( fabs( m_speed ) < EPSILON )
		m_speed = EPSILON;
	m_speedAct = m_speed;

	m_sides = (float) ((qrand() % m_maxSides)  + m_minSides);
}