#ifndef TEXTURE_EFFECT_KALEIDOSCOPE_BASE_H
#define TEXTURE_EFFECT_KALEIDOSCOPE_BASE_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "EffectShader.h"


//Basic Class for effects
class TextureEffectKaleidoscopeBase : public EffectShader
{
public:
	TextureEffectKaleidoscopeBase( const QString &filename, unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	TextureEffectKaleidoscopeBase( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	~TextureEffectKaleidoscopeBase();
	
	
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs
	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	virtual void resetParameters();

protected:
	
    GLint       m_interpolationRotationUni;
    GLint		m_speedUni;
    GLint       m_powerUni;
	GLint		m_sidesUni;



	QTime		    m_timeRotation;
    float           m_timeSoloRotation;
    float           m_timeInterpolationRotation;
    float           m_interpolationRotation;
    float           m_deltaRotation;
    unsigned int    m_timeSoloRotationMin;
    unsigned int    m_timeSoloRotationMax;
    unsigned int    m_timeInterpolationRotationMin;
    unsigned int    m_timeInterpolationRotationMax;
    float           m_speedRotationMin;
    float           m_speedRotationMax;
	unsigned int	m_stateRotation;

	
    float			m_speed;
    float			m_speedAct;
    float			m_speedMin;
    float			m_speedMax;
    float			m_speedKaleidoscope;
    float			m_speedKaleidoscopeAct;
    float			m_speedKaleidoscopeMin;
    float			m_speedKaleidoscopeMax;
    
	QTime		    m_timePower;
    unsigned int    m_statePower;
    float           m_timeSoloPower;
    float           m_timeInterpolationPower;
    float           m_interpolationPower;
    unsigned int    m_timeSoloPowerFullMin;
    unsigned int    m_timeSoloPowerFullMax;
    unsigned int    m_timeSoloPowerNoMin;
    unsigned int    m_timeSoloPowerNoMax;
    unsigned int    m_timeInterpolationPowerMin;
    unsigned int    m_timeInterpolationPowerMax;

    float           m_power;
    float           m_powerMin;
    float           m_powerMax;
    float           m_powerProbability;
    bool            m_powerRotationAllowed;

	float			m_sides;
	unsigned int	m_maxSides;
	unsigned int	m_minSides;

};


#endif