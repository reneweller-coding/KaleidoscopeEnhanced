//@doc
 * @brief RESIN GEODE POUR: resin art in the style of a geode -- concentric
 * bands of coloured resin poured in rings around a sparkling crystal
 * centre, each band a different colour from the photograph edged with
 * gold and white lacing where the resin cells opened, the bands slowly
 * spreading outward as fresh resin is poured, glittering crystals in the
 * middle.  Several geodes overlap across the plane.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the bands spread (integrated, jump-free)
 *   audioSpread     -> geode size
 *   audioKick       -> the gold edges flash (light)
 *   audioMode       -> the edging: silver in minor, gold in major
 *   audioHigh       -> the crystals glitter (light)
 *   audioRoughness  -> the lacing (cells) in the bands
 *
 * Knobs: bandP (band count), lacingP (lacing strength), crystalP (crystal centre size), hueP.
//@params bandP lacingP crystalP
//@audio audioSpread audioKick audioMode audioHigh audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // The geode that dominates this pixel: nearest centre (weighted).
    float S = 1.0 + 0.6 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    vec2 g = p * S;
    vec2 gi = floor(g);
    float best = 1e3; vec2 bid = vec2(0.0); vec2 bd = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 c = id + 0.5 + 0.35 * (hash22(id) - 0.5);
        vec2 d = g - c;
        float w = length(d) * (0.8 + 0.4 * hash21(id + 2.0));
        if (w < best) { best = w; bid = id; bd = d; }
    }
    float h = hash21(bid);
    float ang = atan(bd.y, bd.x);
    vec2 u = vec2(cos(ang), sin(ang));
    float r = length(bd) * (1.0 + 0.25 * (fbm3(u * 1.5 + h * 7.0) - 0.5));   // organic outline
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float nb = 5.0 + 8.0 * clamp(bandP, 0.0, 1.0);
    float x = r * nb - T;
    float band = floor(x);
    float fb = fract(x);
    vec3 pc = imgPalette(fract(band * 0.137 + h + hueP * 0.159));
    pc = pc / max(max(pc.r, max(pc.g, pc.b)), 0.2);
    pc = mix(pc, glowColour(pc, vec2(band, h), hueP * 0.159), 0.35);
    vec3 col = pc * (0.55 + 0.35 * fb);
    // Lacing: resin cells opening near the band edges.
    vec2 lq = bd * 30.0 + h * 10.0;
    vec2 li = floor(lq);
    float cell = length(fract(lq) - 0.3 - 0.4 * hash22(li));
    float lace = smoothstep(0.35, 0.2, cell) * smoothstep(0.4, 0.9, fb) * (0.3 + 0.7 * clamp(lacingP, 0.0, 1.0)) * (0.5 + 0.8 * rough);
    col = mix(col, vec3(0.97), lace * 0.7);
    // Metallic edge between bands.
    float px = fwidth(x) * 1.5 + 1e-4;
    float edge = exp(-min(fb, 1.0 - fb) / (px + 0.02));
    vec3 metal = mix(vec3(0.8, 0.82, 0.86), vec3(1.0, 0.78, 0.35), mode);
    col = mix(col, metal * (0.8 + 1.0 * kick), edge * 0.8);
    // The crystal centre: sparkling facets.
    float cr = 0.12 + 0.15 * clamp(crystalP, 0.0, 1.0);
    float inC = smoothstep(cr, cr * 0.9, r);
    // Crystal facets: Voronoi cells (no square pixels), each a tilted face.
    vec2 cq = bd * 25.0;
    vec2 ci = floor(cq), cf = fract(cq);
    float f1 = 9.0, f2 = 9.0; vec2 fid = ci;
    for (int y = -1; y <= 1; ++y) for (int x2 = -1; x2 <= 1; ++x2) {
        vec2 o = vec2(x2, y);
        vec2 cc = o + 0.15 + 0.7 * hash22(ci + o + bid * 3.0);
        float dd = length(cf - cc);
        if (dd < f1) { f2 = f1; f1 = dd; fid = ci + o; } else if (dd < f2) f2 = dd;
    }
    float facet = hash21(fid + bid);
    vec3 crys = mix(vec3(0.85, 0.9, 1.0), pc, 0.3) * (0.35 + 0.65 * facet);
    crys *= 0.75 + 0.25 * smoothstep(0.0, 0.1, f2 - f1);       // facet edges
    crys += vec3(1.0) * step(0.9, facet) * pow(max(0.0, sin(sceneTime * 3.0 + facet * 40.0)), 6.0) * (0.5 + 1.5 * hi) * smoothstep(0.35, 0.0, f1);
    col = mix(col, crys, inC);
    finish(col);
}
