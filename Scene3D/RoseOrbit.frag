#version 330 core
out vec4 fragColor;
// RoseOrbit.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file RoseOrbit.frag
 * @brief Shades the particle streams that trace three nested spirograph rose
 * curves (r = cos(k*theta)) plus the pollen field drifting between them,
 * rendered as soft additive point sprites — a simple Gaussian falloff from
 * the sprite centre times the per-vertex colour vCol.
 *
 * This fragment stage reads no audio uniforms directly; every mapping is
 * computed per-vertex in RoseOrbit.vert and arrives here baked into vCol.
 *
 * Audio Reactivity (all applied in RoseOrbit.vert):
 *   audioAdvance   -> flow along the curves + 3-axis precession + pollen drift
 *   audioBass      -> petal radius pulse
 *   audioSwell     -> overall glow of the three roses and the pollen
 *   audioChromaHue -> hue turn along theta (musical key)
 *   audioSpread    -> dispersion of the streams (thin drawn line vs soft tube)
 *                     and how wide the pollen field opens
 *   audioRoughness -> petal fray (clean arc vs serrated outline)
 *   audioMode      -> petal temperature (minor = all roses blue, major =
 *                     the warm pink / amber pair)
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
