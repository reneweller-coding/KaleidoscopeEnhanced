/**
 * @file TextureEffect.h
 * @brief Header-only abstract interface for a texture effect shader (pre-EffectShader
 *        design: initUniforms/setUniforms are pure virtual, no lazy compilation).
 */
#ifndef TEXTURE_EFFECT_H
#define TEXTURE_EFFECT_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "stdinc.h"

/**
 * @brief Minimal abstract base for a single-GLSL-program texture effect.
 *
 * An earlier, simpler sibling of EffectShader: it wraps the same idea (one
 * compiled vertex/fragment program plus the common tex0/tex1/resolution/time/
 * interpolation uniforms) but with no lazy compilation, no randomised Uniform
 * list, and no audio-feature or formula-layer support. initUniforms(),
 * setUniforms() and resetParameters() are pure virtual, so every subclass must
 * supply its own GL setup and per-frame uniform upload. Kept for reference /
 * potential reuse; the active class hierarchy (TextureEffectKaleidoscopeBase
 * and its descendants) derives from EffectShader instead.
 */
class TextureEffect
{
public:
	/// Constructor. Implementation not present in this header-only interface class.
	TextureEffect();
	/// Destructor. Implementation not present in this header-only interface class.
	~TextureEffect();


	/**
	 * @brief Initializes the GLSL shader program and resolves its uniform locations.
	 * @param width Render target width in pixels.
	 * @param height Render target height in pixels.
	 */
	virtual void initUniforms(int width, int height) = 0; // initialize GLSL - shader programs
	/**
	 * @brief Uploads this frame's uniform values to the active shader program.
	 * @param time Absolute animation time in seconds.
	 * @param interpolation Current cross-fade weight.
	 */
	virtual void setUniforms( float time, float interpolation ) = 0; // setting uniforms
	/// Re-rolls this effect's randomised parameters for its next activation.
	virtual void resetParameters() = 0;
	/// Draws the effect (expected to call drawWindow() in an implementation).
	void draw(); // draw scene
	/// Activates this effect's shader program for rendering.
	void enableShader(); // draw scene

	/// Deletes the compiled shader program.
	void cleanShaderPrograms();//delete shaders


	/**
	 * @brief Shared helper for resolving the common (tex0/tex1/resolution/time/interpolation) uniform locations.
	 * @param width Render target width in pixels.
	 * @param height Render target height in pixels.
	 */
	void initUniformsCommon(int width, int height); // initialize GLSL - shader programs
	/**
	 * @brief Shared helper for uploading the common per-frame uniform values.
	 * @param time Absolute animation time in seconds.
	 * @param interpolation Current cross-fade weight.
	 */
	void setUniformsCommon( float time, float interpolation ); // setting uniforms
	/**
	 * @brief Checks and prints any pending OpenGL error to stderr.
	 * @param label Short tag identifying the call site.
	 */
	void checkGLErrors( const char *label ); // check and print gl errors to stderr

protected:
	/// Clears the framebuffer and draws the effect's fullscreen quad.
	void drawWindow();

	unsigned int	m_width; ///< Texture width in pixels.
	unsigned int	m_height; ///< Texture height in pixels.

	//Shader and Uniforms
	GLuint			m_sh_prog_id; ///< Id of the compiled shader program.
	GLint			m_texPointUni1; ///< Location of the `tex0` sampler uniform.
	GLint			m_texPointUni2; ///< Location of the `tex1` sampler uniform.
	GLint			m_texSizeRcpUni;	///< Location of the `resolution` uniform.
	GLint			m_timeUni; ///< Location of the `time` uniform.
    GLint			m_interpolationUni; ///< Interpolation between the textures: location of the `interpolation` uniform.

	char*			m_vertexShaderFilename; ///< Path to the vertex shader source.
	char*			m_fragmentShaderFilename; ///< Path to the fragment shader source.

};


#endif