#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
// BioCell.frag — soft organic point (additive blending).
in vec4 vCol;   ///< Colour (from the vertex stage).

/**
 * @file BioCell.frag
 * @brief Shades a single soft, organic point sprite (a biological cell or
 * particle) as a Gaussian glow, additively blended into the frame.
 *
 * audioLevel and audioKick both add directly to the glow's brightness
 * multiplier, so the whole swarm of cells pulses brighter with the overall
 * loudness and on every kick; per the comment above, this frag-side pulse
 * was found to barely move any pixels in practice, so most of the scene's
 * audio reactivity actually lives in the companion vertex shader's per-point
 * motion (vCol already carries the base per-vertex colour).
 */

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    fragColor = vec4(vCol.rgb * a * (2.2 + 0.8 * audioLevel + 0.9 * audioKick), 1.0);
}
