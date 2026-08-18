#version 330 core
out vec4 fragColor;
// PlanetRings.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file PlanetRings.frag
 * @brief Renders one point of the pointillist gas-giant scene — planet
 * body, Kepler-orbiting rings, and far starfield — as a soft additive
 * glow sprite.
 *
 * Reads no audio uniforms directly. The paired PlanetRings.vert decides
 * which of the three layers a point belongs to and computes its motion
 * and colour: audioKick sends a density wave rolling outward through the
 * rings, audioBass wobbles them, audioSwell pulls the orbiting camera
 * closer, audioDrop brightens the rings further, and audioCentroid tints
 * overall brightness; this shader just shapes the resulting vCol into a
 * gaussian point.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 11.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
