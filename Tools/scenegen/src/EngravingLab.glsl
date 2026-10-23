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
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param N    Lines per unit. (in)
 * @param wt   The line weight. (in)
 * @param wob  The wobble. (in)
 *
 * @return
 *   The colour.
 **/
vec3 engLook(ivec4 k, vec2 p, float t, float N, float wt, float wob)
{
    vec2 uv = p * 0.8 + 0.5;
    vec3 C = imgLod(uv, 2.5);
    float T = luma(imgLod(uv, 1.8));
    float D = 1.0 - T;
    vec3 C6 = imgLod(uv, 6.0);
    // the density layout
    float n = N;
    if (k.y == 1) n *= 1.0 + 0.1 * sin(0.3 * t);
    else if (k.y == 2) n *= 0.75 + 0.7 * exp(-2.0 * dot(p - 0.3 * vec2(cos(0.1 * t), sin(0.13 * t)), p - 0.3 * vec2(cos(0.1 * t), sin(0.13 * t))));
    else if (k.y == 3) n *= 1.0 + 0.12 * sin(3.0 * p.x + 0.4 * t);
    // the direction field: a is across the lines, b along them
    float a, b;
    if (k.z == 0) { vec2 q = rot2(0.5 + 0.06 * t) * p; a = q.y * n; b = q.x * n; }
    else if (k.z == 1) { a = length(p) * n; b = atan(p.y, p.x) * 6.0; }
    else if (k.z == 2) { float th = atan(p.y, p.x); a = length(p) * n + 3.0 * th / 6.2831853 + 0.03 * t * n; b = th * 6.0; }
    else { float w = fbm(p * 2.0 + vec2(0.0, 0.05 * t)); a = (p.y + 0.18 * w) * n; b = p.x * n; }
    float cover = 0.0;
    float dd = k.w == 1 ? T : D;
    float wd = clamp(wt * dd * 1.15, 0.0, 0.5);
    if (k.x == 0) cover = engLine(a, wd);
    else if (k.x == 1) cover = max(engLine(a, wd), engLine(a * 0.5 + b * 0.866, 0.5 * max(dd - 0.45, 0.0) * 2.0 * wt));
    else if (k.x == 2) cover = engLine(a, clamp(wd * (0.8 + 0.5 * wob * noise2(vec2(b * 0.7, floor(a))) * 2.0), 0.0, 0.5));
    else if (k.x == 3) cover = engLine(a + (0.3 + 0.5 * wob) * sin(0.9 * b + 0.5 * t) + 1.6 * dd * 0.0, wd);
    else if (k.x == 4) {
        vec2 g = vec2(a, b * 0.0 + p.x * n);
        vec2 f = fract(g) - 0.5;
        vec2 cg = floor(g);
        vec2 jit = (hash22(cg) - 0.5) * 0.5;
        cover = smoothstep(0.1, -0.1, length(f - jit) - 0.55 * sqrt(wt * dd));
    }
    else if (k.x == 5) cover = engLine(a - 3.0 * (0.3 + wob) * T, clamp(0.1 + 0.4 * wt * dd, 0.0, 0.5));
    else if (k.x == 6) { float r = length(p) * n; cover = engLine(r + 0.1 * t, wd); }
    else cover = engLine(a, wd) * smoothstep(0.3 - 0.4 * dd, 0.7 - 0.4 * dd, abs(fract(b * 0.25) - 0.5) * 2.0 + 0.0) ;
    vec3 ground = mix(C6, vec3(1.0), 0.62) * 0.95;
    vec3 ink = C * 0.32;
    if (k.w == 1) { ground = C6 * 0.07; ink = mix(C, vec3(1.0), 0.22) * 1.15; }
    else if (k.w == 2) {
        ground = C6 * 0.45 + 0.18;
        float c2 = engLine(a + 0.5, clamp(0.5 * max(T - 0.35, 0.0) * 1.4 * wt, 0.0, 0.5));
        return mix(mix(ground, mix(C, vec3(1.0), 0.3) * 1.1, c2), C * 0.28, cover);
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
            col += gLabW[i] * engLook(gLabK[i], p, t, N, wt, wob);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
