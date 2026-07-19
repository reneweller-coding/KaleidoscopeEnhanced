#ifndef TEXTURE_EFFECT_TUNNEL_REVERSE_H
#define TEXTURE_EFFECT_TUNNEL_REVERSE_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "TextureEffectTunnel.h"

//Basic Class for effects
class TextureEffectTunnelReverse : public TextureEffectTunnel
{
public:
	TextureEffectTunnelReverse( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	~TextureEffectTunnelReverse();
	
	void initUniforms(int width, int height); // initialize GLSL - shader programs
	void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	void resetParameters();

protected:
	
    GLint			m_speedTunnelReverseUni;
    float			m_speedTunnelReverse;
    float			m_speedTunnelReverseAct;
    float			m_speedTunnelReverseMin;
    float			m_speedTunnelReverseMax;
};


#endif