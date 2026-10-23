//@doc
 * @brief EXPOSURE LAB: the photo as a long exposure -- every pixel gathers the photo along a path in time: a zoom
 * burst, a spin about a pivot, star trails about a far pole, a straight or a curved wipe, a light-painting Lissajous
 * loop, a shear, an elliptical orbit.  Mean exposure smears the colours into silk, the lighten stack leaves the bright
 * places as sharp trails on their ground, and a comet weighting draws a bright head with a fading tail.  The second
 * stage moves the pivot (fixed, wandering, far off the screen, two pivots), the third sets the exposure's length, the
 * fourth how the samples combine.  The walk changes one stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioPhase      -> the pivot wanders and the paths turn (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage
 *
 * Knobs: seedP (the walk's seed), lengthP (the exposure's base length), spreadP (how far the pivot wanders), hueP.
//@params seedP lengthP spreadP
//@audio audioSwell
//@body
/**  The place a pixel reads at a point of the exposure's path.
 *
 * @param kind  The path, 0..7: zoom, spin, far-pole trails, wipe, curved wipe, light-painting loop, shear, orbit. (in)
 * @param vi    The path's variant 0..99: the constants of its law. (in)
 * @param p     The pixel's place. (in)
 * @param c     The pivot. (in)
 * @param u     The point on the path, -0.5..0.5. (in)
 * @param L     The exposure's length. (in)
 * @param t     The clock. (in)
 *
 * @return
 *   The place to read.
 **/
vec2 expPath(int kind, int vi, vec2 p, vec2 c, float u, float L, float t)
{
    vec2 d = p - c;
    float a = 6.2831853 * (u + 0.5);
    if (kind == 0) return c + d * exp(lv(vi, 1.0, 0.3, 1.5) * L * u);
    if (kind == 1) return c + rot2(lv(vi, 1.0, 0.8, 2.4) * L * u) * d;
    if (kind == 2) { vec2 pole = c + vec2(lv(vi, 2.0, -0.5, 0.5), lv(vi, 1.0, -1.8, -0.6)); return pole + rot2(lv(vi, 3.0, 0.3, 0.8) * L * u) * (p - pole); }
    float an = lv(vi, 4.0, -1.5, 2.5) + lv(vi, 5.0, 0.02, 0.08) * t;
    vec2 dir = vec2(cos(an), sin(an));
    if (kind == 3) return p + dir * L * lv(vi, 6.0, 0.3, 0.7) * u;
    if (kind == 4) return p + dir * L * lv(vi, 6.0, 0.3, 0.7) * u + vec2(-dir.y, dir.x) * lv(vi, 7.0, 0.15, 0.45) * L * sin(lv(vi, 8.0, 1.5, 4.5) * u);
    if (kind == 5) {
        float fx = 3.0 + float(lk(vi, 10.0, 3));
        float fy = 2.0 + float(lk(vi, 11.0, 3));
        return p + L * lv(vi, 9.0, 0.1, 0.26) * vec2(sin(fx * a + 0.2 * t), sin(fy * a));
    }
    if (kind == 6) {
        float sh = L * lv(vi, 12.0, 0.5, 1.3) * u;
        return lk(vi, 13.0, 2) == 0 ? p + vec2(sh * d.y, 0.0) : p + vec2(0.0, sh * d.x);
    }
    return p + L * lv(vi, 14.0, 0.12, 0.28) * vec2(cos(a), lv(vi, 15.0, 0.3, 0.9) * sin(a));
}

/**  One look of the lab.
 *
 * @param k    The classes: x the path, y the pivot, z the length, w the combination. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param L    The exposure's base length. (in)
 * @param wd   How far the pivot wanders. (in)
 *
 * @return
 *   The colour.
 **/
vec3 expLook(ivec4 k, ivec4 kv, vec2 p, float t, float L, float wd)
{
    vec2 c = vec2(0.0);
    if (k.y == 1) c = wd * vec2(sin(lv(kv.y, 1.0, 0.05, 0.17) * t), cos(lv(kv.y, 2.0, 0.04, 0.14) * t));
    else if (k.y == 2) c = vec2(lv(kv.y, 3.0, 0.6, 1.2), lv(kv.y, 4.0, 0.5, 0.9)) * vec2(cos(lv(kv.y, 5.0, 0.025, 0.075) * t + 1.0), sin(lv(kv.y, 5.0, 0.025, 0.075) * t + 1.0)) * (0.8 + wd);
    else if (k.y == 3) c = (p.x > 0.0 ? vec2(lv(kv.y, 6.0, 0.25, 0.65), lv(kv.y, 7.0, -0.1, 0.3)) : -vec2(lv(kv.y, 6.0, 0.25, 0.65), lv(kv.y, 7.0, -0.1, 0.3))) + wd * 0.3 * vec2(sin(0.1 * t), cos(0.1 * t));
    L *= (k.z == 0 ? 0.55 : (k.z == 1 ? 1.0 : 1.6)) * lv(kv.z, 1.0, 0.5, 1.5);
    float gw = lv(kv.w, 1.0, 1.5, 4.5);
    float bl = lv(kv.x, 16.0, 1.0, 2.0);
    vec3 sum = vec3(0.0);
    vec3 mx = vec3(0.0);
    float ws = 0.0;
    float jit = hash21(gl_FragCoord.xy) - 0.5;
    for (int i = 0; i < 14; ++i) {
        float u = (float(i) + jit) / 13.0 - 0.5;
        vec3 col = imgLod(expPath(k.x, kv.x, p, c, u, L, t) * 0.8 + 0.5, 0.5 + bl * abs(u) * L);
        float w = k.w == 2 ? exp(-gw * (u + 0.5)) : 1.0;
        sum += w * col;
        ws += w;
        mx = max(mx, col);
    }
    vec3 mean = sum / ws;
    if (k.w == 1) return mix(mean, mx, lv(kv.w, 2.0, 0.4, 1.3)) * 1.05;
    if (k.w == 2) return mean * 1.1 + lv(kv.w, 3.0, 0.08, 0.22) * imgLod(p * 0.8 + 0.5, 0.5);
    return mean;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(8, 4, 3, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float L = (0.45 + 0.9 * clamp(lengthP, 0.0, 1.0)) * (0.55 + 0.9 * sw);
    float wd = 0.15 + 0.4 * clamp(spreadP, 0.0, 1.0);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * expLook(gLabK[i], gLabV[i], p, t, L, wd);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
