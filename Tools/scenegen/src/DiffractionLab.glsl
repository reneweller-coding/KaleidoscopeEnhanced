//@doc
 * @brief DIFFRACTION LAB: the photo seen through a catalogue of gratings -- a sine grating, a hexagonal lattice, a
 * five-fold quasicrystal, a Fresnel zone plate, a spiral phase plate, a golden-ratio chirp, a Cantor ladder of scales,
 * radial rings.  A grating throws ghost copies of the photo to either side of it (the diffraction orders), shifted by
 * the grating's local direction and strength; the copies add to the picture and the grating's own stripes lie over it,
 * so moiré arises by itself.  The second stage picks the orders (one, two, one-sided, uneven, or split a little by
 * colour), the third moves the grating (turning, breathing, travelling, shearing), the fourth combines the copies (sum,
 * lighten, multiplied stripes, the difference).  The walk changes one stage at a time and cross-fades; a new section
 * changes all four.  The photo keeps its colours; any colour fringe is a thin edge only.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the orders are thrown (the ghosts open as the music swells)
 *   audioHarmAdvance -> the grating constant drifts toward the next simple ratio (integrated)
 *   audioPhase      -> the grating's turn and travel (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage
 *
 * Knobs: seedP (the walk's seed), pitchP (the grating's fineness), reachP (how far the ghosts reach), hueP.
//@params seedP pitchP reachP
//@audio audioSwell audioHarmAdvance
//@body
/**  A grating at a place: the direction and strength of its first order and the phase of its own stripes.
 *
 * @param kind  The grating, 0..7. (in)
 * @param vi    The grating's variant 0..99: the constants of its law (tilt, curvature, the number of waves ...). (in)
 * @param p     The place (turned and scaled by the lab's motion). (in)
 * @param K     The grating constant. (in)
 * @param t     The clock. (in)
 * @param ph    The grating's phase (the stripes' position, 0..2 pi). (out)
 *
 * @return
 *   The shift of the first order.
 **/
vec2 diffGrating(int kind, int vi, vec2 p, float K, float t, out float ph)
{
    ph = 0.0;
    if (kind == 0) {
        float sl = lv(vi, 1.0, -0.25, 0.25);
        float ch = lv(vi, 2.0, -0.3, 0.3);
        ph = K * (p.x + sl * p.y + ch * dot(p, p));
        return vec2(1.0 + 2.0 * ch * p.x, sl + 2.0 * ch * p.y);
    }
    if (kind == 1 || kind == 2) {
        int n = (kind == 1 ? 3 : 5) + lk(vi, 5.0, 2);
        float a0 = lv(vi, 1.0, -0.4, 0.4);
        float sp = lv(vi, 2.0, 0.1, 0.3);
        vec2 g = vec2(0.0);
        for (int i = 0; i < 6; ++i) {
            if (i >= n) break;
            float a = a0 + 3.14159265 * float(i) / float(n);
            vec2 d = vec2(cos(a), sin(a));
            float s = K * dot(p, d) + sp * t * float(i + 1);
            ph += cos(s);
            g -= sin(s) * d;
        }
        return g * (kind == 1 ? lv(vi, 3.0, 0.5, 0.9) : lv(vi, 4.0, 0.4, 0.7));
    }
    if (kind == 3) {
        vec2 pc = p - vec2(lv(vi, 3.0, -0.3, 0.3), lv(vi, 4.0, -0.3, 0.3));
        ph = lv(vi, 1.0, 0.3, 0.7) * K * dot(pc, pc);
        return pc * lv(vi, 2.0, 1.2, 2.8);
    }
    if (kind == 4) {
        float arms = 3.0 + float(lk(vi, 1.0, 4));
        float r = max(length(p), 0.05);
        vec2 e = p / r;
        ph = arms * atan(p.y, p.x) + K * r * lv(vi, 2.0, 0.3, 0.7);
        return (vec2(-e.y, e.x) * arms / (r * 4.0 + 0.5) + e * lv(vi, 3.0, 0.5, 1.1));
    }
    if (kind == 5) {
        float gr = lv(vi, 1.0, 1.236, 2.0);
        float u = K * p.x;
        ph = u + lv(vi, 2.0, 0.2, 1.2) * sin(u / gr + 0.3 * t);
        return vec2(1.0 + lv(vi, 3.0, 0.05, 0.65) * cos(u / gr + 0.3 * t), lv(vi, 4.0, 0.05, 0.35) * sin(0.7 * u));
    }
    if (kind == 6) {
        float s = 0.0;
        float a = 1.0;
        float rt = lv(vi, 1.0, 2.4, 3.6);
        float dc = lv(vi, 2.0, 0.3, 0.7);
        for (int j = 0; j < 4; ++j) {
            float f = K * 0.5 * pow(rt, float(j));
            s += a * sin(f * p.x + 0.1 * t * float(j + 1));
            ph += a * f * p.x;
            a *= dc;
        }
        return vec2(s * 0.8, 0.15 * s);
    }
    float r = length(p);
    ph = K * r * lv(vi, 2.0, 0.8, 1.2);
    return p / max(r, 0.05) * sin(K * r * lv(vi, 1.0, 0.3, 0.7) + 0.3 * t);
}

