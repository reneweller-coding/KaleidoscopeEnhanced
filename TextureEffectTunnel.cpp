#include <float.h>

#include "shader_setup.h"
#include "TextureEffectTunnel.h"

#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>

#include<GL/GLU.h>

// Constructor
TextureEffectTunnel::TextureEffectTunnel( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation ): 
TextureEffectKaleidoscopeBase(minTimeSolo, maxTimeSolo, minTimeInterpolation, maxTimeInterpolation)
, m_speedTunnelAct(0.005)
, m_speedTunnel(0.005)
, m_speedTunnelMin(0.001)//-0.02
, m_speedTunnelMax(0.08)//0.4
{
	m_vertexShaderFilename = "..\\standard.vert";
	m_fragmentShaderFilename = "..\\Tunnel.frag";
}

// Destructor
TextureEffectTunnel::~TextureEffectTunnel()
{
}

void TextureEffectTunnel::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 )
{
	TextureEffectKaleidoscopeBase::setUniforms( time, interpolation, texLoc1, texLoc2 );
	glUniform1f( m_speedTunnelUni, m_speedTunnelAct );
}


/**
 * Sets up the GLSL runtime and creates shader.
 */
void TextureEffectTunnel::initUniforms(int width, int height)
{	
	TextureEffectKaleidoscopeBase::initUniforms(width, height);
    m_speedTunnelUni = glGetUniformLocation( m_sh_prog_id, "speedTunnel" );

	checkGLErrors("loadShader 2");
}


void TextureEffectTunnel::resetParameters()
{
	TextureEffectKaleidoscopeBase::resetParameters();

	m_speedTunnel = (float) (m_speedTunnelMin + (((float)qrand() / (float) RAND_MAX) * (m_speedTunnelMax - m_speedTunnelMin)));
	if( fabs( m_speedTunnel ) < 0.01 )
		m_speedTunnel = 0.01;
	m_speedTunnelAct = m_speedTunnel;//0.0;
	m_powerRotationAllowed = false;
}