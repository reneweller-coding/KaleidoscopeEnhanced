//@doc
 * @brief ISOLUMINANT SHIMMER: patterns whose two colours are exactly as bright as each other and differ only in hue:
 * the eye loses its grip on the edges, so the rings and stripes seem to float, shimmer and swim as they drift.  The two
 * tones are taken from the photo's colour family a quarter turn or more apart and scaled to the same luminance; the
 * pattern is the sign of a sum of drifting ring and stripe waves, its edges kept a little soft.  How saturated the two
 * tones are follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the patterns drift and turn (integrated)
 *   audioSwell   -> how saturated the two tones are (the luminance stays equal)
 *
 * Knobs: scaleP (the pattern's size), contrastP (how far apart the two hues are), hueP.
//@params scaleP contrastP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float k = 10.0 + 10.0 * clamp(scaleP, 0.0, 1.0);
    float hB = fract(fh + 0.25 + 0.15 * clamp(contrastP, 0.0, 1.0));
    float sat = 0.45 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    vec3 cA = hsv2rgb(vec3(fh, sat, 1.0)), cB = hsv2rgb(vec3(hB, sat, 1.0));
    const float L = 0.42;
    cA *= L / max(luma(cA), 1e-3);                                    // the same luminance for both
    cB *= L / max(luma(cB), 1e-3);
    float run = 0.1 * sceneTime + 0.4 * audioAdvance;
    vec2 c1 = 0.3 * vec2(sin(0.3 * run), cos(0.23 * run));
    vec2 q = rot2(0.05 * run) * p;
    float v = sin(k * length(p - c1) - run) + sin(k * 1.1 * q.x + 0.7 * run) * 0.8 + sin(k * 0.9 * (q.y + 0.4 * q.x) - 0.5 * run) * 0.6;
    float m = smoothstep(-0.08, 0.08, v);
    vec3 col = mix(cA, cB, m);
    finish(col);
}
