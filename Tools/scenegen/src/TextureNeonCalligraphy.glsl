//@doc
 * @brief TEXTURE NEON CALLIGRAPHY: glowing brush calligraphy written in light
 * -- broad sweeping strokes that swell and taper like a brush pen, drawn
 * across the dark as we watch, loops and hooks and flourishes, each
 * stroke a neon tube of the photograph's colours with a hot white core
 * and a soft bloom; old strokes fade as new ones are written, the whole
 * script drifting slowly.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the writing (integrated, jump-free)
 *   audioSpread     -> stroke width
 *   audioKick       -> the strokes flare (light)
 *   audioMode       -> palette: cool neon in minor, warm neon in major (tint)
 *   audioRoughness  -> the strokes get shakier
 *   audioSwell      -> the bloom (slow)
 *
 * Knobs: strokeP (stroke count), loopP (loopiness), photoP (photo colours), hueP.
//@params strokeP loopP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 col = imgLod(uv, 4.0) * 0.03;
    float T = 0.1 * sceneTime + 0.6 * audioAdvance;
    float nS = 3.0 + 4.0 * clamp(strokeP, 0.0, 1.0);
    float loop = 1.0 + 3.0 * clamp(loopP, 0.0, 1.0);
    float wBase = 0.006 + 0.012 * clamp(audioSpread, 0.0, 1.0);
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nS - 0.5);
        if (on <= 0.0) break;
        // Each stroke lives a cycle: written (0..0.4), shown, faded (0.8..1).
        float cyc = T * 0.35 + fk / 7.0;
        float life = fract(cyc);
        float gen = floor(cyc);
        float h = hash11(fk * 3.7 + gen * 1.31);
        vec2 c0 = vec2(1.4 * (hash11(h * 11.0) - 0.5), 0.8 * (hash11(h * 17.0) - 0.5));
        float drawn = smoothstep(0.0, 0.4, life);
        float alpha = smoothstep(1.0, 0.8, life) * on;
        // Stroke path: a parametric curve sampled in segments; distance to it,
        // with the exact curve parameter at the closest point (smooth width).
        float best = 1e3, bestT = 0.0;
        vec2 prev = vec2(0.0);
        for (int i = 0; i <= 40; ++i) {
            float t = float(i) / 40.0;
            if (t > drawn + 1.0 / 40.0) break;
            float a = t * 6.2831853 * 0.9;
            vec2 pt = c0 + vec2(t * 0.9 - 0.45, 0.0) * (0.8 + 0.4 * h) + 0.12 * vec2(sin(a * loop + h * 6.0), cos(a * loop * 0.7 + h * 9.0) * 1.3);
            pt += rough * 0.008 * vec2(noise2(vec2(t * 40.0, h * 10.0)) - 0.5, noise2(vec2(h * 10.0, t * 40.0)) - 0.5);
            if (i > 0) {
                vec2 pa = p - prev, ba = pt - prev;
                float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
                float dd = length(pa - ba * hh);
                if (dd < best) { best = dd; bestT = t - (1.0 - hh) / 40.0; }
            }
            prev = pt;
        }
        // Brush profile: swell in the middle of the stroke, taper at the ends.
        float w = wBase * (0.3 + 1.4 * sin(3.14159 * clamp(bestT / max(drawn, 0.05), 0.0, 1.0))) * (0.75 + 0.5 * (0.5 + 0.5 * sin(bestT * 9.0 + h * 5.0)));
        vec3 nc = hsv2rgb(vec3(fract(h + hueP * 0.159 + mix(0.55, 0.0, mode) * 0.5), 0.85, 1.0));
        nc = mix(nc, glowColour(imgLod(vec2(h, fract(h * 7.0)), 4.0), vec2(h, 0.0), hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.6);
        float core = smoothstep(w, w * 0.3, best);
        float tube = smoothstep(w * 2.2, w, best);
        float bloom = exp(-best / (0.02 + 0.03 * swell));
        col += (nc * tube * 0.9 + vec3(1.0) * core * 0.6 + nc * bloom * 0.25) * alpha * (1.0 + 0.8 * kick);
    }
    finish(col);
}
