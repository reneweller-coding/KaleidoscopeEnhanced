#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
// TronCycles.frag — solid light wall with a blazing top edge.
in vec4  vCol;   ///< Colour (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).

/**
 * @file TronCycles.frag
 * @brief Shades the light-cycle walls and arena floor grid of the Tron-style
 * duel as a solid light wall with a blazing top edge (vSide selects how far
 * across the wall's height this fragment sits).
 *
 * audioLevel and audioKick both scale the wall/edge brightness directly in
 * this stage; a prior reactivity pass noted this frag-side coupling barely
 * moves any pixels on its own -- the bulk of the audio response (racing
 * head flash on kicks, wall ignition on drops, chroma-tinted wall hue) is
 * computed per-vertex in the companion vertex shader (TronCycles.vert) and
 * arrives pre-baked in vCol.
 */

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float body = 0.45 + 0.25 * (vSide * 0.5 + 0.5);
    float edge = exp(-pow(1.0 - vSide, 2.0) * 6.0) * 0.9;   // top rim
    fragColor = vec4(vCol.rgb * (body + edge) * (1.5 + 0.55 * audioLevel + 0.6 * audioKick), 1.0);
}
