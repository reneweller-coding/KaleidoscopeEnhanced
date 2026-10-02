#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// RibbonTunnel.frag — soft-edged glowing ribbon (additive blending).
in vec4  vCol;   ///< Colour (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).

/**
 * @file RibbonTunnel.frag
 * @brief Shades the 20 twisting ribbons of the real-3D ribbon tunnel as a
 * soft-edged additive glow: a Gaussian falloff across the ribbon width
 * (vSide) multiplying the per-vertex colour vCol.
 *
 * This fragment stage reads no audio uniforms directly; the reactivity
 * (bar-phase twist from audioBarPhase, kick bulges from audioKick and
 * audioBass, swell breathing, hue drift from audioChromaHue, drop
 * brightening from audioDrop) is entirely computed in RibbonTunnel.vert and
 * arrives here already baked into vCol.
 */

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float glow = exp(-vSide * vSide * 3.0);
    fragColor = vec4(vCol.rgb * glow, 1.0);
}
