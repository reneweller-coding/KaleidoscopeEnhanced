#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// Frag-side music pulse (added by the deaf-scene pass: reactivity
// measured ~0 -- the vert-side coupling barely moved any pixels).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
// RollerCoaster.frag — glowing structure: bright core, soft halo.
in vec4  vCol;   ///< Colour (from the vertex stage).
in float vSide;   ///< Which side of a strip (from the vertex stage).

/**
 * @file RollerCoaster.frag
 * @brief Shades the glowing rails, ties, neon arch gates and scenery pylons
 * of the roller-coaster ride (the camera itself rides the procedural track
 * built in RollerCoaster.vert): a bright core plus a soft halo from the
 * per-vertex colour vCol, using vSide as the distance-from-centreline
 * falloff.
 *
 * audioLevel and audioKick give this fragment stage its own small extra
 * pulse on top of the colour vCol already carries — added after a reactivity
 * pass found the vertex-side coupling alone barely moved any pixels. The
 * richer audio response (throttle from audioAdvance, gate flashes from
 * audioKick, drop/build-up brightening from audioDrop and audioBuildUp, hue
 * from audioChromaHue) lives in RollerCoaster.vert.
 */

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float d    = abs(vSide);
    float core = exp(-d * d * 12.0);
    float halo = exp(-d * d * 2.5) * 0.30;
    fragColor = vec4(vCol.rgb * (core + halo) * (0.85 + 0.30 * audioLevel + 0.35 * audioKick), 1.0);
}
