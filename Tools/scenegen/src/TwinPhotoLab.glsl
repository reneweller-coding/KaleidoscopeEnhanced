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
 * @param uv   The place in the photos. (in)
 * @param p    The place on screen. (in)
 * @param t    The clock. (in)
 * @param sc   The pattern scale. (in)
 * @param st   The strength, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twinConnect(int con, vec2 uv, vec2 p, float t, float sc, float st)
{
    vec3 a = twinA(uv, 0.3);
    vec3 b = twinB(uv, 0.3);
    float la = luma(a), lb = luma(b);
    if (con == 0) return mix(a, b, smoothstep(-0.12, 0.12, la - (0.5 + 0.3 * sin(0.15 * t))));
    if (con == 1) return mix(a, twinB(uv + 0.0008 * st * twinGrad(uv, 0) * 60.0, 0.3), 0.8);
    if (con == 2) return mix(twinA(uv + (lb - 0.5) * 0.22 * st * vec2(1.0, 0.6), 0.3), twinB(uv + (la - 0.5) * 0.22 * st * vec2(-0.6, 1.0), 0.3), 0.5);
    if (con == 3) {
        vec2 q = rot2(0.1 * t) * p * (3.0 + 4.0 * sc);
        float c = 0.5 + 0.5 * sin(3.14159 * q.x) * sin(3.14159 * q.y) * 3.0;
        return mix(a, b, clamp(c, 0.0, 1.0));
    }
    if (con == 4) {
        vec2 g = twinGrad(uv, 0) - twinGrad(uv, 1);
        float m = 0.5 + 0.5 * sin(0.2 * t);
        return mix(twinA(uv - 0.003 * st * g * m, 0.3), twinB(uv + 0.003 * st * g * (1.0 - m), 0.3), m);
    }
    if (con == 5) {
        float f = (6.0 + 14.0 * sc) * (p.x + 0.35 * lb + 0.05 * t);
        return mix(a, b, smoothstep(-0.25, 0.25, sin(6.2831853 * f) * (0.4 + st)));
    }
    if (con == 6) {
        vec3 lowA = twinA(uv, 4.5);
        vec3 hiB = twinB(uv, 0.3) - twinB(uv, 3.5);
        float k = 0.6 + 0.9 * (0.5 + 0.5 * sin(0.17 * t)) * st;
        return lowA + k * hiB + 0.3 * (a - lowA) * (1.0 - st);
    }
    if (con == 7) {
        float m = 0.5 + 0.5 * sin(2.0 * p.x + 0.3 * t + 1.5 * p.y);
        vec3 c = b - luma(b);
        return mix(a, vec3(la) + c * 1.4, m * (0.5 + 0.5 * st));
    }
    if (con == 8) return mix(b, a, smoothstep(0.03, 0.35, abs(la - lb) * (1.5 + 2.0 * st)));
    if (con == 9) {
        vec2 q = p * (3.0 + 4.0 * sc) + 0.15 * t * vec2(0.6, 0.8);
        vec2 g = floor(q);
        float d1 = 9.0, d2 = 9.0;
        float par = 0.0;
        for (int j = -1; j <= 1; ++j) {
            for (int i = -1; i <= 1; ++i) {
                vec2 cg = g + vec2(float(i), float(j));
                float d = length(q - (cg + 0.15 + 0.7 * hash22(cg)));
                if (d < d1) { d2 = d1; d1 = d; par = hash21(cg) > 0.5 ? 1.0 : 0.0; } else if (d < d2) d2 = d;
            }
        }
        return mix(a, b, mix(par, 0.5, 1.0 - smoothstep(0.0, 0.2, d2 - d1)));
    }
    if (con == 10) {
        float n = 6.0 + 2.0 * floor(sc * 2.99);
        float an = atan(p.y, p.x) + 0.12 * t;
        float s = 0.5 + 0.5 * sin(n * an);
        return mix(a, b, smoothstep(0.35, 0.65, s));
    }
    vec2 c = 0.4 * vec2(cos(0.13 * t), sin(0.11 * t));
    vec2 d = p - c;
    float r = length(d);
    float w = exp(-r * r * (3.0 + 4.0 * sc));
    vec2 uv2 = uv + rot2(2.5 * w * st) * (p - c) * 0.0 + (rot2(2.5 * w * st) * d - d) * 0.8;
    return mix(a, twinB(uv2, 0.3), smoothstep(0.1, 0.6, w));
}

/**  One look of the lab.
 *
 * @param k   The classes: x the connection, y the shared space's bend, z the roles, w the weighting. (in)
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
vec3 twinLook(ivec4 k, vec2 p, float t, float sc, float st, float sw, float hd)
{
    vec2 q = p;
    if (k.y == 1) {
        float sec = 6.2831853 / 6.0;
        float an = abs(mod(atan(q.y, q.x) + 0.05 * t, sec) - 0.5 * sec);
        q = length(q) * vec2(cos(an), sin(an));
    } else if (k.y == 2) q = abs(fract(q * 0.9 + 0.5 + 0.02 * t) * 2.0 - 1.0) * 0.55 - 0.27;
    else if (k.y == 3) q = rot2(1.4 * exp(-2.5 * dot(q, q)) * sin(0.2 * t)) * q;
    else if (k.y == 4) q += 0.04 * vec2(sin(7.0 * q.y + 0.5 * t), sin(6.0 * q.x - 0.4 * t));
    else if (k.y == 5) q *= 1.0 + 0.25 * sin(0.2 * t);
    vec2 uv = q * 0.8 + 0.5;
    float swap = k.z == 1 ? 1.0 : (k.z == 2 ? 0.5 + 0.5 * sin(0.12 * t + 0.4 * hd) : 0.0);
    vec3 col = vec3(0.0);
    for (int r = 0; r < 2; ++r) {
        float w = r == 0 ? 1.0 - swap : swap;
        if (w < 0.002) continue;
        gRoles = r;
        col += w * twinConnect(k.x, uv, q, t, sc, st);
    }
    gRoles = 0;
    float bias = k.w == 1 ? 0.18 : (k.w == 2 ? -0.18 : (k.w == 3 ? 0.2 * sin(0.3 * t) * (0.4 + sw) : 0.0));
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
            col += gLabW[i] * twinLook(gLabK[i], p, t, clamp(scaleP, 0.0, 1.0), st, sw, audioHarmAdvance);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
