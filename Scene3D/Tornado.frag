#version 330 core
out vec4 fragColor;
// Tornado.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file Tornado.frag
 * @brief Additive glow-sprite shader for the debris-vortex tornado scene:
 * renders each of the 60k funnel/debris/lightning-bolt points as a soft
 * round point of light.
 *
 * No audio uniforms are read here; the funnel's spin rate, kick-driven
 * cinching, snare-triggered forked-lightning bolts, and flung-debris flares
 * are all computed in the companion vertex shader (Tornado.vert) and arrive
 * pre-baked in vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
