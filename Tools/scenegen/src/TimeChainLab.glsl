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
//@body
/**  One stage of the chain: a coordinate map evaluated at its own time.
 *
 * @param m   The map, 0..7: kaleidoscope, log-spiral, ripples, twirl, inversion, mirror line, domain warp, polar tunnel. (in)
 * @param q   The place. (in)
 * @param t   The stage's own time. (in)
 * @param st  The strength, 0..1. (in)
 *
 * @return
 *   The mapped place.
 **/
vec2 chainMap(int m, vec2 q, float t, float st)
{
    float r = length(q);
    if (m == 0) {
        float sec = 6.2831853 / 6.0;
        float an = abs(mod(atan(q.y, q.x) + 0.1 * t, sec) - 0.5 * sec);
        return r * vec2(cos(an), sin(an));
    }
    if (m == 1) {
        float A = 4.0 * atan(q.y, q.x) / 6.2831853;
        return vec2(log(max(r, 1e-3)) * 0.9 - 0.1 * t + A, A);
    }
    if (m == 2) return q * (1.0 + 0.12 * st * sin(14.0 * r - 0.8 * t));
    if (m == 3) return rot2(1.8 * st * exp(-3.0 * r * r) * sin(0.3 * t)) * q;
    if (m == 4) {
        vec2 c = 0.3 * vec2(cos(0.13 * t), sin(0.17 * t));
        vec2 d = q - c;
        return c + d / max(dot(d, d), 0.04) * 0.12 * (0.6 + 0.8 * st);
    }
    if (m == 5) {
        float a = 0.5 + 0.12 * t;
        vec2 n = vec2(cos(a), sin(a));
        return q - 2.0 * min(dot(q, n) - 0.1 * sin(0.2 * t), 0.0) * n;
    }
    if (m == 6) return q + 0.1 * st * vec2(sin(5.0 * q.y + 0.5 * t) + sin(3.0 * q.y - 0.3 * t), sin(5.0 * q.x - 0.4 * t));
    return vec2(1.0 / max(r, 0.05) + 0.06 * t, atan(q.y, q.x) / 6.2831853 * 4.0);
}

/**  One look of the lab.
 *
 * @param k    The classes: x, y, z the three maps, w the delay. (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param dl   The base delay. (in)
 * @param st   The strength. (in)
 *
 * @return
 *   The colour.
 **/
vec3 chainLook(ivec4 k, vec2 p, float t, float dl, float st)
{
    float delta = dl * (k.w == 0 ? 0.6 : (k.w == 1 ? 2.0 : (k.w == 2 ? 4.5 : 9.0)));
    vec2 q = p * 1.4;
    q = chainMap(k.x, q, t, st);
    q = (mirrorUV(q * 0.5 + 0.5) - 0.5) * 2.0;        // between the stages the photo's mirror repeat: every seam of a stage vanishes
    q = chainMap(k.y, q, t - delta, st);
    q = (mirrorUV(q * 0.5 + 0.5) - 0.5) * 2.0;
    q = chainMap(k.z, q, t - 2.0 * delta, st);
    return imgLod(q * 0.5 + 0.5, 0.5);
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
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * chainLook(gLabK[i], p, t, dl, st);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
