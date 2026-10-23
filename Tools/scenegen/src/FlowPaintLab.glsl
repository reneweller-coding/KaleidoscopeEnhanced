//@doc
 * @brief FLOW PAINT LAB: the photo smeared along the streamlines of a named flow -- cellular vortices, a vortex dipole,
 * the double gyre, a shear layer with its billows, a turning saddle, a spiral sink, a Karman street, curl noise, two
 * vortices orbiting each other, a cellular lattice -- by a line-integral convolution: every pixel gathers the photo
 * along its own streamline.  The second stage sets the smear's kernel (box, tapered, exponential, one-sided), the third
 * how the samples combine (average, lighten, darken, average with a sharper centre), the fourth how the field itself
 * moves (steady, pulsing, turning, travelling).  Silk, flags and marbling from the photo's own colours.  The walk changes
 * one stage at a time and cross-fades; a new section of the music changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells (and the flow's scale grows a little)
 *   audioPhase      -> the field's own motion (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage
 *
 * Knobs: seedP (the walk's seed), lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params seedP lengthP scaleP
//@audio audioSwell
//@body
/**  The velocity of a named flow.
 *
 * @param kind  The flow, 0..9. (in)
 * @param vi    The flow's variant 0..99: the constants of the field. (in)
 * @param p     The place (scaled by the flow's scale). (in)
 * @param t     The clock. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 flowVel(int kind, int vi, vec2 p, float t)
{
    if (kind == 0) { float k = lv(vi, 1.0, 2.0, 4.0); return vec2(sin(k * p.x + lv(vi, 2.0, 0.15, 0.45) * t) * cos(k * p.y), -cos(k * p.x + lv(vi, 2.0, 0.15, 0.45) * t) * sin(k * p.y)); }
    if (kind == 1) {
        vec2 c = lv(vi, 1.0, 0.15, 0.45) * vec2(cos(lv(vi, 2.0, 0.1, 0.3) * t), sin(lv(vi, 2.0, 0.1, 0.3) * t));
        vec2 r1 = p - c, r2 = p + c;
        float cr = lv(vi, 3.0, 0.015, 0.045);
        return vec2(-r1.y, r1.x) / (dot(r1, r1) + cr) - vec2(-r2.y, r2.x) / (dot(r2, r2) + cr);
    }
    if (kind == 2) {
        float e = lv(vi, 1.0, 0.1, 0.4);
        float a = e * sin(lv(vi, 2.0, 0.25, 0.75) * t), b = 1.0 - 2.0 * e * sin(lv(vi, 2.0, 0.25, 0.75) * t);
        float x = p.x * lv(vi, 3.0, 0.6, 1.2) + 1.0, y = p.y + 0.5;
        float f = a * x * x + b * x;
        float df = 2.0 * a * x + b;
        return vec2(-3.14159 * sin(3.14159 * f) * cos(3.14159 * y), 3.14159 * cos(3.14159 * f) * sin(3.14159 * y) * df) * lv(vi, 4.0, 0.4, 0.8);
    }
    if (kind == 3) return vec2(tanh(lv(vi, 1.0, 2.0, 8.0) * p.y), lv(vi, 2.0, 0.1, 0.9) * sin(lv(vi, 3.0, 2.0, 8.0) * p.x + lv(vi, 4.0, 0.3, 0.9) * t) * exp(lv(vi, 5.0, -11.0, -1.0) * p.y * p.y));
    if (kind == 4) { float th = lv(vi, 2.0, 0.05, 0.25) * t; return lv(vi, 1.0, 1.0, 2.0) * vec2(cos(2.0 * th) * p.x + sin(2.0 * th) * p.y, sin(2.0 * th) * p.x - cos(2.0 * th) * p.y); }
    if (kind == 5) return lv(vi, 1.0, 0.3, 0.9) * p + vec2(-p.y, p.x) / (length(p) + lv(vi, 2.0, 0.15, 0.35)) * lv(vi, 3.0, 1.0, 2.2) * (0.6 + 0.4 * sin(lv(vi, 4.0, 0.1, 0.3) * t));
    if (kind == 6) {
        vec2 v = vec2(lv(vi, 1.0, 0.3, 0.9), 0.0);
        float d = lv(vi, 2.0, 0.55, 0.95);
        float yr = lv(vi, 3.0, 0.1, 0.3);
        float cr = lv(vi, 4.0, 0.02, 0.06);
        float gm = lv(vi, 5.0, 0.15, 0.35);
        for (int i = -1; i <= 1; ++i) {
            float x0 = (float(i) + fract(lv(vi, 6.0, 0.05, 0.15) * t)) * d - 0.1;
            vec2 r1 = p - vec2(x0, yr), r2 = p - vec2(x0 + 0.5 * d, -yr);
            v += vec2(-r1.y, r1.x) / (dot(r1, r1) + cr) * gm - vec2(-r2.y, r2.x) / (dot(r2, r2) + cr) * gm;
        }
        return v;
    }
    if (kind == 7) {
        float e = 0.02;
        float f2 = lv(vi, 3.0, 1.6, 2.6);
        float a2 = lv(vi, 4.0, 0.3, 0.7);
        vec2 q = p * lv(vi, 1.0, 1.0, 2.2) + vec2(0.0, lv(vi, 2.0, 0.05, 0.15) * t);
        float n0 = noise2(q + vec2(e, 0.0)) + a2 * noise2(f2 * q + vec2(e, 0.0));
        float n1 = noise2(q - vec2(e, 0.0)) + a2 * noise2(f2 * q - vec2(e, 0.0));
        float n2 = noise2(q + vec2(0.0, e)) + a2 * noise2(f2 * q + vec2(0.0, e));
        float n3 = noise2(q - vec2(0.0, e)) + a2 * noise2(f2 * q - vec2(0.0, e));
        return lv(vi, 5.0, 1.0, 2.2) * vec2(n2 - n3, -(n0 - n1)) / (2.0 * e);
    }
    if (kind == 8) {
        float a = lv(vi, 1.0, 0.1, 0.6) * t;
        vec2 c = lv(vi, 2.0, 0.05, 0.39) * vec2(cos(a), sin(a));
        vec2 r1 = p - c, r2 = p + c;
        float cr = lv(vi, 3.0, 0.005, 0.055);
        return vec2(-r1.y, r1.x) / (dot(r1, r1) + cr) + vec2(-r2.y, r2.x) / (dot(r2, r2) + cr);
    }
    float k9 = lv(vi, 2.0, 2.0, 4.0);
    return lv(vi, 1.0, 0.7, 1.7) * vec2(sin(k9 * p.y + lv(vi, 3.0, 0.2, 0.6) * t), sin(k9 * p.x - lv(vi, 4.0, 0.15, 0.45) * t));
}

/**  One look of the lab: the photo gathered along a flow's streamlines.
 *
 * @param k    The classes: x the flow, y the kernel, z the way the samples combine, w the field's motion. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param len  The smear's length. (in)
 * @param sc   The flow's scale. (in)
 *
 * @return
 *   The colour.
 **/
vec3 flowLook(ivec4 k, ivec4 kv, vec2 p, float t, float len, float sc)
{
    vec2 q = p * sc;
    float tt = t;
    if (k.w == 1) tt = t + lv(kv.w, 1.0, 1.5, 4.5) * sin(lv(kv.w, 2.0, 0.2, 0.5) * t);
    else if (k.w == 2) q = rot2(lv(kv.w, 5.0, 0.06, 0.18) * t) * q;
    else if (k.w == 3) q += lv(kv.w, 6.0, 0.15, 0.45) * vec2(cos(lv(kv.w, 7.0, 0.05, 0.15) * t), sin(lv(kv.w, 8.0, 0.07, 0.19) * t));
    float amp = k.w == 1 ? 0.7 + lv(kv.w, 3.0, 0.3, 0.7) * sin(lv(kv.w, 4.0, 0.2, 0.6) * t) : 1.0;
    float h = len * lv(kv.y, 4.0, 0.6, 1.4) / 7.0;
    float lo = lv(kv.y, 3.0, 0.25, 0.65);
    vec3 sum = imgLod(p * 0.8 + 0.5, 0.3);
    float wsum = 1.0;
    vec3 mx = sum, mn = sum;
    vec3 centre = sum;
    for (int sgn = 0; sgn < 2; ++sgn) {
        vec2 x = q;
        for (int i = 1; i <= 7; ++i) {
            vec2 v = flowVel(k.x, kv.x, x, tt) * amp;
            float jit = 1.0 + 0.7 * (hash21(gl_FragCoord.xy + vec2(17.0 * float(i), 71.0 * float(sgn))) - 0.5);   // dithered steps: no comb pattern
            x += (sgn == 0 ? 1.0 : -1.0) * normalize(v + 1e-4) * h * jit * sc * (lo + (1.0 - lo) * min(length(v), 1.5));
            float fi = float(i) / 7.0;
            float w = k.y == 0 ? 1.0 : (k.y == 1 ? 1.0 - lv(kv.y, 1.0, 0.6, 1.1) * fi : (k.y == 2 ? exp(lv(kv.y, 2.0, -3.4, -1.0) * fi) : (sgn == 0 ? 1.0 : 0.0)));
            vec3 c = imgLod(x / sc * 0.8 + 0.5, lv(kv.y, 5.0, 0.2, 0.8) + lv(kv.y, 6.0, 0.6, 1.8) * fi);
            sum += w * c;
            wsum += w;
            mx = max(mx, c);
            mn = min(mn, c);
        }
    }
    vec3 avg = sum / wsum;
    if (k.z == 1) return mix(avg, mx, lv(kv.z, 1.0, 0.4, 0.9));
    if (k.z == 2) return mix(avg, mn, lv(kv.z, 2.0, 0.4, 0.8)) * lv(kv.z, 3.0, 0.95, 1.35);
    if (k.z == 3) return avg + lv(kv.z, 4.0, 0.4, 1.0) * (centre - avg);
    return avg;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(10, 4, 4, 4), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.12 + 0.3 * clamp(lengthP, 0.0, 1.0)) * (0.55 + 0.9 * sw);
    float sc = 1.3 + 1.7 * clamp(scaleP, 0.0, 1.0) + 0.25 * sw;
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * flowLook(gLabK[i], gLabV[i], p, t, len, sc);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
