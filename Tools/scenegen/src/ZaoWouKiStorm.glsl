//@doc
 * @brief ZAO WOU-KI STORM: a lyrical abstract painting in motion -- vast
 * masses of thinned oil colour swirl like a storm over the sea, deep blues
 * and near-blacks torn open by a luminous core of light, washes bleeding
 * into each other with soft edges, and across them fine, nervous
 * calligraphic strokes and spatters; the painting keeps churning slowly,
 * the light core wandering.  The colours come from the photograph.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the masses churn (integrated, jump-free)
 *   audioSpread     -> how far the light tears the dark open
 *   audioRoughness  -> the calligraphic strokes grow nervous
 *   audioKick       -> the core flares (light)
 *   audioMode       -> the light: cold white in minor, golden in major
 *   audioSwell      -> the washes brighten (slow)
 *
 * Knobs: churnP (warp strength), strokeP (stroke density), photoP (photo colours), hueP.
//@params churnP strokeP photoP
//@audio audioSpread audioRoughness audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    float churn = 0.8 + 1.2 * clamp(churnP, 0.0, 1.0);
    // Domain-warped masses.
    vec2 q = p * 1.3;
    vec2 w1 = vec2(fbm(q + vec2(T, 0.0)), fbm(q + vec2(5.2, 1.3) - vec2(0.0, T)));
    vec2 w2 = vec2(fbm(q + churn * w1 + vec2(1.7, 9.2) + T * 0.7), fbm(q + churn * w1 + vec2(8.3, 2.8) - T * 0.5));
    float mass = fbm(q + churn * w2);
    // The light core wandering; it tears the dark open along the warp.
    vec2 core = 0.35 * vec2(sin(0.017 * sceneTime + 0.1 * audioAdvance), cos(0.013 * sceneTime));
    float open = 0.12 + 0.25 * clamp(audioSpread, 0.0, 1.0);
    float light = smoothstep(open + 0.3, 0.0, length(p - core + 0.25 * (w2 - 0.5)) - 0.4 * (mass - 0.5));
    // Palette: the photo's colours folded into a storm scheme.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 dark = mix(vec3(0.01, 0.03, 0.09), vec3(0.03, 0.03, 0.07), mode);
    vec3 midC = mix(vec3(0.08, 0.22, 0.5), vec3(0.15, 0.3, 0.45), mode);
    vec3 lightC = mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.85, 0.55), mode);
    vec2 uv = p * 0.5 + 0.5 + 0.2 * (w2 - 0.5);
    vec3 ph = imgLod(uv, 4.0);
    vec3 pcol = glowColour(ph, w1 * 2.0, hueP * 0.159);
    midC = mix(midC, pcol * 0.5, 0.3 * clamp(photoP, 0.0, 1.0));
    vec3 col = mix(dark, midC, smoothstep(0.4, 0.75, mass) * (0.6 + 0.4 * swell));
    col = mix(col, mix(midC * 1.6, lightC, smoothstep(0.3, 0.9, light)), smoothstep(0.0, 0.8, light));
    col += lightC * pow(light, 4.0) * (0.2 + 0.6 * kick);
    // Wash edges: a slightly darker rim where one wash meets the next.
    float wash = abs(fract(mass * 4.0 + 0.2 * w1.x) - 0.5);
    col *= 0.88 + 0.12 * smoothstep(0.0, 0.08, wash);
    // Calligraphic strokes: thin isolines of a second warped field, broken.
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float sf = fbm(p * 2.5 + 2.0 * w2 + vec2(0.0, 0.3 * T) + rough * 0.15 * vec2(noise2(p * 30.0 + T * 20.0)));
    float e = 0.004;
    float sfx = fbm((p + vec2(e, 0.0)) * 2.5 + 2.0 * w2 + vec2(0.0, 0.3 * T) + rough * 0.15 * vec2(noise2((p + vec2(e, 0.0)) * 30.0 + T * 20.0)));
    float sfy = fbm((p + vec2(0.0, e)) * 2.5 + 2.0 * w2 + vec2(0.0, 0.3 * T) + rough * 0.15 * vec2(noise2((p + vec2(0.0, e)) * 30.0 + T * 20.0)));
    float gl = length(vec2(sfx - sf, sfy - sf)) / e / resolution.y + 1e-5;
    float lines = 0.0;
    for (int k = 0; k < 3; ++k) {
        float lv = 0.35 + 0.12 * float(k);
        float dpx = abs(sf - lv) / gl;
        float wdt = 1.2 + 3.5 * noise2(p * 4.0 + float(k) * 7.0);   // brush pressure
        float on = smoothstep(0.45, 0.6, noise2(p * 3.0 + float(k) * 3.3 + T)) * (0.4 + 0.6 * clamp(strokeP, 0.0, 1.0));
        lines = max(lines, smoothstep(wdt + 1.0, wdt - 0.5, dpx) * on);
    }
    vec3 ink = mix(dark * 0.5, lightC, light);
    col = mix(col, ink, lines * 0.85);
    // Spatters: round drops of thinned paint.
    vec2 sg = p * 18.0 + 3.0;
    vec2 si = floor(sg), sfr = fract(sg);
    vec2 sc = 0.2 + 0.6 * hash22(si);
    float sr = 0.05 + 0.12 * hash21(si + 4.0);
    float sp = smoothstep(sr, sr * 0.6, length(sfr - sc)) * step(hash21(si + 9.0), 0.08 * (0.3 + clamp(strokeP, 0.0, 1.0)));
    col = mix(col, ink * 0.8, sp * 0.7);
    // Canvas weave, faint.
    col *= 0.96 + 0.04 * noise2(gl_FragCoord.xy * 0.7);
    finish(col);
}
