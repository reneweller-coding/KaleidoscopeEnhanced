#version 330 core
out vec4 fragColor;
// SnowDrift.frag — soft glowing point (additive blending).
in vec4 vCol;

/**
 * @file SnowDrift.frag
 * @brief Shades falling snowflakes as soft additive point sprites — a
 * simple Gaussian falloff from the sprite centre times the per-vertex
 * colour vCol.
 *
 * This fragment stage reads no audio uniforms directly; the reactivity
 * (wind lean from audioSwell, overall brightness from audioSwell and
 * audioLevel, cold hue tint from audioChromaHue) is computed per-vertex in
 * SnowDrift.vert and arrives here already baked into vCol, kept deliberately
 * gentle so the music only leans on the snowfall rather than shaking it.
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    fragColor = vec4(vCol.rgb * a * 2.2, 1.0);
}
