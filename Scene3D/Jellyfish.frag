#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
// Jellyfish.frag — soft glowing point (additive blending).
in vec4 vCol;   ///< Colour (from the vertex stage).

/**
 * @file Jellyfish.frag
 * @brief Additive point-sprite shader for a bloom of bioluminescent
 * jellyfish, rendering each point (bell shell or trailing tentacle
 * particle) as a soft radial glow.
 *
 * The colour (vCol) is fully computed upstream in Jellyfish.vert, where
 * the beat-phase pulse, onset flashes and drop brighten each jelly; this
 * stage only shapes a Gaussian falloff from the point's centre and
 * multiplies it onto that colour for additive blending.
 */

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a * 3.0, 1.0);
}
