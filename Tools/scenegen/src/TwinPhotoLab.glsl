//@doc
 * @brief TWIN PHOTO LAB: two photos -- the one on show and the one before it -- woven by a vocabulary of connections:
 * a mask cut from one's brightness, one refracted through the other's gradient, each pushing the other by its
 * brightness, a checkerboard, a morph that slides pixels toward the other, stripes whose width the other sets, a hybrid
 * (the coarse masses of one, the fine grain of the other), a swap of luma and colour, a glow where they differ, Voronoi
 * parity, alternating wedges of a kaleidoscope, a vortex window.  A second stage bends the shared space (kaleidoscope
 * fold, mirrored tiles, swirl, waves, breathing zoom), a third swaps the photos' roles, a fourth weights them.  The walk
 * changes one stage at a time and cross-fades; a new section changes all four.  Both photos keep their own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the mixing degree breathes with it
 *   audioPhase      -> the connections' motions (integrated)
 *   audioHarmAdvance -> the roles drift toward the other photo with each harmonic change (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage
 *
 * Knobs: seedP (the walk's seed), scaleP (the pattern scale of checkers, stripes and cells), strengthP (the connection's strength), hueP.
//@params seedP scaleP strengthP
//@audio audioSwell audioHarmAdvance
//@body
/** Which photo plays the first part: 0 the one on show, 1 the second (swapped roles). */
int gRoles = 0;

/**  The photo that plays the first part: the one on show, or (swapped roles) the second one.
 *
 * @param uv   The place. (in)
 * @param lod  The mip level. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinA(vec2 uv, float lod)
{
    return gRoles == 0 ? imgLod(uv, lod) : imgB(uv, lod);
}

/**  The photo that plays the second part.
 *
 * @param uv   The place. (in)
 * @param lod  The mip level. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinB(vec2 uv, float lod)
{
    return gRoles == 0 ? imgB(uv, lod) : imgLod(uv, lod);
}

/**  The photos' brightness gradient (per unit of uv) at a soft level.
 *
 * @param uv     The place. (in)
 * @param second  0: the photo on show, 1: the second photo. (in)
 *
 * @return
 *   The gradient.
 **/
vec2 twinGrad(vec2 uv, int second)
{
    float e = 0.012;
    if (second == 0)
        return vec2(luma(twinA(uv + vec2(e, 0.0), 2.0)) - luma(twinA(uv - vec2(e, 0.0), 2.0)),
                    luma(twinA(uv + vec2(0.0, e), 2.0)) - luma(twinA(uv - vec2(0.0, e), 2.0))) / (2.0 * e);
    return vec2(luma(twinB(uv + vec2(e, 0.0), 2.0)) - luma(twinB(uv - vec2(e, 0.0), 2.0)),
                luma(twinB(uv + vec2(0.0, e), 2.0)) - luma(twinB(uv - vec2(0.0, e), 2.0))) / (2.0 * e);
}

/**  The two photos connected in one of twelve ways.
 *
 * @param con  The connection, 0..11. (in)
 * @param vi   The connection's variant 0..99: the constants of the way. (in)
 * @param uv   The place in the photos. (in)
 * @param p    The place on screen. (in)
 * @param t    The clock. (in)
 * @param sc   The pattern scale. (in)
 * @param st   The strength, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinConnect(int con, int vi, vec2 uv, vec2 p, float t, float sc, float st)
{
    vec3 a = twinA(uv, 0.3);
    vec3 b = twinB(uv, 0.3);
    float la = luma(a), lb = luma(b);
    if (con == 0) return mix(a, b, smoothstep(-lv(vi, 4.0, 0.05, 0.19), lv(vi, 4.0, 0.05, 0.19), la - (lv(vi, 1.0, 0.35, 0.65) + lv(vi, 2.0, 0.15, 0.45) * sin(lv(vi, 3.0, 0.08, 0.22) * t))));
    if (con == 1) return mix(a, twinB(uv + lv(vi, 1.0, 0.0004, 0.0012) * st * twinGrad(uv, 0) * 60.0, 0.3), lv(vi, 2.0, 0.6, 1.0));
    if (con == 2) return mix(twinA(uv + (lb - 0.5) * lv(vi, 1.0, 0.1, 0.34) * st * vec2(1.0, 0.6), 0.3), twinB(uv + (la - 0.5) * lv(vi, 1.0, 0.1, 0.34) * st * vec2(-0.6, 1.0), 0.3), 0.5);
    if (con == 3) {
        vec2 q = rot2(lv(vi, 1.0, 0.0, 0.2) * t) * p * (3.0 + 4.0 * sc);
        float c = 0.5 + 0.5 * sin(3.14159 * q.x) * sin(3.14159 * q.y) * lv(vi, 2.0, 1.8, 4.2);
        return mix(a, b, clamp(c, 0.0, 1.0));
    }
    if (con == 4) {
        vec2 g = twinGrad(uv, 0) - twinGrad(uv, 1);
        float m = 0.5 + 0.5 * sin(lv(vi, 2.0, 0.1, 0.3) * t);
        float gs = lv(vi, 1.0, 0.0015, 0.0045);
        return mix(twinA(uv - gs * st * g * m, 0.3), twinB(uv + gs * st * g * (1.0 - m), 0.3), m);
    }
    if (con == 5) {
        float f = (6.0 + 14.0 * sc) * (p.x + lv(vi, 1.0, 0.1, 0.6) * lb + lv(vi, 2.0, 0.02, 0.08) * t);
        return mix(a, b, smoothstep(-lv(vi, 3.0, 0.1, 0.4), lv(vi, 3.0, 0.1, 0.4), sin(6.2831853 * f) * (lv(vi, 4.0, 0.2, 0.6) + st)));
    }
    if (con == 6) {
        vec3 lowA = twinA(uv, lv(vi, 1.0, 2.5, 6.5));
        vec3 hiB = twinB(uv, 0.3) - twinB(uv, lv(vi, 2.0, 1.5, 5.5));
        float k = lv(vi, 3.0, 0.1, 1.1) + lv(vi, 4.0, 0.2, 1.6) * (0.5 + 0.5 * sin(0.17 * t)) * st;
        return lowA + k * hiB + lv(vi, 5.0, 0.15, 0.45) * (a - lowA) * (1.0 - st);
    }
    if (con == 7) {
        float m = 0.5 + 0.5 * sin(lv(vi, 1.0, 0.5, 3.5) * p.x + 0.3 * t + lv(vi, 2.0, 0.3, 2.7) * p.y);
        vec3 c = b - luma(b);
        return mix(a, vec3(la) + c * lv(vi, 3.0, 0.5, 2.3), m * (0.5 + 0.5 * st));
    }
    if (con == 8) return mix(b, a, smoothstep(lv(vi, 2.0, 0.0, 0.06), lv(vi, 1.0, 0.1, 0.6), abs(la - lb) * (lv(vi, 4.0, 0.8, 2.2) + 2.0 * st)));
    if (con == 9) {
        vec2 q = p * (3.0 + 4.0 * sc) + lv(vi, 1.0, 0.05, 0.25) * t * vec2(0.6, 0.8);
        vec2 g = floor(q);
        float d1 = 9.0, d2 = 9.0;
        float par = 0.0;
        float jt = lv(vi, 2.0, 0.4, 1.0);
        for (int j = -1; j <= 1; ++j) {
            for (int i = -1; i <= 1; ++i) {
                vec2 cg = g + vec2(float(i), float(j));
                float d = length(q - (cg + 0.5 + jt * (hash22(cg) - 0.5)));
                if (d < d1) { d2 = d1; d1 = d; par = hash21(cg) > 0.5 ? 1.0 : 0.0; } else if (d < d2) d2 = d;
            }
        }
        return mix(a, b, mix(par, 0.5, 1.0 - smoothstep(0.0, lv(vi, 3.0, 0.1, 0.3), d2 - d1)));
    }
    if (con == 10) {
        float n = 6.0 + 2.0 * floor(sc * 2.99) + 2.0 * float(lk(vi, 1.0, 3));
        float an = atan(p.y, p.x) + lv(vi, 2.0, 0.06, 0.18) * t;
        float s = 0.5 + 0.5 * sin(n * an);
        float w = lv(vi, 3.0, 0.1, 0.2);
        return mix(a, b, smoothstep(0.5 - w, 0.5 + w, s));
    }
    vec2 c = lv(vi, 1.0, 0.2, 0.6) * vec2(cos(0.13 * t), sin(0.11 * t));
    vec2 d = p - c;
    float r = length(d);
    float w = exp(-r * r * (3.0 + 4.0 * sc));
    vec2 uv2 = uv + (rot2(lv(vi, 2.0, 1.2, 3.8) * w * st) * d - d) * lv(vi, 3.0, 0.5, 1.1);
    return mix(a, twinB(uv2, 0.3), smoothstep(0.1, 0.6, w));
}

/**  One look of the lab.
 *
 * @param k   The classes: x the connection, y the shared space's bend, z the roles, w the weighting. (in)
 * @param kv  The variants of those classes (the constants of each). (in)
 * @param p   The place on screen. (in)
 * @param t   The clock. (in)
 * @param sc  The pattern scale. (in)
 * @param st  The strength. (in)
 * @param sw  The swell. (in)
 * @param hd  The harmonic advance. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinLook(ivec4 k, ivec4 kv, vec2 p, float t, float sc, float st, float sw, float hd)
{
    vec2 q = p;
    if (k.y == 1) {
        float sec = 6.2831853 / (6.0 + 2.0 * float(lk(kv.y, 1.0, 3)));
        float an = abs(mod(atan(q.y, q.x) + lv(kv.y, 2.0, 0.02, 0.08) * t, sec) - 0.5 * sec);
        q = length(q) * vec2(cos(an), sin(an));
    } else if (k.y == 2) q = abs(fract(q * lv(kv.y, 3.0, 0.6, 1.2) + 0.5 + lv(kv.y, 5.0, 0.0, 0.04) * t) * 2.0 - 1.0) * lv(kv.y, 4.0, 0.4, 0.7) - lv(kv.y, 4.0, 0.4, 0.7) * 0.4909;
    else if (k.y == 3) q = rot2(lv(kv.y, 6.0, 0.7, 2.1) * exp(lv(kv.y, 7.0, -4.0, -1.0) * dot(q, q)) * sin(lv(kv.y, 8.0, 0.1, 0.3) * t)) * q;
    else if (k.y == 4) q += lv(kv.y, 9.0, 0.02, 0.06) * vec2(sin(lv(kv.y, 10.0, 4.0, 10.0) * q.y + 0.5 * t), sin(lv(kv.y, 11.0, 3.5, 8.5) * q.x - 0.4 * t));
    else if (k.y == 5) q *= 1.0 + lv(kv.y, 12.0, 0.12, 0.38) * sin(lv(kv.y, 13.0, 0.1, 0.3) * t);
    vec2 uv = q * 0.8 + 0.5;
    float swap = k.z == 1 ? 1.0 : (k.z == 2 ? 0.5 + 0.5 * sin(lv(kv.z, 1.0, 0.06, 0.18) * t + lv(kv.z, 2.0, 0.2, 0.6) * hd) : 0.0);
    vec3 col = vec3(0.0);
    for (int r = 0; r < 2; ++r) {
        float w = r == 0 ? 1.0 - swap : swap;
        if (w < 0.002) continue;
        gRoles = r;
        col += w * twinConnect(k.x, kv.x, uv, q, t, sc, st);
    }
    gRoles = 0;
    float bg = lv(kv.w, 1.0, 0.03, 0.33);
    float bias = k.w == 1 ? bg : (k.w == 2 ? -bg : (k.w == 3 ? lv(kv.w, 2.0, 0.1, 0.3) * sin(lv(kv.w, 3.0, 0.15, 0.45) * t) * (lv(kv.w, 4.0, 0.2, 0.6) + sw) : 0.0));
    vec3 a = imgLod(uv, 0.3), b = imgB(uv, 0.3);
    return clamp(col + bias * (b - a), 0.0, 1.6);
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(12, 6, 3, 4), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float t = sceneTime * 0.7 + 5.0 * audioPhase;
    float st = (0.5 + 0.5 * clamp(strengthP, 0.0, 1.0)) * (0.7 + 0.5 * sw);
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * twinLook(gLabK[i], gLabV[i], p, t, clamp(scaleP, 0.0, 1.0), st, sw, audioHarmAdvance);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
