#version 330 core
out vec4 fragColor;
// HelixTower.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file HelixTower.frag
 * @brief Shades one point of the helix tower as a soft radial glow sprite
 * (additive blending), a Gaussian falloff from the point-sprite center so
 * overlapping points pool into brighter light.
 *
 * This fragment shader declares no audio uniforms of its own; the point's
 * audio-reactive color and brightness (vCol) are computed per-vertex by
 * the companion vertex shader and only shaped here by the radial falloff.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
