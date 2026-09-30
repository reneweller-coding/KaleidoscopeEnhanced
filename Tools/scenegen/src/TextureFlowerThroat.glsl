//@doc
 * @brief TEXTURE FLOWER THROAT: diving into the throat of an endless flower
 * -- ring after ring of petals opens toward us, each whorl turned half a
 * petal against the one before, the petals cut from the photograph and
 * veined, cupped (bright at their tips, shadowed at their bases), glowing
 * translucent where the light shines through; deep inside, a glowing
 * heart of stamens.  The whorls slowly turn in alternating directions.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the dive (integrated, jump-free)
 *   audioPhase      -> the whorls turn (integrated)
 *   audioSpread     -> the petals open wider
 *   audioKick       -> the heart glows (light)
 *   audioMode       -> petal light: cool in minor, warm in major
 *   audioSwell      -> translucency (slow)
 *
 * Knobs: petalsP (petals per whorl), shapeP (petal shape), veinP, hueP.
//@params petalsP shapeP veinP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float lr = log(r);
    float n = 2.0 * floor(3.0 + 3.0 * clamp(petalsP, 0.0, 1.0)); // petals per whorl (even)
    float dive = 0.25 * sceneTime + 1.5 * audioAdvance;
    float turn = 0.03 * sceneTime + 0.3 * audioPhase;
    float spacing = 0.45;                                       // whorl spacing in log radius
    // Whorls stack from the outside in; the petals of whorl w reach out from
    // their base (inner) to their tip (outer). Check the whorl at this radius
    // and the one inside it (its tips overlap ours).
    float u = (lr + dive) / spacing;
    float wi = floor(u);
    vec3 col = vec3(0.0);
    float got = 0.0;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.75, 0.85, 1.1), vec3(1.15, 0.9, 0.75), mode);
    float open = 0.8 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    float fwA = length(fwidth(vec2(cos(a), sin(a))));            // derivatives before any branch
    for (int k = 0; k < 2; ++k) {
        float w = wi - float(k);                                // outer first (it lies on top)
        float t = (u - w) / (1.6 * open);                       // 0 at the base, 1 at the tip
        if (t < 0.0 || t > 1.0) continue;
        float rotw = turn * (mod(w, 2.0) < 0.5 ? 1.0 : -1.0) + 0.5 * mod(w, 2.0) * 6.2831853 / n;
        float pa = (a + rotw) * n / 6.2831853;
        float pf = fract(pa) - 0.5;                             // -0.5..0.5 across the petal
        // Petal outline: width as a function of t (round tip, narrow base).
        float sh = 0.4 + 0.6 * clamp(shapeP, 0.0, 1.0);
        float halfW = 0.5 * pow(sin(3.14159265 * clamp(t, 0.0, 1.0)), sh) * (0.8 + 0.2 * t);
        float px = fwA * n / 6.2831853 + 1e-4;
        float inside = smoothstep(halfW + px, halfW - px, abs(pf));
        if (inside <= 0.0) continue;
        // Photo on the petal, one piece per petal.
        float pid = mod(floor(pa), n);
        vec2 puv = vec2(pf * 0.6 + pid * 0.23 + w * 0.11, t * 0.5 + w * 0.17);
        vec3 ph = imgLod(puv, 1.0);
        vec3 c = ph * lc;
        // Cupping: shadow at the base, light at the tip; midrib and veins.
        c *= 0.35 + 0.85 * smoothstep(0.0, 0.8, t);
        float vein = exp(-abs(pf) / 0.02) * 0.4 + 0.25 * pow(abs(sin(pf * 30.0 - t * 6.0)), 20.0) * clamp(veinP, 0.0, 1.0);
        c *= 1.0 - 0.3 * vein;
        c += lc * vein * 0.1;
        // Translucent glow near the edge.
        c += glowColour(ph, vec2(w, pid), hueP * 0.159) * smoothstep(halfW * 0.5, halfW, abs(pf)) * (0.1 + 0.4 * swell) * t;
        // Shadow cast by the petal on top onto the petal below (k == 1).
        c *= k == 1 ? 0.65 : 1.0;
        col = mix(col, c, inside * (1.0 - got));
        got = max(got, inside);
    }
    // The heart deep inside and the dark between petals.
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(dive * 0.05, 0.0), hueP * 0.159);
    vec3 dark = gc * 0.05;
    col = mix(dark, col, got);
    col *= smoothstep(-3.5, -1.0, lr);                          // deep whorls fade
    col += gc * exp(-r * 10.0) * (0.8 + 1.4 * kick);
    // Stamens: glowing dots around the heart.
    float sa = (a + turn * 2.0) * 14.0 / 6.2831853;
    float sr = abs(fract(sa) - 0.5) + abs(r - 0.07) * 20.0;
    col += gc * smoothstep(0.25, 0.0, sr) * 0.8;
    finish(col);
}
