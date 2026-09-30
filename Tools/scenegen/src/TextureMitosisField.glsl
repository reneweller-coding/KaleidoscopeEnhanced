//@doc
 * @brief TEXTURE MITOSIS FIELD: a sheet of living cells dividing -- each
 * translucent cell swells, its nucleus lines up, the cell stretches,
 * pinches in the middle and splits into two daughters that drift apart
 * and shrink back to size, over and over, each at its own pace, so the
 * whole field seethes with divisions; the cells carry the photograph's
 * colours, lit from behind like a microscope.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the division cycles (integrated, jump-free)
 *   audioSpread     -> cell size
 *   audioKick       -> the nuclei glow (light)
 *   audioMode       -> light: cool dark-field in minor, warm bright-field in major (tint)
 *   audioRoughness  -> the membranes ripple
 *   audioSwell      -> the halo around the cells (slow)
 *
 * Knobs: rateP (division rate), cellP (cell density), photoP (photo colours), hueP.
//@params rateP cellP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float S = 4.0 + 4.0 * clamp(cellP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    float rate = 0.05 + 0.12 * clamp(rateP, 0.0, 1.0);
    float size = 0.22 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    vec3 col = mix(vec3(0.02, 0.03, 0.05), vec3(0.85, 0.83, 0.78), mode * 0.8);
    float field = 0.0; vec3 fc = vec3(0.0); float nuc = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h = hash21(id);
        vec2 c = id + 0.5 + 0.2 * vec2(sin(0.1 * sceneTime + h * 6.28), cos(0.08 * sceneTime + h * 9.0));
        // Division cycle: 0..1; the axis is fixed per cycle generation.
        float cyc = (sceneTime * rate + audioAdvance * rate * 5.0) * (0.7 + 0.6 * h) + h * 3.0;
        float t = fract(cyc);
        float gen = floor(cyc);
        float ax = hash11(gen * 0.37 + h * 11.0) * 3.14159;
        vec2 dir = vec2(cos(ax), sin(ax));
        // Grow (t 0..0.5), split (0.5..0.95), then the pair merges back into
        // one round cell right at the wrap, so the next cycle starts where
        // this one ended (the division axis changes only while merged).
        float grow = smoothstep(0.0, 0.5, t);
        float sep = smoothstep(0.5, 0.95, t) * (1.0 - smoothstep(0.95, 1.0, t));
        float R = size * (0.85 + 0.25 * grow - 0.2 * sep);
        vec2 off = dir * sep * size * 0.95;
        vec2 d = g - c;
        float wob = 1.0 + 0.06 * rough * sin(atan(d.y, d.x) * 6.0 + sceneTime * 2.0);
        float m1 = exp(-dot(d - off, d - off) / (R * R * wob));
        float m2 = exp(-dot(d + off, d + off) / (R * R * wob));
        // One cell when merged (m1 == m2), two full cells when apart: no step.
        float m = (m1 + m2) * mix(0.5, 1.0, smoothstep(0.0, 0.15, sep));
        field += m;
        vec3 pc = glowColour(imgLod((c / S) * 0.6 + 0.5, 4.0), id, hueP * 0.159);
        fc += pc * m;
        // Nuclei: one elongating, then two (chromosome plates at the middle phase).
        float nr = R * 0.35;
        float n1 = exp(-dot(d - off * 1.1, d - off * 1.1) / (nr * nr));
        float n2 = exp(-dot(d + off * 1.1, d + off * 1.1) / (nr * nr));
        nuc += max(n1, n2);
    }
    fc /= max(field, 1e-3);
    fc = mix(vec3(0.7, 0.85, 0.9), fc, clamp(photoP, 0.0, 1.0) * 0.8 + 0.2);
    float inside = smoothstep(0.35, 0.6, field);
    float rim = smoothstep(0.3, 0.45, field) * (1.0 - smoothstep(0.45, 0.8, field));
    vec3 cellC = fc * (0.35 + 0.3 * field);
    col = mix(col, cellC, inside * 0.85);
    col += fc * rim * (0.5 + 0.5 * (1.0 - mode));
    col += fc * smoothstep(0.1, 0.35, field) * (1.0 - inside) * (0.05 + 0.2 * swell);
    col = mix(col, fc * 0.3 + vec3(0.1, 0.1, 0.2), nuc * 0.7 * (1.0 - mode * 0.5));
    col += fc * nuc * kick * 0.6;
    col *= mix(vec3(0.85, 0.95, 1.1), vec3(1.08, 1.0, 0.92), mode);
    finish(col);
}
