#version 330 core
out vec4 fragColor;
// ParticleGalaxy.frag — soft round point sprite (additive blending).
in vec4 vCol;

/**
 * @file ParticleGalaxy.frag
 * @brief Renders one star of the 60,000-point 3D spiral galaxy as a soft
 * round additive glow sprite.
 *
 * Reads no audio uniforms directly. The paired ParticleGalaxy.vert builds
 * the log-spiral arms, pumps the central bulge with audioBass, rolls an
 * outward shock ring along audioBeatPhase on every audioKick, flares the
 * whole disc on audioDrop, and tints the palette from the current
 * slideshow photo (via audioChromaHue/audioAdvance/audioValence); this
 * shader only shapes the resulting vCol into a gaussian point.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
