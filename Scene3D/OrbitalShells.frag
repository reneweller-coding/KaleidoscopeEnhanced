#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// OrbitalShells.frag — soft glowing point (additive blending).
in vec4 vCol;   ///< Colour (from the vertex stage).

/**
 * @file OrbitalShells.frag
 * @brief Renders one particle of the glowing-nucleus-plus-four-electron-
 * shells "atom" as a soft additive glow sprite.
 *
 * Reads no audio uniforms directly. The paired OrbitalShells.vert computes
 * per-particle position and colour: the nucleus breathes with
 * audioSubBass, each of the four precessing shells is keyed to its own
 * register (audioBass/audioMid/audioHigh), audioSwell scales overall
 * brightness, and audioChromaHue sets the per-shell hue; this shader just
 * shapes the resulting vCol into a round gaussian point.
 */

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
