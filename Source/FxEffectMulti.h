/**
 * @file FxEffectMulti.h
 * @brief FX-overlay EffectShader subclass wrapping FxMulti.frag: a "multiply/tile the
 *        image N times" combine effect.
 */
#ifndef COMBINE_EFFECT_MULTI_H
#define COMBINE_EFFECT_MULTI_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "EffectShader.h"

/**
 * @brief EffectShader subclass driving FxMulti.frag's tiled/multiplied-copies combine effect.
 *
 * The simplest of this file group: adds exactly one extra uniform, `copies`
 * (how many times the source image is tiled/repeated), re-rolled on
 * resetParameters(). Used as an "FX" (combine-stage) effect, per the ".."
 * path to "FX\\FxMulti.frag".
 */
class FxEffectMulti : public EffectShader
{
public:
	/// Constructs the effect and rolls its initial `copies` value; fragment shader is fixed to FxMulti.frag.
	FxEffectMulti();
	/// Destructor. No extra cleanup beyond the EffectShader base.
	~FxEffectMulti();


	/**
	 * @brief Resolves the `copies` uniform location after chaining to EffectShader::initUniforms(). Overrides the (implicitly still virtual) base signature even though `virtual` is not repeated here.
	 * @param width Render target width in pixels.
	 * @param height Render target height in pixels.
	 */
	void initUniforms(int width, int height); // initialize GLSL - shader programs
	/**
	 * @brief Uploads `copies` after chaining to EffectShader::setUniforms(). Overrides the (implicitly still virtual) base signature.
	 * @param time Absolute animation time in seconds.
	 * @param interpolation Current cross-fade weight.
	 * @param texLoc1 Texture unit bound to the `tex0` sampler.
	 * @param texLoc2 Texture unit bound to the `tex1` sampler.
	 */
	void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	/**
	 * @brief Re-rolls `copies`. Overrides the (implicitly still virtual) base signature. Does NOT chain to EffectShader::resetParameters().
	 */
	void resetParameters();

protected:


    GLint		m_copiesUni; ///< Location of the `copies` uniform.

	float			m_copies; ///< Rolled tile/copy count, uploaded via `copies`, range [m_minCopies, m_minCopies+m_maxCopies).
	unsigned int	m_maxCopies; ///< Range width added to m_minCopies when rolling m_copies.
	unsigned int	m_minCopies; ///< Lower bound for rolling m_copies.

};


#endif