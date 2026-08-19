/**
 * @file FxEffectKaleidoscope.h
 * @brief FX-overlay EffectShader subclass wrapping FxKaleidoscope.frag: a standalone
 *        kaleidoscope combine effect (distinct from the TextureEffectKaleidoscopeBase
 *        family - no power/rotation state, just sides + speed).
 */
#ifndef FX_EFFECT_KALEIDOSCOPE_H
#define FX_EFFECT_KALEIDOSCOPE_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "EffectShader.h"

/**
 * @brief EffectShader subclass driving FxKaleidoscope.frag's mirrored-segment combine effect.
 *
 * Directly derives from EffectShader (not from TextureEffectKaleidoscopeBase), so it
 * has none of that class's power/rotation state machinery - just two extra
 * uniforms, `sides` (mirror segment count) and `speed`, both re-rolled on
 * resetParameters(). Used as an "FX" (combine-stage) effect rather than a
 * standalone scene, per the ".." path to "FX\\FxKaleidoscope.frag".
 */
class FxEffectKaleidoscope : public EffectShader
{
public:
	/// Constructs the effect and rolls its initial `sides` value; fragment shader is fixed to FxKaleidoscope.frag.
	FxEffectKaleidoscope();
	/// Destructor. No extra cleanup beyond the EffectShader base.
	~FxEffectKaleidoscope();


	/**
	 * @brief Resolves the `sides` and `speed` uniform locations after chaining to EffectShader::initUniforms().
	 * @param width Render target width in pixels.
	 * @param height Render target height in pixels.
	 */
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs
	/**
	 * @brief Uploads `speed` and `sides` after chaining to EffectShader::setUniforms().
	 * @param time Absolute animation time in seconds.
	 * @param interpolation Current cross-fade weight.
	 * @param texLoc1 Texture unit bound to the `tex0` sampler.
	 * @param texLoc2 Texture unit bound to the `tex1` sampler.
	 */
	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	/**
	 * @brief Re-rolls `speed` (clamped away from zero) and `sides`. Does NOT chain to EffectShader::resetParameters() (base has nothing to re-roll for this class's own state; no registered Uniforms/timing to reset here).
	 */
	virtual void resetParameters();

protected:

    GLint		m_speedUni; ///< Location of the `speed` uniform.
	GLint		m_sidesUni; ///< Location of the `sides` uniform.


    float			m_speed; ///< Rolled animation speed, re-rolled by resetParameters().
    float			m_speedAct; ///< Active speed value uploaded via `speed` (currently always equal to m_speed).
    float			m_speedMin; ///< Lower bound for rolling m_speed.
    float			m_speedMax; ///< Upper bound for rolling m_speed.

	float			m_sides; ///< Rolled mirror-segment count, uploaded via `sides`, range [m_minSides, m_minSides+m_maxSides).
	unsigned int	m_maxSides; ///< Range width added to m_minSides when rolling m_sides.
	unsigned int	m_minSides; ///< Lower bound for rolling m_sides.

};


#endif