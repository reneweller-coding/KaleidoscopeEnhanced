#ifndef TEXTURE_EFFECT_H
#define TEXTURE_EFFECT_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "stdinc.h"

//Basic Class for effects
class TextureEffect
{
public:
	TextureEffect();
	~TextureEffect();
	
	
	virtual void initUniforms(int width, int height) = 0; // initialize GLSL - shader programs
	virtual void setUniforms( float time, float interpolation ) = 0; // setting uniforms
	virtual void resetParameters() = 0;
	void draw(); // draw scene
	void enableShader(); // draw scene
	
	void cleanShaderPrograms();//delete shaders

	
	void initUniformsCommon(int width, int height); // initialize GLSL - shader programs
	void setUniformsCommon( float time, float interpolation ); // setting uniforms
	void checkGLErrors( const char *label ); // check and print gl errors to stderr

protected:
	void drawWindow();

	unsigned int	m_width; // texture width
	unsigned int	m_height; // texture height

	//Shader and Uniforms
	GLuint			m_sh_prog_id; // id of shader program
	GLint			m_texPointUni1;
	GLint			m_texPointUni2;
	GLint			m_texSizeRcpUni;	
	GLint			m_timeUni;
    GLint			m_interpolationUni; //Interpolation between the textures

	char*			m_vertexShaderFilename;
	char*			m_fragmentShaderFilename;

};


#endif