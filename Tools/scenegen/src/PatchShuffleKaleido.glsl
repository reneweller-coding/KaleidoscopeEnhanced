//@doc
 * @brief PATCH SHUFFLE KALEIDO: the photo cut into patches and laid out anew by likeness, PatchMatch-fashion -- a
 * kaleidoscope of the photo's own broad colours is the plan, and for every square of the plan the patch is fetched,
 * from a handful of random candidates, whose colour fits it best.  The candidates are drawn afresh now and then, the
 * patches crossfading in and out, so the mosaic keeps reshuffling while the kaleidoscope's plan turns slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony changes the patches' size (crossfaded)
 *   audioPhase      -> the plan turns (integrated)
 *   audioAdvance    -> the candidates are drawn afresh (integrated)
 *
 * Knobs: sizeP (the base patch size), choiceP (how many candidates are tried), photoP (how much of the plan shows
 * through), hueP.
//@params sizeP choiceP photoP
//@audio audioHarmAdvance
//@body
/**  The mosaic at one patch size.
 *
 * @param p     The screen point. (in)
 * @param n     Patches across the frame's height. (in)
 * @param draw  The candidates' draw (its integer part picks them; the fraction crossfades). (in)
 * @param tries How many candidates are tried. (in)
 *
 * @return
 *   The colour.
 **/
vec3 mosaic(vec2 p, float n, float draw, int tries)
{
    vec2 g = p * n;
    vec2 cell = floor(g), f = fract(g);
    // the plan: a six-fold kaleidoscope of the photo's broad colours
    vec2 cp = (cell + 0.5) / n;
    float a = atan(cp.y, cp.x) - 0.01 * audioPhase, r = length(cp);
    a = abs(mod(a, 1.0471976) - 0.5235988);
    vec3 plan = imgLod(0.5 + 0.6 * r * vec2(cos(a), sin(a)), 4.0);
    vec3 col = vec3(0.0);
    for (int d = 0; d < 2; ++d) {
        float dr = floor(draw) + float(d);
        float wd = d == 0 ? 1.0 - smoothstep(0.3, 0.7, fract(draw)) : smoothstep(0.3, 0.7, fract(draw));
        float best = 1e9;
        vec2 src = vec2(0.5);
        for (int k = 0; k < 8; ++k) {
            if (k >= tries) break;
            vec2 cand = hash22(cell * 1.31 + vec2(dr * 7.7, float(k) * 3.3)) * 0.8 + 0.1;
            vec3 dc = imgLod(cand, 4.0) - plan;
            float e = dot(dc, dc);
            if (e < best) { best = e; src = cand; }
        }
        col += wd * imgLod(src + (f - 0.5) / n * 0.5, 0.3);
    }
    return mix(col, plan, 0.15 * clamp(photoP, 0.0, 1.0));
}

void main()
{
    vec2 p = screenP();
    float h = max(audioHarmAdvance, 0.0);
    float g = smoothstep(0.2, 0.8, fract(h));
    float nA = 5.0 + floor(6.0 * hash11(floor(h) * 1.9 + 0.4)) + 4.0 * clamp(sizeP, 0.0, 1.0);
    float nB = 5.0 + floor(6.0 * hash11((floor(h) + 1.0) * 1.9 + 0.4)) + 4.0 * clamp(sizeP, 0.0, 1.0);
    int tries = int(3.0 + 5.0 * clamp(choiceP, 0.0, 1.0));
    float draw = 0.06 * sceneTime + 0.1 * audioAdvance;
    vec3 col = mosaic(p, nA, draw, tries);
    if (g > 0.001) col = mix(col, mosaic(p, nB, draw, tries), g);
    finish(col * 1.05);
}
