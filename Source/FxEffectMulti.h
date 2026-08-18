#ifndef COMBINE_EFFECT_MULTI_H
#define COMBINE_EFFECT_MULTI_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "EffectShader.h"

//Basic Class for effects
class FxEffectMulti : public EffectShader
{
public:
	FxEffectMulti();
	~FxEffectMulti();
	
	
	void initUniforms(int width, int height); // initialize GLSL - shader programs
	void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	void resetParameters();

protected:

	
    GLint		m_copiesUni;

	float			m_copies;
	unsigned int	m_maxCopies;
	unsigned int	m_minCopies;

};


#endif