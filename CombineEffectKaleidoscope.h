#ifndef COMBINE_EFFECT_KALEIDOSCOPE_H
#define COMBINE_EFFECT_KALEIDOSCOPE_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "EffectShader.h"

//Basic Class for effects
class CombineEffectKaleidoscope : public EffectShader
{
public:
	CombineEffectKaleidoscope();
	~CombineEffectKaleidoscope();
	
	
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs
	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	virtual void resetParameters();

protected:
	
    GLint		m_speedUni;
	GLint		m_sidesUni;

	
    float			m_speed;
    float			m_speedAct;
    float			m_speedMin;
    float			m_speedMax;

	float			m_sides;
	unsigned int	m_maxSides;
	unsigned int	m_minSides;

};


#endif