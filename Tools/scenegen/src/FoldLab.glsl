//@doc
 * @brief FOLD LAB: the photo as a sheet of paper folded by a pattern -- accordion pleats, diagonal pleats, the Miura
 * fold of parallelograms, the waterbomb's pyramids, Yoshimura's diamonds, a crumpled sheet of random facets.  The
 * sheet folds up and down: every face tilts by the fold angle, takes the light of a lamp that wanders round, and shows the
 * photo a little magnified by the foreshortening; the creases are soft shadows.  A second stage sets how the angle
 * moves (a steady swing, a breath, a staged fold, a travelling wave), a third the lamp (a soft turning light, a raking
 * low light, two lamps warm and cool), a fourth how fine the folds are.  The photo is continuous across every crease,
 * paper and picture are one.  The walk changes one stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the fold angle: the sheet folds as the music swells and opens in the piano
 *   audioPhase      -> the lamp's turn and the wave's travel (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (a new fold pattern)
 *
 * Knobs: seedP (the walk's seed), depthP (how deep the folds go), softP (how soft the creases are), hueP.
//@params seedP depthP softP
//@audio audioSwell
//@body
/**  The tilt of the face a place lies on, for a fold pattern, and the distance to the nearest crease.
 *
 * @param kind  The pattern, 0..5: pleats, diagonal pleats, Miura, waterbomb, Yoshimura, crumple. (in)
 * @param vi    The pattern's variant 0..99: angle, period, tilts, jitter. (in)
 * @param q     The place, in fold cells. (in)
 * @param cr    The distance to the nearest crease, in cells. (out)
 *
 * @return
 *   The tilt of the face (the horizontal part of its normal, -1..1).
 **/
vec2 foldFace(int kind, int vi, vec2 q, out float cr)
{
    cr = 0.5;
    if (kind == 0) q = rot2(lv(vi, 3.0, -0.6, 0.6)) * q;
    if (kind == 1) q = rot2(0.7854 + lv(vi, 1.0, -0.5, 0.5)) * q;
    if (kind == 4) q = rot2(0.7854 + lv(vi, 1.0, -0.5, 0.5)) * q * lv(vi, 2.0, 0.5, 0.9);
    if (kind == 0 || kind == 1) {
        float i = floor(q.x);
        float sg = (i - 2.0 * floor(i * 0.5)) > 0.5 ? 1.0 : -1.0;
        cr = min(fract(q.x), 1.0 - fract(q.x));
        return vec2(sg, 0.0);
    }
    if (kind == 2) {
        float tri = abs(fract(q.y * lv(vi, 4.0, 0.3, 0.7)) * 2.0 - 1.0);
        float x2 = q.x + lv(vi, 5.0, 0.2, 0.6) * tri;
        float i = floor(x2);
        float j = floor(q.y);
        float si = (i - 2.0 * floor(i * 0.5)) > 0.5 ? 1.0 : -1.0;
        float sj = (j - 2.0 * floor(j * 0.5)) > 0.5 ? 1.0 : -1.0;
        cr = min(min(fract(x2), 1.0 - fract(x2)), min(fract(q.y), 1.0 - fract(q.y)));
        return vec2(si * lv(vi, 6.0, 0.6, 1.0), sj * lv(vi, 7.0, 0.4, 0.8));
    }
    if (kind == 3 || kind == 4) {
        vec2 c = floor(q);
        vec2 f = fract(q) - 0.5;
        float par = (c.x + c.y - 2.0 * floor((c.x + c.y) * 0.5)) > 0.5 ? 1.0 : -1.0;
        cr = min(0.5 - max(abs(f.x), abs(f.y)), abs(abs(f.x) - abs(f.y)));
        if (abs(f.x) > abs(f.y)) return par * vec2(-sign(f.x), 0.0);
        return par * vec2(0.0, -sign(f.y));
    }
    vec2 g = floor(q);
    float d1 = 9.0, d2 = 9.0;
    vec2 best = vec2(0.0);
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 cg = g + vec2(float(i), float(j));
            float d = length(q - (cg + 0.5 + lv(vi, 8.0, 0.4, 1.0) * (hash22(cg) - 0.5)));
            if (d < d1) { d2 = d1; d1 = d; best = (hash22(cg + 11.0) - 0.5) * 2.0; } else if (d < d2) d2 = d;
        }
    }
    cr = 0.5 * (d2 - d1);
    return best;
}

