//@doc
 * @brief DEFECT LAB: a photo kaleidoscope with crystal flaws -- the photo folded into the fundamental triangle of a
 * hexagonal or a square lattice of mirrors, and then the lattice damaged: a pair of dislocations (an extra half row of
 * cells), a five-fold or seven-fold disclination (a wedge of the pattern removed or added), a twin boundary (the
 * pattern mirrored across a line), a grain boundary (a half plane turned by a few degrees), or several of them
 * together.  The flaws wander, circle, and approach one another until the pair of dislocations cancels and the lattice
 * heals, then split again.  The second stage chooses the flaw, the third how the flaws move, the fourth how fine the
 * lattice is.  The photo lies in the fundamental domain and shows the flaws as faults of the pattern; every seam
 * is a true crystallographic one.  The walk changes one stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the flaws' strength and the grain boundary's misorientation
 *   audioPhase      -> the flaws' wandering (integrated)
 *   audioHarmAdvance -> the pair of dislocations approaches or parts with each harmonic change (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (a new lattice, a new flaw)
 *
 * Knobs: seedP (the walk's seed), cellP (the lattice's size), flawP (how strong the flaws are), hueP.
//@params seedP cellP flawP
//@audio audioSwell audioHarmAdvance
//@body
/**  Folds a point into the fundamental triangle of a mirror lattice.
 *
 * @param lat  The lattice: 0 hexagonal (the 30-60-90 triangle), 1 square (the 45-45-90 triangle). (in)
 * @param vi   The lattice's variant 0..99: its orientation and offset. (in)
 * @param q    The point (the lattice's cells are one unit across). (in)
 *
 * @return
 *   The point inside the fundamental triangle.
 **/
vec2 defFold(int lat, int vi, vec2 q)
{
    q += vec2(lv(vi, 1.0, -0.5, 0.5), lv(vi, 2.0, -0.5, 0.5));
    if (lat == 1) {
        q = abs(fract(q + 0.5) * 2.0 - 1.0) * 0.5;
        return vec2(max(q.x, q.y), min(q.x, q.y));
    }
    float ro = lv(vi, 3.0, -0.5, 0.5);
    for (int i = 0; i < 6; ++i) {
        for (int j = 0; j < 3; ++j) {
            float a = 1.0471976 * float(j) + 1.5707963 + ro;
            vec2 n = vec2(cos(a), sin(a));
            float d = dot(q, n);
            float f = abs(fract(d + 0.5) * 2.0 - 1.0) * 0.5;
            q += n * (f - d);
        }
    }
    return q;
}

/**  The displacement a flaw puts on the lattice at a place.
 *
 * @param flaw  The flaw, 0..5: dislocation pair, five-fold, seven-fold, twin boundary, grain boundary, mixed. (in)
 * @param vi    The flaw's variant 0..99: its centre's path, the translation, the boundary's angle. (in)
 * @param p     The place. (in)
 * @param t     The clock. (in)
 * @param sep   The separation of a dislocation pair, 0 (cancelled) .. 1. (in)
 * @param st    The strength. (in)
 * @param m     The lattice's rotation order (6 or 4). (in)
 *
 * @return
 *   The displaced place.
 **/
vec2 defFlaw(int flaw, int vi, vec2 p, float t, float sep, float st, float m)
{
    vec2 c1 = lv(vi, 1.0, 0.1, 0.4) * vec2(cos(lv(vi, 2.0, 0.08, 0.26) * t), sin(lv(vi, 3.0, 0.06, 0.2) * t));
    vec2 c2 = c1 + sep * lv(vi, 4.0, 0.2, 0.5) * vec2(cos(lv(vi, 5.0, 0.1, 0.3) * t + 1.0), sin(lv(vi, 5.0, 0.1, 0.3) * t + 1.0));
    vec2 b = m > 5.0 ? (lk(vi, 6.0, 2) == 0 ? vec2(0.0, 2.0) : vec2(0.0, -2.0)) : (lk(vi, 6.0, 2) == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0));   // a translation of the lattice
    if (flaw == 0 || flaw == 5) {
        vec2 q = p;
        q += b * st * (atan(p.y - c1.y, p.x - c1.x) / 6.2831853);
        q -= b * st * (atan(p.y - c2.y, p.x - c2.x) / 6.2831853);
        if (flaw == 0) return q;
        p = q;
    }
    if (flaw == 1 || flaw == 2 || flaw == 5) {
        float sg = flaw == 2 ? -1.0 : 1.0;
        vec2 d = p - c1;
        return c1 + rot2(sg * st * lv(vi, 7.0, 0.6, 1.4) * atan(d.y, d.x) / m) * d;
    }
    if (flaw == 3) {
        float ta = lv(vi, 8.0, -0.6, 1.0) + lv(vi, 9.0, 0.02, 0.08) * t;
        vec2 n = vec2(cos(ta), sin(ta));
        float s = dot(p - c1, n);
        return s < 0.0 ? p - 2.0 * s * n : p;
    }
    float ga = lv(vi, 8.0, -0.1, 1.1) + lv(vi, 9.0, 0.02, 0.06) * t;
    vec2 n = vec2(cos(ga), sin(ga));
    float s = dot(p - c1, n);
    return s < 0.0 ? c1 + rot2(lv(vi, 10.0, 0.12, 0.38) * st) * (p - c1) : p;
}

/**  One look of the lab.
 *
 * @param k    The classes: x the lattice, y the flaw, z the flaws' motion, w the lattice's fineness. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param hd   The harmonic advance. (in)
 * @param cs   The lattice's base size. (in)
 * @param st   The flaws' strength. (in)
 *
 * @return
 *   The colour.
 **/
vec3 defLook(ivec4 k, ivec4 kv, vec2 p, float t, float hd, float cs, float st)
{
    float size = cs * (k.w == 0 ? 0.6 : (k.w == 1 ? 1.0 : 1.7)) * lv(kv.w, 1.0, 0.8, 1.2);
    float sep = k.z == 2 ? 0.5 + lv(kv.z, 2.0, 0.3, 0.7) * cos(lv(kv.z, 1.0, 0.15, 0.35) * t + 0.6 * hd) : lv(kv.z, 3.0, 0.4, 1.0);
    float tt = k.z == 1 ? t * lv(kv.z, 4.0, 1.0, 2.4) : t;
    vec2 q = defFlaw(k.y, kv.y, p, tt, sep, st, k.x == 0 ? 6.0 : 4.0) * size;
    vec2 f = defFold(k.x, kv.x, q);
    return imgLod(f * lv(kv.x, 4.0, 1.0, 2.2) + lv(kv.x, 5.0, 0.0, 0.2), 0.5);
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(2, 6, 3, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float cs = 1.6 + 1.8 * clamp(cellP, 0.0, 1.0);
    float st = (0.7 + 0.5 * clamp(flawP, 0.0, 1.0)) * (0.8 + 0.4 * sw);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * defLook(gLabK[i], gLabV[i], p, t, audioHarmAdvance, cs, st);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
