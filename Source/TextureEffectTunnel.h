/**
 * @file TextureEffectTunnel.h
 * @brief Kaleidoscope-base subclass adding a forward tunnel scroll-speed uniform, used by
 *        Tunnel.frag.
 */
#ifndef TEXTURE_EFFECT_TUNNEL_H
#define TEXTURE_EFFECT_TUNNEL_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "TextureEffectKaleidoscopeBase.h"

/**
 * @brief TextureEffectKaleidoscopeBase subclass driving Tunnel.frag's forward-scrolling tunnel look.
 *
 * Adds a single extra uniform, `speedTunnel`, on top of the kaleidoscope base's
 * sides/power/rotation state. Always compiles "..\\Scene2D\\Tunnel.frag" (set in
 * the constructor, overriding whatever the base class ctor chose). Disables the
 * base class's power-driven rotation (m_powerRotationAllowed = false) every time
 * resetParameters() runs, so this effect's kaleidoscope power never animates via
 * rotation. TextureEffectTunnelReverse derives from this class to add a second,
 * independent (negative-signed) scroll-speed uniform on top.
 */
class TextureEffectTunnel : public TextureEffectKaleidoscopeBase
{
public:
	/**
	 * @brief Construct with solo/interpolation timing ranges; fragment shader is fixed to Tunnel.frag.
	 * @param minTimeSolo Minimum seconds this effect stays solo once activated.
	 * @param maxTimeSolo Maximum seconds this effect stays solo once activated.
	 * @param minTimeInterpolation Minimum seconds spent cross-fading into/out of this effect.
	 * @param maxTimeInterpolation Maximum seconds spent cross-fading into/out of this effect.
	 */
	TextureEffectTunnel( unsigned int  minTimeSolo, unsigned int  maxTimeSolo, unsigned int  minTimeInterpolation, unsigned int  maxTimeInterpolation );
	/// Destructor. No extra cleanup beyond the base class.
	~TextureEffectTunnel();

	/**
	 * @brief Resolves the `speedTunnel` uniform location after chaining to TextureEffectKaleidoscopeBase::initUniforms().
	 * @param width Render target width in pixels.
	 * @param height Render target height in pixels.
	 */
	virtual void initUniforms(int width, int height); // initialize GLSL - shader programs
	/**
	 * @brief Uploads `speedTunnel` after chaining to TextureEffectKaleidoscopeBase::setUniforms().
	 * @param time Absolute animation time in seconds.
	 * @param interpolation Current cross-fade weight.
	 * @param texLoc1 Texture unit bound to the `tex0` sampler.
	 * @param texLoc2 Texture unit bound to the `tex1` sampler.
	 */
	virtual void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
	/**
	 * @brief Re-rolls the tunnel scroll speed and forces m_powerRotationAllowed off, after chaining to the base class.
	 */
	virtual void resetParameters();

protected:

    GLint		m_speedTunnelUni; ///< Location of the `speedTunnel` uniform.
    float			m_speedTunnel; ///< Rolled forward scroll speed, re-rolled by resetParameters().
    float			m_speedTunnelAct; ///< Active scroll speed value uploaded via `speedTunnel` (currently always equal to m_speedTunnel).
    float			m_speedTunnelMin; ///< Lower bound for rolling m_speedTunnel.
    float			m_speedTunnelMax; ///< Upper bound for rolling m_speedTunnel.

};


#endif