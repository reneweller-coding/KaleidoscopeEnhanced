#version 330 core
out vec4 fragColor;
// SpectrumArena.frag — dark cube faces with luminous edges (depth-tested).
in vec4 vCol;
in vec3 vCorner;

/**
 * @file SpectrumArena.frag
 * @brief Shades the depth-tested equalizer-column cubes of a circular
 * "arena" the camera flies inside, drawing each cube as a dark face with a
 * luminous rim where its corner faces the eye.
 *
 * This fragment stage reads no audio uniforms directly: all reactivity
 * (per-column spectrum band level, kick shockwave ring, downbeat jump,
 * chroma-driven hue) is computed once per vertex in the companion vertex
 * shader and arrives already baked into vCol; here it is only modulated by
 * the screen-space edge falloff derived from vCorner.
 */

void main()
{
    vec3 a = abs(vCorner) * 2.0;
    float e1 = smoothstep(0.80, 0.99, a.x);
    float e2 = smoothstep(0.80, 0.99, a.y);
    float e3 = smoothstep(0.80, 0.99, a.z);
    float edge = clamp(e1 * e2 + e2 * e3 + e1 * e3, 0.0, 1.0);
    vec3 col = vCol.rgb * (0.22 + 1.5 * edge);
    fragColor = vec4(col, 1.0);
}
