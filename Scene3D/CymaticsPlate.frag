#version 330 core
out vec4 fragColor;
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;
uniform float audioKick;
// CymaticsPlate.frag — sand grain sprite (additive): a bright core with a
// broad halo, so converged nodal lines read as glowing figures.
//
// WHY THE PROFILE IS AS WIDE AS IT IS.  The grains are drawn with GL_ONE/
// GL_ONE into an 8-bit target, and hundreds of them converge onto the SAME
// nodal line, so the sum there runs tens of times over white.  With the old
// exp(-r2*26) pin-prick (a ~1 px core inside a ~4 px sprite) a numeric replay
// of this scene measured 94 % of all emitted light being thrown away by that
// clamp: raw mean 0.587, clamped mean 0.034, and only 4.5 % of pixels holding
// any luma above 0.1 at all.  That is the whole reason the scene measured
// TOO_DARK, and it is why turning the GAIN up does nothing — an 8x gain sweep
// moved the frame mean by barely a fifth.  Spreading the same light over more
// pixels is the only lever that works, so the core is broad and the halo
// carries real weight.
in vec4 vCol;

/**
 * @file CymaticsPlate.frag
 * @brief Point-sprite shader for the Chladni-figure sand grains: an additive
 * dot with a bright core and a broad halo, so grains that have converged onto
 * a nodal line read as glowing figures rather than as clipped pin-pricks that
 * the frame's own downscale averages away.
 *
 * audioLevel and audioKick both boost the sprite's overall brightness; the
 * grain's own colour (vCol) and its position on the vibrating plate are
 * computed upstream in this scene's vertex/compute stage.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float a  = exp(-r2 * 9.0) + 0.42 * exp(-r2 * 2.6);
    fragColor = vec4(vCol.rgb * a * (1.55 + 0.55 * audioLevel + 0.75 * audioKick), 1.0);
}