/**  One look of the lab.
 *
 * @param k    The classes: x the pattern, y the angle's motion, z the lamp, w the fineness. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param dp   The fold depth, 0..1. (in)
 * @param sf   The creases' softness. (in)
 * @param sw   The swell. (in)
 *
 * @return
 *   The colour.
 **/
vec3 foldLook(ivec4 k, ivec4 kv, vec2 p, float t, float dp, float sf, float sw)
{
    float N = (k.w == 0 ? 3.0 : (k.w == 1 ? 5.0 : 9.0)) * lv(kv.w, 1.0, 0.8, 1.2);
    vec2 q = (p + 0.5) * N;
    float base = dp * (0.3 + 0.9 * sw);
    float th;
    if (k.y == 0) th = base * (lv(kv.y, 1.0, 0.4, 0.8) + lv(kv.y, 2.0, 0.2, 0.6) * sin(lv(kv.y, 3.0, 0.15, 0.45) * t));
    else if (k.y == 1) th = base * (0.5 + 0.5 * sin(lv(kv.y, 5.0, 0.3, 0.7) * t + lv(kv.y, 6.0, -1.0, 1.0)));
    else if (k.y == 2) th = base * smoothstep(0.0, 1.0, 0.5 + 0.5 * sin(lv(kv.y, 7.0, 0.15, 0.35) * t)) * (lv(kv.y, 9.0, 0.3, 0.9) + (1.0 - lv(kv.y, 9.0, 0.3, 0.9)) * smoothstep(0.0, 1.0, 0.5 + 0.5 * sin(lv(kv.y, 7.0, 0.15, 0.35) * t - lv(kv.y, 8.0, 0.6, 1.8))));
    else th = base * (lv(kv.y, 10.0, 0.4, 0.8) + (1.0 - lv(kv.y, 10.0, 0.4, 0.8)) * sin(lv(kv.y, 11.0, 1.5, 3.5) * p.x + lv(kv.y, 12.0, 0.3, 0.7) * t));
    th = clamp(th * 1.1, 0.0, 1.1);
    float cr;
    vec2 tilt = foldFace(k.x, kv.x, q, cr);
    vec3 n = normalize(vec3(tilt * sin(th), cos(th)));
    float a = lv(kv.z, 1.0, 0.1, 0.26) * t;
    vec3 L = k.z == 1 ? normalize(vec3(cos(a), sin(a), lv(kv.z, 2.0, 0.2, 0.56))) : normalize(vec3(cos(a), sin(a), lv(kv.z, 3.0, 0.6, 1.2)));
    float lam = clamp(dot(n, L), 0.0, 1.0);
    vec2 uv = p * 0.8 / max(cos(lv(kv.x, 12.0, 0.5, 1.1) * th), 0.4) + 0.5;
    vec3 col = imgLod(uv, 0.4);
    float shade = lv(kv.z, 5.0, 0.44, 0.8) + lv(kv.z, 6.0, 0.42, 0.82) * lam;
    if (k.z == 2) {
        vec3 L2 = normalize(vec3(-cos(a), -sin(a), lv(kv.z, 4.0, 0.4, 1.0)));
        float lam2 = clamp(dot(n, L2), 0.0, 1.0);
        col *= vec3(lv(kv.z, 7.0, 0.3, 0.7) + lv(kv.z, 8.0, 0.45, 0.95) * lam) * vec3(1.05, 0.98, 0.9) + lam2 * vec3(0.0, 0.1, 0.22) * lv(kv.z, 9.0, 0.7, 1.5);
    } else col *= shade;
    col *= 1.0 - lv(kv.x, 9.0, 0.25, 0.55) * sin(th) * exp(-cr / (lv(kv.x, 10.0, 0.015, 0.045) + lv(kv.x, 11.0, 0.05, 0.15) * sf));
    return col;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(6, 4, 3, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float dp = 0.5 + 0.6 * clamp(depthP, 0.0, 1.0);
    float sf = clamp(softP, 0.0, 1.0);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * foldLook(gLabK[i], gLabV[i], p, t, dp, sf, sw);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0) * 1.1);
}
