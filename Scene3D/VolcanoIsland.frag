#version 330 core
out vec4 fragColor;
// VolcanoIsland.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file VolcanoIsland.frag
 * @brief Additive glow-sprite shader for the night volcano-island scene
 * (lava fountain, cone rock, lava rivers, rising embers, stars, and the
 * moonlit sea with its horizon mist): renders each of the 60k points as a
 * soft round point of light.
 *
 * No audio uniforms are read here; the eruption strength (kick-fed fountain,
 * drop-triggered full eruption), lava-river pulsing, the bass/drop flare of
 * the volcano's reflection lane on the water, and the day/night star fade are
 * all computed in the companion vertex shader (VolcanoIsland.vert) and arrive
 * pre-baked in vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a, 1.0);
}
