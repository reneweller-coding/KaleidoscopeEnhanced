#version 330 core
out vec4 fragColor;
// Fireworks.frag — glowing spark (additive blending).
in vec4 vCol;

/**
 * @file Fireworks.frag
 * @brief Shades one firework spark as a soft radial glow point (additive
 * blending), a tight Gaussian falloff from the point-sprite center that
 * lets overlapping sparks pool into brighter bursts of light.
 *
 * This fragment shader declares no audio uniforms of its own; the spark's
 * audio-reactive color and brightness (vCol) are computed per-vertex by the
 * companion vertex shader and only shaped here by the radial falloff.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
