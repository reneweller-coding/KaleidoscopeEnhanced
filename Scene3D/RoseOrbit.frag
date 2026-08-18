#version 330 core
out vec4 fragColor;
// RoseOrbit.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file RoseOrbit.frag
 * @brief Shades the particle streams that trace a spirograph rose curve
 * (r = cos(k*theta)), rendered as soft additive point sprites — a simple
 * Gaussian falloff from the sprite centre times the per-vertex colour vCol.
 *
 * This fragment stage reads no audio uniforms directly; the reactivity
 * (petal radius from audioBass, precession speed from audioAdvance, hue
 * drift from audioChromaHue, brightness from audioSwell) is computed
 * per-vertex in RoseOrbit.vert and arrives here already baked into vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
