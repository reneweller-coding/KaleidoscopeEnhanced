#version 330 core
out vec4 fragColor;
// TorusKnot.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file TorusKnot.frag
 * @brief Additive glow-sprite shader for the streaming (p,q) torus-knot
 * particle curve: renders each of the 60k flowing points as a bright round
 * point of light.
 *
 * No audio uniforms are read here; the knot family choice, its bass-driven
 * tube "breathing", its two-axis tumble, and its chroma-following hue sweep
 * along the curve are all computed in the companion vertex shader
 * (TorusKnot.vert) and arrive pre-baked in vCol.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 10.0);
    fragColor = vec4(vCol.rgb * a * 2.0, 1.0);
}
