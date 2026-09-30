//@doc
 * @brief WATERCOLOR WET IN WET: watercolour painted wet-in-wet, forever --
 * soft washes of pigment bloom into damp paper, feathering out in
 * irregular clouds with the darker tide-line edges watercolour leaves
 * when it dries, colours running into each other and granulating in the
 * paper's tooth; new drops of colour touch down and spread while old
 * washes pale.  The pigments come from the photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the washes spread (integrated, jump-free)
 *   audioSpread     -> bloom size
 *   audioRoughness  -> granulation and feathering
 *   audioMode       -> palette: cool washes in minor, warm in major (tint)
 *   audioKick       -> fresh drops touch down (light: a brighter wet sheen)
 *   audioSwell      -> pigment strength (slow)
 *
 * Knobs: bloomP (bloom count), edgeP (tide-line darkness), paperP (paper texture), hueP.
//@params bloomP edgeP paperP
//@audio audioSpread audioRoughness audioMode audioKick audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Cold-press paper.
    float tooth = fbm3(p * 60.0) * 0.6 + noise2(p * 180.0) * 0.4;
    vec3 paper = vec3(0.96, 0.95, 0.91) * (1.0 - 0.06 * clamp(paperP + 0.3, 0.0, 1.3) * tooth);
    vec3 col = paper;
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    float S = 1.4 + 1.2 * clamp(bloomP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        for (int k = 0; k < 2; ++k) {
            float fk = float(k);
            float h = hash21(id + fk * 7.7);
            float cyc = T * (0.6 + 0.5 * h) + h * 3.0 + fk * 0.5;
            float life = fract(cyc);
            float gen = floor(cyc);
            vec2 c = id + 0.5 + 0.4 * (hash22(id + gen * 1.31 + fk) - 0.5);
            // A wet bloom: grows fast, then dries (tide line), then pales.
            float R = (0.35 + 0.3 * clamp(audioSpread, 0.0, 1.0)) * (0.5 + 0.5 * hash21(id + gen + 3.0)) * sqrt(smoothstep(0.0, 0.4, life));
            vec2 d = g - c;
            float ang = atan(d.y, d.x);
            vec2 u = vec2(cos(ang), sin(ang));
            float feather = (0.15 + 0.3 * rough) * (fbm3(u * 2.5 + h * 9.0 + gen) - 0.5) + 0.08 * (fbm3(d * 8.0 + h) - 0.5);
            float rr = length(d) / max(R, 1e-3) + feather;
            float inside = smoothstep(1.0, 0.9, rr);
            float tide = exp(-abs(rr - 0.97) * 25.0) * smoothstep(0.35, 0.6, life);
            float alpha = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.7, life);
            vec3 pc = imgPalette(fract(h * 1.7 + gen * 0.13 + hueP * 0.159));
            pc = pc / max(max(pc.r, max(pc.g, pc.b)), 0.2);
            pc = mix(pc, glowColour(pc, id + gen, hueP * 0.159 + h), 0.4);
            pc *= mix(vec3(0.9, 0.95, 1.1), vec3(1.1, 0.95, 0.85), mode);
            float dens = (0.35 + 0.35 * swell) * (0.7 + 0.3 * (1.0 - rr)) * inside + tide * (0.3 + 0.5 * clamp(edgeP, 0.0, 1.0));
            // Granulation: pigment settles in the paper's tooth.
            dens *= 0.8 + (0.2 + 0.5 * rough) * (tooth - 0.4);
            col *= mix(vec3(1.0), pc, clamp(dens * alpha, 0.0, 1.0));
            // Wet sheen on a fresh bloom.
            col += vec3(1.0) * inside * (1.0 - smoothstep(0.0, 0.25, life)) * 0.08 * (1.0 + 2.0 * kick) * alpha;
        }
    }
    finish(col);
}
