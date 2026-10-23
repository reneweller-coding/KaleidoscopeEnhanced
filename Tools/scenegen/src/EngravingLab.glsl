//@doc
 * @brief ENGRAVING LAB: the photo drawn as an engraving in its own inks -- parallel hatching, crosshatching, woodcut
 * lines with a carved wobble, guilloche waves, stippled dots, relief lines that bend over the bright places, concentric
 * grooves, broken dashes.  The line's thickness follows the photo's darkness, so the tones come back as density, and the
 * ink is the photo's own colour darkened.  A second stage sets how the density is laid out (even, breathing, thickening
 * toward a wandering centre, waving), a third the direction field the lines follow (straight and turning, radial,
 * spiral, noise-bent), a fourth the paper (ink on light paper, light ink on dark, dark and light ink on a mid
 * tone).  The walk changes one stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the lines' weight: the engraving bites deeper as the music swells
 *   audioSpread     -> the wobble of woodcut and guilloche lines
 *   audioPhase      -> the field's turn and the waves' travel (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage
 *
 * Knobs: seedP (the walk's seed), densityP (lines per unit), weightP (the base line weight), hueP.
//@params seedP densityP weightP
//@audio audioSwell audioSpread
//@body
/**  A line at coordinate a: coverage of a soft line whose half width is w (in line spacings).
 *
 * @param a  The coordinate across the lines (one unit per line). (in)
 * @param w  The half width, 0..0.5. (in)
 *
 * @return
 *   The coverage, 0..1.
 **/
float engLine(float a, float w)
{
    return smoothstep(w + 0.07, max(w - 0.07, 0.0), abs(fract(a) - 0.5));
}

/**  One look of the lab.
 *
 * @param k    The classes: x the family, y the density layout, z the direction field, w the paper. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param N    Lines per unit. (in)
 * @param wt   The line weight. (in)
 * @param wob  The wobble. (in)
 *
 * @return
 *   The colour.
 **/
vec3 engLook(ivec4 k, ivec4 kv, vec2 p, float t, float N, float wt, float wob)
{
    vec2 uv = p * 0.8 + 0.5;
    vec3 C = imgLod(uv, 2.5);
    float T = luma(imgLod(uv, 1.8));
    float D = 1.0 - T;
    vec3 C6 = imgLod(uv, 6.0);
    // the density layout
    float n = N;
    if (k.y == 1) n *= 1.0 + lv(kv.y, 1.0, 0.05, 0.15) * sin(lv(kv.y, 8.0, 0.2, 0.4) * t);
    else if (k.y == 2) {
        vec2 dc = p - lv(kv.y, 5.0, 0.15, 0.45) * vec2(cos(0.1 * t), sin(0.13 * t));
        n *= lv(kv.y, 2.0, 0.5, 1.0) + lv(kv.y, 3.0, 0.4, 1.0) * exp(lv(kv.y, 4.0, -3.5, -0.5) * dot(dc, dc));
    }
    else if (k.y == 3) n *= 1.0 + lv(kv.y, 6.0, 0.06, 0.18) * sin(lv(kv.y, 7.0, 1.5, 4.5) * p.x + 0.4 * t);
    // the direction field: a is across the lines, b along them
    float a, b;
    float turns = float(lk(kv.z, 4.0, 4));
    float along = 6.0 + 2.0 * float(lk(kv.z, 3.0, 3));
    vec2 pc = p - vec2(lv(kv.z, 8.0, -0.3, 0.3), lv(kv.z, 9.0, -0.3, 0.3));
    if (k.z == 0) { vec2 q = rot2(lv(kv.z, 1.0, -0.4, 1.4) + lv(kv.z, 2.0, 0.03, 0.09) * t) * p; a = q.y * n; b = q.x * n; }
    else if (k.z == 1) { a = length(pc) * n; b = atan(pc.y, pc.x) * along; }
    else if (k.z == 2) { float th = atan(pc.y, pc.x); a = length(pc) * n + (3.0 + turns) * th / 6.2831853 + lv(kv.z, 5.0, 0.015, 0.045) * t * n; b = th * along; }
    else { float w = fbm(p * lv(kv.z, 6.0, 1.2, 2.8) + vec2(0.0, 0.05 * t)); a = (p.y + lv(kv.z, 7.0, 0.1, 0.26) * w) * n; b = p.x * n; }
    float cover = 0.0;
    float dd = k.w == 1 ? T : D;
    float wd = clamp(wt * dd * lv(kv.x, 12.0, 0.9, 1.4), 0.0, 0.5);
    if (k.x == 0) cover = engLine(a, clamp(wd * (1.0 + lv(kv.x, 13.0, -0.5, 0.5) * sin(lv(kv.x, 14.0, 0.2, 0.9) * b)), 0.0, 0.5));
    else if (k.x == 1) {
        float ang = lv(kv.x, 1.0, 0.3, 1.7944);
        cover = max(engLine(a, wd), engLine(a * cos(ang) + b * sin(ang), 0.5 * max(dd - lv(kv.x, 2.0, 0.3, 0.6), 0.0) * 2.0 * wt));
    }
    else if (k.x == 2) cover = engLine(a, clamp(wd * (lv(kv.x, 3.0, 0.5, 1.1) + lv(kv.x, 4.0, 0.3, 0.7) * wob * noise2(vec2(b * lv(kv.x, 5.0, 0.4, 1.0), floor(a))) * 2.0), 0.0, 0.5));
    else if (k.x == 3) cover = engLine(a + (lv(kv.x, 6.0, 0.15, 0.45) + 0.5 * wob) * sin(lv(kv.x, 7.0, 0.5, 1.3) * b + 0.5 * t), wd);
    else if (k.x == 4) {
        vec2 g = vec2(a, p.x * n);
        g.x += lv(kv.x, 10.0, -0.5, 0.5) * floor(g.y);
        vec2 f = fract(g) - 0.5;
        vec2 cg = floor(g);
        vec2 jit = (hash22(cg) - 0.5) * lv(kv.x, 8.0, 0.3, 0.7);
        cover = smoothstep(0.1, -0.1, length(f - jit) - lv(kv.x, 9.0, 0.35, 0.75) * sqrt(wt * dd));
    }
    else if (k.x == 5) cover = engLine(a - lv(kv.x, 11.0, 1.8, 4.2) * (0.3 + wob) * T, clamp(lv(kv.x, 15.0, 0.05, 0.15) + 0.4 * wt * dd, 0.0, 0.5));
    else if (k.x == 6) { float r = length(p * vec2(1.0, lv(kv.x, 17.0, 0.7, 1.3))) * n; cover = engLine(r + lv(kv.x, 16.0, 0.04, 0.16) * t, wd); }
    else cover = engLine(a, wd) * smoothstep(lv(kv.x, 19.0, 0.2, 0.4) - 0.4 * dd, lv(kv.x, 20.0, 0.6, 0.8) - 0.4 * dd, abs(fract(b * lv(kv.x, 18.0, 0.15, 0.35)) - 0.5) * 2.0);
    vec3 ground = mix(C6, vec3(1.0), lv(kv.w, 1.0, 0.44, 0.8)) * lv(kv.w, 2.0, 0.85, 1.05);
    vec3 ink = C * lv(kv.w, 3.0, 0.2, 0.44);
    if (k.w == 1) { ground = C6 * lv(kv.w, 4.0, 0.03, 0.11); ink = mix(C, vec3(1.0), lv(kv.w, 5.0, 0.1, 0.34)) * lv(kv.w, 6.0, 1.0, 1.3); }
    else if (k.w == 2) {
        ground = C6 * lv(kv.w, 7.0, 0.3, 0.6) + lv(kv.w, 8.0, 0.1, 0.26);
        float c2 = engLine(a + 0.5, clamp(0.5 * max(T - lv(kv.w, 9.0, 0.2, 0.5), 0.0) * 1.4 * wt, 0.0, 0.5));
        return mix(mix(ground, mix(C, vec3(1.0), 0.3) * 1.1, c2), C * lv(kv.w, 10.0, 0.18, 0.38), cover);
    }
    return mix(ground, ink, cover);
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(8, 4, 4, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float N = 46.0 + 60.0 * clamp(densityP, 0.0, 1.0);
    float wt = (0.65 + 0.7 * clamp(weightP, 0.0, 1.0)) * (0.8 + 0.4 * sw);
    float wob = 0.25 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * engLook(gLabK[i], gLabV[i], p, t, N, wt, wob);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
