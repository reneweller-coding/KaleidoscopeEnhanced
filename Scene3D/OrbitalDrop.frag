#version 330 core
out vec4 fragColor;
// OrbitalDrop.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file OrbitalDrop.frag
 * @brief Renders one particle of the endless atmospheric-re-entry loop
 * (stars, plasma streaks, clouds, city lights, sonic-boom ring) as a soft
 * additive glow sprite.
 *
 * Reads no audio uniforms directly. Which of the five layers a particle
 * belongs to, its motion, and its colour are all decided in the paired
 * OrbitalDrop.vert, which reacts to audioAdvance (falls the camera through
 * the loop and drifts the frustum-spread star field),
 * audioKick and audioSwell (plasma-burn intensity), audioLevel
 * (streak speed), audioChromaHue (city neon colour) and audioDrop (the
 * sonic-boom ring); this shader only turns the resulting vCol into a
 * round gaussian point.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
