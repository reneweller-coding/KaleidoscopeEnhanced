#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// PortalRush.frag — soft-edged glowing gate band (additive blending).
in vec4  vCol;   ///< Colour (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).

/**
 * @file PortalRush.frag
 * @brief Shades one band segment of a torus-shaped portal gate in the
 * ring-gate slalom as a soft-edged glowing line (additive).
 *
 * Reads no audio uniforms directly. The paired PortalRush.vert races the
 * camera down the slalom on audioAdvance, pulses the nearest gate in
 * tempo via audioBeatPhase, flashes a gate on audioKick as it is passed,
 * flares every gate on audioDrop, and colours them via audioChromaHue;
 * this shader turns the resulting vCol and the cross-band vSide offset
 * into the glowing band.
 */

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float glow = exp(-vSide * vSide * 3.0);
    fragColor = vec4(vCol.rgb * glow, 1.0);
}
