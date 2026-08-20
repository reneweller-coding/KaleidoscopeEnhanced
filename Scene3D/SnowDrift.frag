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
 * This fragment stage reads no audio uniforms directly; every mapping is
 * computed per-vertex in SnowDrift.vert and arrives here baked into vCol,
 * kept deliberately gentle so the music only leans on the snowfall rather
 * than shaking it.
 *
 * Audio Reactivity (all applied in SnowDrift.vert):
 *   audioSwell     -> wind lean across the column + overall glow
 *   audioLevel     -> overall glow
 *   audioChromaHue -> faint key tint of the flakes
 *   audioFlatness  -> width of the snowfall (narrow column vs wide curtain)
 *   audioSharpness -> sparkle contrast of each flake's tumble-glint
 *   audioMode      -> moonlight temperature (minor = cold blue, major = warm)
 */

void main()
{
    vec2  d = gl_PointCoord - 0.5;
    float a = exp(-dot(d, d) * 9.0);
    fragColor = vec4(vCol.rgb * a * 2.2, 1.0);
}
