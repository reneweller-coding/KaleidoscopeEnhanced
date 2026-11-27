//@doc
 * @brief TIME CHAIN LAB: a chain of three coordinate maps -- a kaleidoscope, a log-spiral, ripples, a twirl, an inversion
 * in a circle, a mirror line, a domain warp, a polar tunnel -- in which every stage is evaluated at its own time: the
 * second stage at t minus delta, the third at t minus twice delta.  The deformation echoes in itself: the photo is not
 * delayed, the maps are, so folds, spirals and ripples trail one another like a chord of one motion played in canon.  The
 * fourth stage sets the delay (short, medium, long, very long).  Eight maps in three stages and four delays make two
 * thousand chains, and every one is a canon.  The walk changes one stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the maps' strength
 *   audioPhase      -> the maps' clocks (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (new maps)
 *
 * Knobs: seedP (the walk's seed), delayP (the base delay), strengthP (the maps' base strength), hueP.
//@params seedP delayP strengthP
//@audio audioSwell
//@depth
//@body
uniform float depthLook;   // 4: the subject anchor (plan M2) -- each photo folds around its own subject; 0: the old look
float gPhD = 0.0;   // the photo's depth at the look's photo lookup, 0 far .. 1 near (photoDepthLod)
/**  One stage of the chain: a coordinate map evaluated at its own time.
 *
 * @param m   The map, 0..7: kaleidoscope, log-spiral, ripples, twirl, inversion, mirror line, domain warp, polar tunnel. (in)
 * @param vi  The map's variant 0..99: its constants (sectors, arms, rates, strengths). (in)
 * @param q   The place. (in)
 * @param t   The stage's own time. (in)
 * @param st  The strength, 0..1. (in)
 *
 * @return
 *   The mapped place.
 **/
vec2 chainMap(int m, int vi, vec2 q, float t, float st)
{
    float r = length(q);
    if (m == 0) {
        float sec = 6.2831853 / (6.0 + 2.0 * float(lk(vi, 1.0, 3)));
        float an = abs(mod(atan(q.y, q.x) + lv(vi, 2.0, 0.05, 0.15) * t, sec) - 0.5 * sec);
        return r * vec2(cos(an), sin(an));
    }
    if (m == 1) {
        float A = (4.0 + float(lk(vi, 3.0, 3))) * atan(q.y, q.x) / 6.2831853;
        return vec2(log(max(r, 1e-3)) * lv(vi, 4.0, 0.6, 1.2) - lv(vi, 5.0, 0.05, 0.15) * t + A, A);
    }
    if (m == 2) return q * (1.0 + lv(vi, 1.0, 0.06, 0.18) * st * sin(lv(vi, 2.0, 8.0, 20.0) * r - lv(vi, 3.0, 0.4, 1.2) * t));
    if (m == 3) return rot2(lv(vi, 1.0, 0.9, 2.7) * st * exp(lv(vi, 2.0, -5.0, -1.0) * r * r) * sin(lv(vi, 3.0, 0.15, 0.45) * t)) * q;
    if (m == 4) {
        vec2 c = lv(vi, 1.0, 0.15, 0.45) * vec2(cos(lv(vi, 2.0, 0.07, 0.19) * t), sin(lv(vi, 3.0, 0.09, 0.25) * t));
        vec2 d = q - c;
        return c + d / max(dot(d, d), lv(vi, 4.0, 0.02, 0.06)) * lv(vi, 5.0, 0.06, 0.18) * (lv(vi, 6.0, 0.3, 0.9) + lv(vi, 7.0, 0.4, 1.2) * st);
    }
    if (m == 5) {
        float a = lv(vi, 1.0, -0.5, 1.5) + lv(vi, 2.0, 0.06, 0.18) * t;
        vec2 n = vec2(cos(a), sin(a));
        return q - 2.0 * min(dot(q, n) - lv(vi, 3.0, 0.0, 0.2) * sin(lv(vi, 4.0, 0.1, 0.3) * t), 0.0) * n;
    }
    if (m == 6) return q + lv(vi, 1.0, 0.05, 0.15) * st * vec2(sin(lv(vi, 2.0, 3.0, 7.0) * q.y + lv(vi, 3.0, 0.3, 0.7) * t) + sin(lv(vi, 4.0, 2.0, 4.0) * q.y - lv(vi, 5.0, 0.15, 0.45) * t), sin(lv(vi, 6.0, 3.0, 7.0) * q.x - lv(vi, 7.0, 0.2, 0.6) * t));
    return vec2(1.0 / max(r, 0.05) + lv(vi, 1.0, 0.03, 0.09) * t, atan(q.y, q.x) / 6.2831853 * (4.0 + float(lk(vi, 2.0, 3))));
}

/**  One look of the lab.
 *
 * @param k    The classes: x, y, z the three maps, w the delay. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param dl   The base delay. (in)
 * @param st   The strength. (in)
 *
 * @return
 *   The colour.
 **/
vec3 chainLook(ivec4 k, ivec4 kv, vec2 p, float t, float dl, float st)
{
    float delta = dl * (k.w == 0 ? 0.6 : (k.w == 1 ? 2.0 : (k.w == 2 ? 4.5 : 9.0))) * lv(kv.w, 1.0, 0.7, 1.3);
    vec2 q = p * lv(kv.w, 2.0, 1.0, 1.8);
    q = chainMap(k.x, kv.x, q, t, st);
    q = (mirrorUV(q * 0.5 + 0.5) - 0.5) * 2.0;        // between the stages the photo's mirror repeat: every seam of a stage vanishes
    q = chainMap(k.y, kv.y, q, t - delta, st);
    q = (mirrorUV(q * 0.5 + 0.5) - 0.5) * 2.0;
    q = chainMap(k.z, kv.z, q, t - lv(kv.w, 3.0, 1.4, 2.6) * delta, st);
    vec2 puv = q * 0.5 + 0.5;
    float plod = 0.5;
    if (depthLook > 3.5) {   // the subject anchor (M2); without it the colour stays bit for bit
        vec4 r = imgDepthOff(puv, anchorOff(photoFocus.xy, photoSubject.y, photoDepthAmt.x),
                             anchorOff(photoFocus.zw, photoSubject.w, photoDepthAmt.y), plod);
        gPhD = r.w;
        return r.rgb;
    }
    gPhD = photoDepthLod(puv, plod);   // the depth where the colour is taken (26.11.2026)
    return imgLod(puv, plod);
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(8, 8, 8, 4), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float dl = 0.5 + 1.0 * clamp(delayP, 0.0, 1.0);
    float st = (0.6 + 0.6 * clamp(strengthP, 0.0, 1.0)) * (0.7 + 0.5 * sw);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    float dsum = 0.0;   // the looks' photo depth, weighted like their colours
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * chainLook(gLabK[i], gLabV[i], p, t, dl, st);
            dsum += gLabW[i] * gPhD;
            ws += gLabW[i];
        }
    }
    photoDepthOut(dsum / max(ws, 1e-3));
    finish(max(col / max(ws, 1e-3), 0.0));
}
