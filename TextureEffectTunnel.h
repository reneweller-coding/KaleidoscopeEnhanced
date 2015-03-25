#ifndef TEXTURE_EFFECT_TUNNEL_H
#define TEXTURE_EFFECT_TUNNEL_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "TextureEffectKaleidoscopeBase.h"

//Basic Class for effects
class TextureEffectTunnel : public TextureEffectKaleidoscopeBase
{
public:
	TextureEffectTunnel( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	~TextureEffectTunnel();
	
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs
	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	virtual void resetParameters();

protected:
	
    GLint		m_speedTunnelUni;
    float			m_speedTunnel;
    float			m_speedTunnelAct;
    float			m_speedTunnelMin;
    float			m_speedTunnelMax;

};


#endif