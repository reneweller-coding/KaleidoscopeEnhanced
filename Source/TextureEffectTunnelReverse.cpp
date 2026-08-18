#include <float.h>

#include "shader_setup.h"
#include "TextureEffectTunnelReverse.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

// Constructor
TextureEffectTunnelReverse::TextureEffectTunnelReverse( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation ): 
TextureEffectTunnel(minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation)
, m_speedTunnelReverseAct(-0.005)
, m_speedTunnelReverse(-0.005)
, m_speedTunnelReverseMin(-0.001)//-0.02
, m_speedTunnelReverseMax(-0.08)//0.4
{
	m_vertexShaderFilename = "..\\standard.vert";
	m_fragmentShaderFilename = "..\\Scene2D\\TunnelReverse.frag";
}

// Destructor
TextureEffectTunnelReverse::~TextureEffectTunnelReverse()
{
}

void TextureEffectTunnelReverse::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 )
{
	TextureEffectTunnel::setUniforms( time, interpolation, texLoc1, texLoc2 );
	glUniform1f( m_speedTunnelReverseUni, m_speedTunnelReverseAct );
}


/**
 * Sets up the GLSL runtime and creates shader.
 */
void TextureEffectTunnelReverse::initUniforms(int width, int height)
{	
	TextureEffectTunnel::initUniforms(width, height);
    m_speedTunnelReverseUni = glGetUniformLocation( m_sh_prog_id, "speedTunnelReverse" );

	checkGLErrors("loadShader 2");
}


void TextureEffectTunnelReverse::resetParameters()
{
	TextureEffectTunnel::resetParameters();

	m_speedTunnelReverse = (float) (m_speedTunnelReverseMin + (((float)qrand() / (float) RAND_MAX) * (m_speedTunnelReverseMax - m_speedTunnelReverseMin)));
	m_speedTunnelReverseAct = m_speedTunnelReverse;//0.0;
}