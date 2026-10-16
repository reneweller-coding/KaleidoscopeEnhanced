//---------------------------------------------------------------------------
//                              TextureEffectTunnelReverse
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Tunnel subclass adding a second, independently-signed scroll-speed uniform, used by TunnelReverse.frag.
 *
 *  @author René Weller
 */

#ifndef TEXTURE_EFFECT_TUNNEL_REVERSE_H
#define TEXTURE_EFFECT_TUNNEL_REVERSE_H

#include <QtOpenGL/QGLWidget>
#include <QtCore/QTime>
#include <QtCore/QThread>
#include "TextureEffectTunnel.h"

/** @class TextureEffectTunnelReverse
 *
 * TextureEffectTunnel subclass driving TunnelReverse.frag's counter-scrolling tunnel look.
 *
 * Adds a second scroll-speed uniform, `speedTunnelReverse`, on top of the base
 * class's own `speedTunnel`. Always compiles "..\\Scene2D\\TunnelReverse.frag"
 * (set in the constructor, overriding whatever the parent chain chose). Its
 * min/max rolling range is inverted (min > max, both negative) relative to the
 * base class's speedTunnel range - see resetParameters() in the .cpp for why
 * that still produces a negative value despite the inverted bounds.
 **/
class TextureEffectTunnelReverse : public TextureEffectTunnel
{
public:
    /**  Construct with solo/interpolation timing ranges; fragment shader is fixed to TunnelReverse.frag.
     *
     * @param minTimeSolo           Minimum seconds this effect stays solo once activated. (in)
     * @param maxTimeSolo           Maximum seconds this effect stays solo once activated. (in)
     * @param minTimeInterpolation  Minimum seconds spent cross-fading into/out of this effect. (in)
     * @param maxTimeInterpolation  Maximum seconds spent cross-fading into/out of this effect. (in)
     **/
    TextureEffectTunnelReverse( unsigned int minTimeSolo, unsigned int maxTimeSolo, unsigned int minTimeInterpolation,
                                unsigned int maxTimeInterpolation );
    /**  Destructor.
     *
     * No extra cleanup beyond the base class.
     **/
    ~TextureEffectTunnelReverse();

    /**  Resolves the `speedTunnelReverse` uniform location after chaining to TextureEffectTunnel::initUniforms().
     *
     * @param width   Render target width in pixels. (in)
     * @param height  Render target height in pixels. (in)
     *
     * The `virtual` keyword is not repeated here, but the base class chain already
     * declared this signature virtual, so this is still a genuine polymorphic override.
     **/
    void initUniforms( int width, int height ); // initialize GLSL - shader programs
    /**  Uploads `speedTunnelReverse` after chaining to TextureEffectTunnel::setUniforms().
     *
     * @param time           Absolute animation time in seconds. (in)
     * @param interpolation  Current cross-fade weight. (in)
     * @param texLoc1        Texture unit bound to the `tex0` sampler. (in)
     * @param texLoc2        Texture unit bound to the `tex1` sampler. (in)
     *
     * Overrides the (implicitly still virtual) base signature.
     **/
    void setUniforms( float time, float interpolation, GLint texLoc1, GLint texLoc2 ); // setting uniforms
    /**  Re-rolls the reverse tunnel scroll speed, after chaining to TextureEffectTunnel::resetParameters().
     *
     * Overrides the (implicitly still virtual) base signature.
     **/
    void resetParameters();

protected:
    GLint m_speedTunnelReverseUni; ///< Location of the `speedTunnelReverse` uniform.
    float m_speedTunnelReverse;    ///< Rolled reverse scroll speed, re-rolled by resetParameters().
    float m_speedTunnelReverseAct; ///< Active reverse scroll speed value uploaded via `speedTunnelReverse` (currently
                                   ///< always equal to m_speedTunnelReverse).
    float m_speedTunnelReverseMin; ///< Lower bound for rolling m_speedTunnelReverse (0 to -0.001).
    float m_speedTunnelReverseMax; ///< Upper bound for rolling m_speedTunnelReverse (0 to -0.08; numerically LESS than
                                   ///< the min, see resetParameters()).
};


#endif
