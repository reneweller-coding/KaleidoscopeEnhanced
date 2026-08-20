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
    // Blending is additive, so a single sprite is capped here: overlapping
    // strand points still pool into brighter light, but no one sprite can
    // drive a pixel to white on its own.
    fragColor = vec4(min(vCol.rgb * a, vec3(0.9)), 1.0);
}
