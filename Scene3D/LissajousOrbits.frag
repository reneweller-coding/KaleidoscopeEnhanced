#version 330 core
out vec4 fragColor;
// LissajousOrbits.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file LissajousOrbits.frag
 * @brief Additive point-sprite shader for six particle streams tracing
 * closed 3D Lissajous figures, rendering each point as a soft radial
 * glow.
 *
 * Colour, including the per-stream photo-palette hue and the
 * audioAdvance/audioSwell/audioBass/audioChromaHue/audioValence response
 * that shapes the streams and their brightness, is computed upstream in
 * LissajousOrbits.vert and arrives baked in vCol; this stage only applies
 * the Gaussian falloff from the point centre.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    // Blending is additive, so a single sprite is capped here: overlapping
    // trace cores still sum, but no one sprite can drive a pixel to white on
    // its own.
    fragColor = vec4(min(vCol.rgb * a, vec3(0.9)), 1.0);
}
