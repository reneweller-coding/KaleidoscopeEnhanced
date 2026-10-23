//@doc
 * @brief SEQUENCE LAB: number sequences write the order into the picture -- the Fibonacci word, the Thue-Morse
 * sequence, Rudin-Shapiro, the regular paper-folding sequence, the period-doubling sequence, the Cantor set -- each
 * telling every cell of a grid whether, and how, the photo is changed in it: flipped, turned a quarter, shifted half a
 * window, zoomed, or shown at another moment.  The sequence runs along the columns and along the rows, and the two are
 * combined (exclusive or, and, or independently for the two axes).  The pictures are ordered but never periodic: the
 * eye finds a rhythm that never repeats.  The second stage chooses the operation, the third the grid (squares, tall
 * strips, rings and sectors, a slanted grid), the fourth the way the two sequences combine.  The walk changes one
 * stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the operations reach (the shift, the zoom, the time offset)
 *   audioPhase      -> the grid's slow drift and the windows' own clocks (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (a new sequence)
 *
 * Knobs: seedP (the walk's seed), cellsP (how many cells), reachP (the base reach of the operations), hueP.
//@params seedP cellsP reachP
//@audio audioSwell
//@body
/**  The nth term of a sequence.
 *
 * @param s   The sequence, 0..5: Fibonacci word, Thue-Morse, Rudin-Shapiro, paper folding, period doubling, Cantor. (in)
 * @param vi  The sequence's variant 0..99: where it starts, whether it is complemented, its slope or forbidden digit. (in)
 * @param n   The index, a whole number from 0 up. (in)
 *
 * @return
 *   The term, 0 or 1.
 **/
float seqTerm(int s, int vi, float n)
{
    n = mod(n + float(lk(vi, 1.0, 8)), 4096.0);
    float cm = float(lk(vi, 3.0, 2));
    if (s == 0) {
        float g = lv(vi, 2.0, 1.2360679, 2.0);
        float w = floor((n + 2.0) / g) - floor((n + 1.0) / g) > 0.5 ? 1.0 : 0.0;
        return abs(w - cm);
    }
    int m = int(n);
    if (s == 1) {
        int c = 0;
        for (int i = 0; i < 12; ++i) c += (m >> i) & 1;
        return abs(float(c & 1) - cm);
    }
    if (s == 2) {
        int c = 0;
        for (int i = 0; i < 11; ++i) c += ((m >> i) & 1) & ((m >> (i + 1)) & 1);
        return abs(float(c & 1) - cm);
    }
    if (s == 3) {
        int v = m + 1;
        for (int i = 0; i < 12; ++i) { if ((v & 1) == 0) v >>= 1; }
        return abs(float((v >> 1) & 1) - cm);
    }
    if (s == 4) {
        int v = m + 1;
        int c = 0;
        for (int i = 0; i < 12; ++i) { if ((v & 1) == 0) { v >>= 1; c++; } }
        return abs(float(c & 1) - cm);
    }
    int v = m;
    int fd = (1 + lk(vi, 4.0, 3)) - 3 * ((1 + lk(vi, 4.0, 3)) / 3);
    float ok = 1.0;
    for (int i = 0; i < 7; ++i) { if (v - 3 * (v / 3) == fd) ok = 0.0; v /= 3; }
    return abs(ok - cm);
}

/**  One look of the lab.
 *
 * @param k    The classes: x the sequence, y the operation, z the grid, w the combination of the two sequences. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param nc   The number of cells across a unit. (in)
 * @param rc   The reach of the operations. (in)
 *
 * @return
 *   The colour.
 **/
vec3 seqLook(ivec4 k, ivec4 kv, vec2 p, float t, float nc, float rc)
{
    float gx, gy;
    if (k.z == 0) { gx = p.x * nc; gy = p.y * nc; }
    else if (k.z == 1) { gx = p.x * nc * lv(kv.z, 1.0, 0.8, 1.6); gy = 0.0; }
    else if (k.z == 2) { gx = atan(p.y, p.x) / 6.2831853 * (18.0 + 2.0 * float(lk(kv.z, 2.0, 4))); gy = length(p) * nc * lv(kv.z, 3.0, 1.0, 2.0); }
    else { gx = (p.x + lv(kv.z, 4.0, 0.2, 0.6) * p.y) * nc; gy = (p.y - lv(kv.z, 5.0, 0.1, 0.3) * p.x) * nc; }
    float ix = floor(gx);
    float iy = floor(gy);
    vec2 loc = (vec2(fract(gx), fract(gy)) - 0.5) / nc;          // the place in its cell, in screen units
    float bx = seqTerm(k.x, kv.x, ix);
    float by = seqTerm(k.x, kv.x, iy);
    float a = bx;
    float b = by;
    if (k.w == 0) { a = abs(bx - by); b = a; }
    else if (k.w == 1) { a = bx * by; b = a; }
    else if (lk(kv.w, 1.0, 2) == 1) { a = by; b = bx; }
    if (k.w < 2 && lk(kv.w, 2.0, 2) == 1) { a = 1.0 - a; b = a; }
    vec2 centre = p - loc;
    vec2 uv;
    float ls = lv(kv.y, 8.0, 0.6, 1.4);
    if (k.y == 0) uv = (centre + ls * vec2(a > 0.5 ? -loc.x : loc.x, b > 0.5 ? -loc.y : loc.y)) * 0.8 + 0.5;
    else if (k.y == 1) uv = (centre + ls * (a > 0.5 ? vec2(-loc.y, loc.x) : loc)) * 0.8 + 0.5;
    else if (k.y == 2) uv = (p + vec2(a, b) * lv(kv.y, 1.0, 0.1, 0.34) * rc) * 0.8 + 0.5;
    else if (k.y == 3) uv = (centre + loc * (a > 0.5 ? 1.0 + lv(kv.y, 2.0, 0.1, 1.3) * rc : 1.0 / (1.0 + lv(kv.y, 3.0, 0.1, 0.9) * rc))) * 0.8 + 0.5;
    else uv = p * 0.8 + 0.5 + lv(kv.y, 4.0, 0.06, 0.18) * rc * vec2(sin(lv(kv.y, 5.0, 0.2, 0.6) * t + lv(kv.y, 6.0, 1.5, 4.5) * a), cos(lv(kv.y, 7.0, 0.2, 0.5) * t + lv(kv.y, 6.0, 1.5, 4.5) * b));
    return imgLod(uv, lv(kv.w, 3.0, 0.2, 0.6));
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(6, 5, 4, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float nc = 4.0 + 7.0 * clamp(cellsP, 0.0, 1.0);
    float rc = (0.6 + 0.8 * clamp(reachP, 0.0, 1.0)) * (0.7 + 0.6 * sw);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * seqLook(gLabK[i], gLabV[i], p, t, nc, rc);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
