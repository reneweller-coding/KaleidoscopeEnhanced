#version 330 core
out vec4 fragColor;
// Phyllotaxis.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file Phyllotaxis.frag
 * @brief Renders one floret of the 60,000-point golden-angle sunflower
 * head as a soft additive glow sprite.
 *
 * Reads no audio uniforms directly. The paired Phyllotaxis.vert places
 * each floret by a divergence angle that drifts slowly with audioSwell
 * (on top of a per-activation sceneSeed offset), breathes the dome height
 * with audioSwell, nudges the radius with audioBass, sweeps a ring of
 * light out from the centre once per bar via audioBarPhase, and colours
 * the head via audioChromaHue; this shader only shapes the resulting
 * vCol into a gaussian point.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
