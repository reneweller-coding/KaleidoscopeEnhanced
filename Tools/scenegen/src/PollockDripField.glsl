//@doc
 * @brief POLLOCK DRIP FIELD: an all-over drip painting building itself --
 * long looping skeins of paint in several colours are poured across the
 * canvas, each skein a thin wandering line that thickens into pools where
 * the hand slowed and thins into threads where it flew, splatters beside
 * it; layer on layer the web grows dense, older layers slowly fade back
 * so it never clogs.  The colours come from the photograph, the canvas is
 * raw linen.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pouring (integrated, jump-free)
 *   audioSpread     -> the skeins loop wider
 *   audioRoughness  -> more splatter
 *   audioKick       -> the paint gleams (light)
 *   audioMode       -> palette: black-white-grey in minor, the photo's colours in major (blend)
 *   audioSwell      -> the web gets denser (slow)
 *
 * Knobs: layerP (layers), lineP (line weight), canvasP (canvas tone), hueP.
//@params layerP lineP canvasP
//@audio audioSpread audioRoughness audioKick audioMode audioSwell
//@body
// One skein: an isoline of a warped noise field, with varying thickness.
float skein(vec2 x, float seed, float T, float loop, out float thick)
{
    vec2 q = x * (1.5 + 0.5 * seed) + seed * 7.3;
    vec2 w = vec2(fbm3(q * loop + vec2(T, 0.0)), fbm3(q * loop + vec2(0.0, T) + 4.0)) - 0.5;
    float f = fbm3(q + w * 2.5);
    float e = 0.004;
    float fx = fbm3(q + vec2(e, 0.0) + w * 2.5), fy = fbm3(q + vec2(0.0, e) + w * 2.5);
    float g = length(vec2(fx - f, fy - f)) / e * (1.5 + 0.5 * seed) + 1e-3;
    thick = 0.4 + 1.6 * smoothstep(0.3, 0.8, fbm3(q * 3.0 + 9.0 + seed));   // pools and threads
    return abs(f - 0.5) / g;                                   // distance to the line (screen units)
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.2, 0.8, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec3 linen = mix(vec3(0.86, 0.81, 0.7), vec3(0.62, 0.58, 0.52), clamp(canvasP, 0.0, 1.0));
    linen *= 0.95 + 0.05 * noise2(p * vec2(300.0, 290.0));
    vec3 col = linen;
    float nL = 3.0 + 4.0 * clamp(layerP, 0.0, 1.0) + 2.0 * swell;
    float loop = 0.6 + 1.0 * clamp(audioSpread, 0.0, 1.0);
    float w0 = (0.003 + 0.005 * clamp(lineP, 0.0, 1.0));
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    for (int k = 0; k < 9; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nL - 0.5);
        if (on <= 0.0) break;
        // Each layer lives a while, then fades as a new one replaces it (continuous).
        float life = fract(T * 0.5 + fk / 9.0);
        float gen = floor(T * 0.5 + fk / 9.0);
        float seed = hash11(fk * 3.7 + gen * 1.31);
        float alpha = smoothstep(0.0, 0.2, life) * smoothstep(1.0, 0.75, life) * on;
        float thick;
        float d = skein(p, seed, T * 0.3, loop, thick);
        float w = w0 * thick;
        float px = 1.0 / resolution.y;
        float paint = smoothstep(w + px, w - px, d);
        // Splatter beside the line: round drops.
        vec2 sg = p * 90.0 + seed * 50.0;
        vec2 si = floor(sg);
        float drop = smoothstep(0.3, 0.1, length(fract(sg) - 0.25 - 0.5 * hash22(si))) * step(0.965 - 0.05 * rough, hash21(si + seed)) * exp(-d / 0.03);
        paint = max(paint, drop);
        vec3 pc = imgPalette(fract(seed * 1.7 + hueP * 0.159));
        pc = pc / max(max(pc.r, max(pc.g, pc.b)), 0.2) * 0.8;
        pc = mix(pc, glowColour(pc, vec2(seed * 9.0, 0.0), hueP * 0.159 + seed), 0.5);
        float grey = hash11(seed * 9.0);
        vec3 bw = grey < 0.4 ? vec3(0.05) : (grey < 0.7 ? vec3(0.92, 0.9, 0.85) : vec3(0.45));
        vec3 c = mix(bw, pc, mode);
        // Gloss on the wet paint.
        c += vec3(1.0) * smoothstep(w * 0.6, 0.0, d) * 0.12 * (1.0 + 2.0 * kick);
        col = mix(col, c, paint * alpha);
    }
    finish(col);
}
