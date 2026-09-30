//@doc
 * @brief TEXTURE BATIK CRACKLE: batik cloth with its famous crackle -- the
 * photograph's shapes become wax-resist motifs in pale colours on a deep
 * dyed ground, and the dye has seeped through a fine web of cracks in
 * the wax, veining the pale areas with dark lines; layers of dye (light
 * to dark) build up in stages as the pattern slowly re-dyes itself.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the re-dyeing (integrated, jump-free)
 *   audioSpread     -> the motif threshold (more or less wax)
 *   audioKick       -> the pale motifs brighten (light)
 *   audioMode       -> palette: indigo in minor, madder red and ochre in major
 *   audioRoughness  -> the crackle density
 *   audioSwell      -> the dye depth (slow)
 *
 * Knobs: crackP (crackle scale), layerP (dye layers), photoP (photo motifs vs. noise), hueP.
//@params crackP layerP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    // Motif field: the photo (or noise) sliced into dye layers.
    float m = mix(fbm(p * 2.0 + 3.0), luma(imgK(uv, 2.5)), clamp(photoP, 0.0, 1.0) * 0.8);
    m += 0.08 * sin(T + p.x * 2.0) * 0.5;
    float nL = 2.0 + 3.0 * clamp(layerP, 0.0, 1.0);
    float thr = 0.1 * (clamp(audioSpread, 0.0, 1.0) - 0.5);
    float lv = clamp((m + thr) * nL, 0.0, nL - 0.001);
    float layer = floor(lv);
    float edge = fract(lv);
    // Colours: from pale (waxed first) to deep ground.
    vec3 pale = mix(vec3(0.92, 0.9, 0.82), vec3(0.97, 0.9, 0.7), mode);
    vec3 deep = mix(vec3(0.05, 0.1, 0.3), vec3(0.45, 0.08, 0.05), mode);
    vec3 mid = mix(vec3(0.3, 0.45, 0.7), vec3(0.85, 0.55, 0.15), mode);
    float t = 1.0 - layer / max(nL - 1.0, 1.0);                  // bright motifs -> pale
    vec3 col = t > 0.5 ? mix(mid, pale, (t - 0.5) * 2.0) : mix(deep, mid, t * 2.0);
    col *= 0.9 + 0.2 * swell * (1.0 - t);
    col = mix(col, col * glowColour(imgK(uv, 5.0), p, hueP * 0.159) * 1.2, 0.08);
    // Crackle: dark veins where dye seeped through the wax (only in waxed areas).
    float cs = 6.0 + 10.0 * clamp(crackP, 0.0, 1.0) + 6.0 * rough;
    vec2 cq = p * cs + 0.5 * vec2(fbm3(p * 5.0), fbm3(p * 5.0 + 4.0));
    vec2 ci = floor(cq), cf = fract(cq);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.1 + 0.8 * hash22(ci + o);
        float dd = length(cf - c);
        if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
    }
    float vein = exp(-(f2 - f1) / 0.02) * smoothstep(0.6, 0.95, t) * step(0.4, hash21(ci + floor(f1 * 4.0)));   // only the palest wax cracks, broken lines
    col = mix(col, deep * 1.2, vein * 0.7);
    // The wax edge: a slightly darker halo where layers meet.
    float px = fwidth(lv) + 1e-4;
    col *= 1.0 - 0.2 * exp(-min(edge, 1.0 - edge) / (px * 2.0));
    col *= 1.0 + 0.3 * kick * t;
    // Cloth weave.
    col *= 0.95 + 0.05 * sin(p.x * 700.0) * sin(p.y * 700.0);
    finish(col);
}
