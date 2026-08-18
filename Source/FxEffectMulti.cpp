#include <float.h>

#include "shader_setup.h"
#include "FxEffectMulti.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

// Constructor
FxEffectMulti::FxEffectMulti(): 
m_minCopies(3)
, m_maxCopies(12)
, m_copies(4.0)
{
	EffectShader();

	m_vertexShaderFilename = "..\\standard.vert";
	m_fragmentShaderFilename = "..\\FX\\FxMulti.frag";

	m_copies = (float) ( (qrand() % m_maxCopies) + m_minCopies);
}

// Destructor
FxEffectMulti::~FxEffectMulti()
{
}

void FxEffectMulti::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 )
{
	EffectShader::setUniforms( time, interpolation, texLoc1, texLoc2 );
	glUniform1f( m_copiesUni, m_copies );
}


/**
 * Sets up the GLSL runtime and creates shader.
 */
void FxEffectMulti::initUniforms(int width, int height)
{	
	EffectShader::initUniforms(width, height);
    m_copiesUni = glGetUniformLocation( m_sh_prog_id, "copies" );

	checkGLErrors("loadShader 2");
}

void FxEffectMulti::resetParameters()
{
	m_copies = (float) ((qrand() % m_maxCopies)  + m_minCopies);
}