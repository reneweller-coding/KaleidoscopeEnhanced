/**
 * @file TextureEffectTunnelReverse.cpp
 * @brief Implementation of TextureEffectTunnelReverse: the counter-scrolling
 *        `speedTunnelReverse` uniform layered on top of TextureEffectTunnel.
 */
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

/// Uploads `speedTunnelReverse` after chaining to TextureEffectTunnel::setUniforms().
void TextureEffectTunnelReverse::setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 )
{
	TextureEffectTunnel::setUniforms( time, interpolation, texLoc1, texLoc2 );
	glUniform1f( m_speedTunnelReverseUni, m_speedTunnelReverseAct );
}


/**
 * @brief Sets up the GLSL runtime and creates shader.
 *
 * Chains to TextureEffectTunnel::initUniforms() then resolves `speedTunnelReverse`.
 */
void TextureEffectTunnelReverse::initUniforms(int width, int height)
{	
	TextureEffectTunnel::initUniforms(width, height);
    m_speedTunnelReverseUni = glGetUniformLocation( m_sh_prog_id, "speedTunnelReverse" );

	checkGLErrors("loadShader 2");
}


/**
 * @brief Re-rolls the reverse tunnel scroll speed.
 *
 * Chains to TextureEffectTunnel::resetParameters() first. m_speedTunnelReverseMin/Max
 * are declared with min(-0.001) NUMERICALLY GREATER than max(-0.08) - unlike every
 * other min/max pair in this hierarchy. That still lands in the intended negative
 * range because (max - min) is negative here too: at qrand()==0 the result is min
 * (-0.001), and at qrand()==RAND_MAX it is min + (max-min) = max (-0.08). So the lerp
 * direction flips along with the flipped bounds and the result stays in [-0.08,
 * -0.001] as intended - just via a less obvious route than TextureEffectTunnel's.
 * Unlike the base class, there is no near-zero clamp here.
 */
void TextureEffectTunnelReverse::resetParameters()
{
	TextureEffectTunnel::resetParameters();

	m_speedTunnelReverse = (float) (m_speedTunnelReverseMin + (((float)qrand() / (float) RAND_MAX) * (m_speedTunnelReverseMax - m_speedTunnelReverseMin)));
	m_speedTunnelReverseAct = m_speedTunnelReverse;//0.0;
}