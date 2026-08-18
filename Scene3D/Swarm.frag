#version 330 core
out vec4 fragColor;
// Swarm.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file Swarm.frag
 * @brief Additive glow-sprite shader for the murmuration/flock scene: draws
 * each of the 60k trailing points as a soft round point of light.
 *
 * No audio uniforms are read here; the flock's scatter/tighten response to
 * onsets and drops, its Lissajous leader-path travel speed (audioAdvance),
 * and its iridescent, key-following hue (audioChromaHue) are all computed
 * in the companion vertex shader (Swarm.vert) and arrive pre-baked in vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
