#ifndef EFFECT_SHADER_H
#define EFFECT_SHADER_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "stdinc.h"
#include "Uniform.h"

//Basic Class for effects
class EffectShader
{
public:
	EffectShader();
	EffectShader( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	EffectShader( const QString &filenameFragmentShader, unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	~EffectShader();
	
	
	//virtual void initUniforms(int width, int height) = 0; // initialize GLSL - shader programs
	//virtual void setUniforms( float time, float interpolation, GLint texPointUni1, GLint m_texPointUni2 ) = 0; // setting uniforms
	virtual void resetParameters();
	virtual void draw(); // draw scene
	virtual void enableShader(); // draw scene

	void startInterpolators();
	
	void cleanShaderPrograms();//delete shaders

	
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs
	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	virtual void checkGLErrors( const char *label ); // check and print gl errors to stderr

	void addUniform( const QString &name, float minf, float maxf );
	void addUniform( const QString &name, int minf, int maxf );
	void addUniform( const QString &name, float pro );
		
	void addUniformInterpolator( const QString &name, float interpolatorMinMinf,
							  float interpolatorMinMaxf,
							  float interpolatorMaxMinf,
							  float interpolatorMaxMaxf );

	unsigned int getTimeSolo();
	unsigned int getTimeInterpolation();

	void setComplexity( unsigned int complexity ) {m_complexity = complexity;};
	unsigned int getComplexity() {return m_complexity;};
	void setProbability( float probability ){ m_probability = probability; };
	bool useShader();

protected:
	unsigned int getInterpolatedTime( unsigned int minTime, unsigned int maxTime );
	void drawWindow();

	unsigned int	m_width; // Combine width
	unsigned int	m_height; // Combine height

	//Shader and Uniforms
	GLuint			m_sh_prog_id; // id of shader program
	GLint			m_texPointUni1;
	GLint			m_texPointUni2;
	GLint			m_texSizeRcpUni;	
	GLint			m_timeUni;
    GLint			m_interpolationUni; //Interpolation between the Combines

	char*			m_vertexShaderFilename;
	char*			m_fragmentShaderFilename;


	
	unsigned int  m_timeSolo;
	unsigned int  m_timeInterpolation;

	unsigned int  m_minTimeSolo;
	unsigned int  m_maxTimeSolo;
	unsigned int  m_minTimeInterpolation;
	unsigned int  m_maxTimeInterpolation;

	unsigned int  m_complexity;

	float	m_probability;


	std::vector< Uniform *> m_uniforms;

};


#endif