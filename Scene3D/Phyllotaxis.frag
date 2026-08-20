#version 330 core
out vec4 fragColor;
// Phyllotaxis.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file Phyllotaxis.frag
 * @brief Renders one floret of the 60,000-point golden-angle sunflower
 * head as a soft additive glow sprite.
 *
 * Reads no audio uniforms directly -- every mapping lives in the paired
 * Phyllotaxis.vert and arrives here baked into vCol / the point size. This
 * shader only shapes the result into a gaussian point.
 *
 * Audio Reactivity (all applied in Phyllotaxis.vert):
 *   audioBarPhase  -> ring of light rolling centre -> rim once per bar
 *   audioSwell     -> dome breath, divergence-angle drift, overall glow
 *   audioBass      -> small radius pulse of the whole head
 *   audioChromaHue -> hue wind along the spiral (musical key)
 *   audioSpread    -> how far the seed head opens (narrow tone = packed,
 *                     rich harmonics = spread wide)
 *   audioRolloff   -> dome height (bass-heavy = flat, highs = lifted crown)
 *   audioMode      -> floret temperature (minor = cold blue-violet head,
 *                     major = warm sunflower gold)
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
