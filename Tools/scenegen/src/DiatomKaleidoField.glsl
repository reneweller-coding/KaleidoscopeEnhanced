//@doc
 * @brief DIATOM KALEIDO FIELD: a living field of diatoms -- the glass shells of single-celled algae, each a tiny
 * kaleidoscope: round centric shells with striae running out from the middle in rays and rings of pores, and long
 * pennate shells with a central rib and rows of pores along it.  They lie scattered across the frame turning slowly,
 * lit like glass under a microscope; with the key the field's kind and its symmetry change.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony changes the shells' symmetry (5 to 12 rays) and the mix of kinds
 *                       (crossfaded)
 *   audioPhase      -> the shells turn (integrated)
 *   audioKick       -> the shells' rims flash (light)
 *
 * Knobs: sizeP (the shells' size), poreP (how fine the pores), photoP (photo share), hueP.
//@params sizeP poreP photoP
//@audio audioKick audioHarmAdvance
//@body
/**  One diatom shell: its glass in a local frame (radius 1 for centric shells).
 *
 * @param q      The point in the shell's frame. (in)
 * @param rays   The rays' symmetry. (in)
 * @param pen    1 for a long pennate shell, 0 for a round centric one. (in)
 * @param fine   How fine the pores are. (in)
 *
 * @return
 *   The glass's density (x, 0 outside) and the rim (y).
 **/
vec2 diatom(vec2 q, float rays, float pen, float fine)
{
    vec2 e = q * vec2(1.0, mix(1.0, 3.2, pen));                 // the pennate shell is long and narrow
    float r = length(e);
    if (r > 1.0) return vec2(0.0);
    float a = atan(e.y, e.x);
    float rim = smoothstep(0.86, 0.98, r);
    // centric: rays of pores; pennate: a central rib with rows across
    float rayA = abs(fract(a / 6.2831853 * rays) - 0.5) * 2.0;
    float ringR = abs(fract(r * (5.0 + 5.0 * fine)) - 0.5) * 2.0;
    float poreC = smoothstep(0.55, 0.25, length(vec2(rayA * 0.9, ringR)));
    float rows = abs(fract(q.x * (6.0 + 6.0 * fine) * 1.6) - 0.5) * 2.0;
    float across = abs(fract(q.y * 3.2 * (4.0 + 3.0 * fine)) - 0.5) * 2.0;
    float poreP = smoothstep(0.6, 0.25, length(vec2(rows, across)));
    float rib = smoothstep(0.08, 0.0, abs(q.y * 3.2));
    float pore = mix(poreC, max(poreP, rib), pen);
    float glass = 0.55 + 0.45 * (1.0 - pore) - 0.25 * smoothstep(0.0, 0.2, 1.0 - r);
    return vec2(glass, rim);
}

void main()
{
    vec2 p = screenP();
    float S = 0.11 + 0.06 * clamp(sizeP, 0.0, 1.0);
    float fine = clamp(poreP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float gl = smoothstep(0.2, 0.8, fract(h));
    vec3 tone = imgPalette(0.5 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 4.0) * 0.12 + tone * 0.04;   // the dark field of the microscope
    vec2 cell = floor(p / S);
    float bestZ = -1.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = cell + vec2(float(i), float(j));
        vec2 hh = hash22(cc);
        vec2 c = (cc + 0.5 + 0.5 * (hh - 0.5)) * S;
        float sz = S * (0.4 + 0.25 * hh.y);
        float spin = 6.2831853 * hh.x + (hh.y - 0.5) * 0.04 * audioPhase + 0.05 * sceneTime * (hh.x - 0.5);
        vec2 q = rot2(spin) * (p - c) / sz;
        vec2 g = vec2(0.0);
        for (int s = 0; s < 2; ++s) {
            float w = s == 0 ? 1.0 - gl : gl;
            if (w < 0.001) continue;
            float k = floor(h) + float(s);
            float rays = 5.0 + floor(8.0 * hash11(k * 3.7 + 0.2));
            float pen = step(0.65 - 0.3 * hash11(k * 1.9), hh.y) * 1.0;
            g += w * diatom(q, rays, pen, fine);
        }
        if (g.x > 0.001 && hh.x > bestZ) {
            bestZ = hh.x;
            vec3 photo = imgLod(c * 0.6 + 0.5 + q * 0.03, 1.0);
            vec3 glass = mix(tone * 1.2, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * g.x;
            glass += mix(tone, vec3(1.0), 0.6) * g.y * (0.35 + 0.6 * clamp(audioKick, 0.0, 1.0));
            col = mix(col, glass, smoothstep(0.0, 0.05, g.x));
        }
    }
    finish(col * 1.15);
}
