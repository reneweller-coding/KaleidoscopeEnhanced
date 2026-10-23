//@doc
 * @brief MICROSCOPE LAB: the photo as a specimen under a microscope, seen by changing contrast methods -- bright field,
 * dark field (only the edges shine, on black), phase contrast (halos round every change of thickness), differential
 * interference contrast (a relief lit from one side), crossed polarisers (fringes of the specimen's thickness), a
 * Rheinberg filter (warm for the flat, cool for the edges).  The specimen's brightness is its optical thickness and its
 * colour the absorption.  The second stage moves the illumination (turning, oscillating, breathing, two directions
 * side by side), the third the focus (sharp, soft, a plane of focus sweeping through), the fourth what counts as
 * thickness (brightness, saturation, hue).  The walk changes one stage at a time and cross-fades; a new section
 * changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the contrast: the stage lamp opens up as the music swells
 *   audioPhase      -> the illumination's direction and the focus plane's travel (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (a new method)
 *
 * Knobs: seedP (the walk's seed), reachP (the scale at which thickness is read), contrastP (the base contrast), hueP.
//@params seedP reachP contrastP
//@audio audioSwell
//@body
/**  The specimen's optical thickness at a place.
 *
 * @param uv    The place in the photo. (in)
 * @param lod   The mip level it is read at. (in)
 * @param mode  What counts as thickness: 0 brightness, 1 saturation, 2 hue. (in)
 * @param vi    The thickness' variant 0..99: its curve. (in)
 *
 * @return
 *   The thickness, 0..1.
 **/
float microThick(vec2 uv, float lod, int mode, int vi)
{
    vec3 c = imgLod(uv, lod);
    if (mode == 1) return pow(satOf(c), lv(vi, 1.0, 0.4, 1.6));
    if (mode == 2) return 0.5 + 0.5 * cos(6.2831853 * (hue_of(c) + lv(vi, 2.0, -0.5, 0.5)));
    return pow(luma(c), lv(vi, 3.0, 0.4, 1.6));
}

/**  One look of the lab.
 *
 * @param k    The classes: x the method, y the illumination, z the focus, w the thickness. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param rd   The scale thickness is read at (a mip level). (in)
 * @param ct   The contrast. (in)
 *
 * @return
 *   The colour.
 **/
vec3 microLook(ivec4 k, ivec4 kv, vec2 p, float t, float rd, float ct)
{
    vec2 uv = p * 0.8 + 0.5;
    float lodF = k.z == 0 ? lv(kv.z, 1.0, 0.0, 0.6) : (k.z == 1 ? lv(kv.z, 2.0, 0.4, 3.2) : lv(kv.z, 3.0, 0.0, 0.6) + lv(kv.z, 4.0, 1.0, 5.0) * (0.5 + 0.5 * sin(lv(kv.z, 5.0, 1.5, 4.5) * p.x + lv(kv.z, 6.0, 1.0, 3.0) * p.y + lv(kv.z, 7.0, 0.2, 0.6) * t)));
    vec3 C = imgLod(uv, lodF);
    float ang = k.y == 0 ? lv(kv.y, 1.0, 0.1, 0.4) * t : (k.y == 1 ? lv(kv.y, 2.0, 0.5, 1.5) * sin(lv(kv.y, 3.0, 0.15, 0.45) * t) : (k.y == 2 ? lv(kv.y, 4.0, 0.0, 1.6) : (p.x > 0.0 ? lv(kv.y, 7.0, 0.2, 1.0) + lv(kv.y, 9.0, 0.1, 0.3) * t : lv(kv.y, 8.0, 1.6, 3.2) - lv(kv.y, 9.0, 0.1, 0.3) * t)));
    float amp = k.y == 2 ? lv(kv.y, 5.0, 0.5, 0.9) + lv(kv.y, 6.0, 0.1, 0.5) * sin(0.4 * t) : 1.0;
    vec2 dir = vec2(cos(ang), sin(ang));
    float e = lv(kv.x, 1.0, 0.002, 0.006) * exp2(rd);
    float tL = microThick(uv + dir * e, rd, k.w, kv.w);
    float tR = microThick(uv - dir * e, rd, k.w, kv.w);
    float tU = microThick(uv + vec2(-dir.y, dir.x) * e, rd, k.w, kv.w);
    float tD = microThick(uv - vec2(-dir.y, dir.x) * e, rd, k.w, kv.w);
    float T0 = microThick(uv, rd, k.w, kv.w);
    float gDir = (tL - tR) / (2.0 * e) * e * 12.0 * amp;
    float gMag = length(vec2(tL - tR, tU - tD)) / (2.0 * e) * e * 12.0;
    float Tb = microThick(uv, rd + lv(kv.x, 12.0, 1.5, 3.5), k.w, kv.w);
    if (k.x == 0) return C * (lv(kv.x, 2.0, 0.7, 1.0) + lv(kv.x, 3.0, 0.3, 0.9) * (T0 - 0.5) * ct) * lv(kv.x, 4.0, 0.95, 1.25);
    if (k.x == 1) return C * (lv(kv.x, 5.0, 0.0, 0.1) + lv(kv.x, 6.0, 1.8, 4.2) * ct * smoothstep(lv(kv.x, 7.0, 0.0, 0.04), lv(kv.x, 8.0, 0.3, 0.6), gMag)) + lv(kv.x, 9.0, 0.0, 0.2) * C * smoothstep(0.0, 0.4, gMag);
    if (k.x == 2) return C * clamp(lv(kv.x, 10.0, 0.6, 1.0) + lv(kv.x, 11.0, 1.0, 2.4) * ct * (T0 - Tb), 0.1, 1.5);
    if (k.x == 3) return C * clamp(lv(kv.x, 13.0, 0.5, 0.8) + lv(kv.x, 14.0, 1.4, 3.8) * ct * gDir * 3.0, 0.1, 1.7);
    if (k.x == 4) {
        float ret = T0 * lv(kv.x, 15.0, 2.0, 4.0) + lv(kv.x, 16.0, 0.05, 0.15) * t;
        float s = sin(3.14159 * ret);
        return C * (lv(kv.x, 17.0, 0.1, 0.4) + lv(kv.x, 18.0, 0.8, 1.8) * ct * s * s);
    }
    float edge = smoothstep(lv(kv.x, 5.0, 0.005, 0.055), lv(kv.x, 6.0, 0.15, 0.65), gMag * ct);
    float tn = lv(kv.x, 7.0, 0.2, 1.8);
    vec3 flatC = C * (1.0 + tn * vec3(0.1, 0.0, -0.12));
    vec3 edgeC = C * (1.0 + tn * vec3(-0.14, -0.03, 0.16));
    return mix(flatC, edgeC, edge) * 1.05;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(6, 4, 3, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float rd = 0.8 + 1.8 * clamp(reachP, 0.0, 1.0);
    float ct = (0.6 + 0.7 * clamp(contrastP, 0.0, 1.0)) * (0.7 + 0.6 * sw);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * microLook(gLabK[i], gLabV[i], p, t, rd, ct);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