/**  One look of the lab.
 *
 * @param k    The classes: x the grating, y the orders, z the grating's motion, w the combination. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param K    The grating constant. (in)
 * @param R    How far the orders are thrown. (in)
 *
 * @return
 *   The colour.
 **/
vec3 diffLook(ivec4 k, ivec4 kv, vec2 p, float t, float K, float R)
{
    vec2 q = p;
    if (k.z == 0) q = rot2(lv(kv.z, 1.0, 0.02, 0.08) * t) * q;
    else if (k.z == 1) q *= 1.0 + lv(kv.z, 2.0, 0.05, 0.35) * sin(0.25 * t);
    else if (k.z == 2) q += vec2(lv(kv.z, 3.0, 0.03, 0.09) * t, 0.0);
    else q.x += lv(kv.z, 4.0, 0.05, 0.55) * q.y * sin(0.2 * t);
    float ph;
    vec2 D = diffGrating(k.x, kv.x, q, K, t, ph) * R * 0.09;
    float w0 = lv(kv.y, 1.0, 0.3, 0.6);
    float w1 = lv(kv.y, 2.0, 0.12, 0.32);
    float w2 = lv(kv.y, 3.0, 0.04, 0.14);
    float wp = lv(kv.y, 4.0, 1.2, 2.0);
    float wn = lv(kv.y, 5.0, 0.3, 0.7);
    float dep = lv(kv.y, 6.0, 0.12, 0.44);
    float ca = lv(kv.y, 7.0, 0.01, 0.07);
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    vec3 mx = vec3(0.0);
    vec3 first = vec3(0.0);
    int lo = k.y == 2 ? 0 : -2;
    for (int m = -2; m <= 2; ++m) {
        if (m < lo) continue;
        if (k.y == 0 && abs(m) > 1) continue;
        float w = m == 0 ? w0 : (abs(m) == 1 ? w1 : w2);
        if (k.y == 3) w *= (m > 0 ? wp : wn);
        float vis = (1.0 - dep) + dep * cos(float(m) * ph);
        vec2 off = float(m) * D;
        vec3 c;
        if (k.y == 4) {
            c = vec3(imgLod(p * 0.8 + 0.5 + off * (1.0 - ca) * 0.8, 0.4).r, imgLod(p * 0.8 + 0.5 + off * 0.8, 0.4).g, imgLod(p * 0.8 + 0.5 + off * (1.0 + ca) * 0.8, 0.4).b);
        } else {
            c = imgLod(p * 0.8 + 0.5 + off * 0.8, 0.4);
        }
        sum += w * vis * c;
        wsum += w;
        mx = max(mx, c * vis);
        if (m == 0) first = c;
    }
    vec3 avg = sum / max(wsum, 1e-3) * 1.1;
    if (k.w == 1) return mix(avg, mx, lv(kv.w, 1.0, 0.4, 1.0));
    if (k.w == 2) return avg * (lv(kv.w, 2.0, 0.5, 0.9) + lv(kv.w, 3.0, 0.3, 0.7) * cos(ph));
    if (k.w == 3) return clamp(abs(first - avg) * lv(kv.w, 4.0, 1.4, 3.0) + lv(kv.w, 5.0, 0.2, 0.5) * first, 0.0, 1.4);
    return avg;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(8, 5, 4, 4), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float K = (9.0 + 22.0 * clamp(pitchP, 0.0, 1.0)) * (1.0 + 0.12 * sin(0.7 * audioHarmAdvance));
    float R = (0.5 + 1.1 * clamp(reachP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * diffLook(gLabK[i], gLabV[i], p, t, K, R);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
