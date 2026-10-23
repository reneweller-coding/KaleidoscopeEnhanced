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
 *
 * @return
 *   The thickness, 0..1.
 **/
float microThick(vec2 uv, float lod, int mode)
{
    vec3 c = imgLod(uv, lod);
    if (mode == 1) return satOf(c);
    if (mode == 2) return 0.5 + 0.5 * cos(6.2831853 * hue_of(c));
    return luma(c);
}

/**  One look of the lab.
 *
 * @param k    The classes: x the method, y the illumination, z the focus, w the thickness. (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param rd   The scale thickness is read at (a mip level). (in)
 * @param ct   The contrast. (in)
 *
 * @return
 *   The colour.
 **/
vec3 microLook(ivec4 k, vec2 p, float t, float rd, float ct)
{
    vec2 uv = p * 0.8 + 0.5;
    float lodF = k.z == 0 ? 0.3 : (k.z == 1 ? 1.8 : 0.3 + 3.0 * (0.5 + 0.5 * sin(3.0 * p.x + 2.0 * p.y + 0.4 * t)));
    vec3 C = imgLod(uv, lodF);
    float ang = k.y == 0 ? 0.25 * t : (k.y == 1 ? 1.0 * sin(0.3 * t) : (k.y == 2 ? 0.8 : (p.x > 0.0 ? 0.6 + 0.2 * t : 2.4 - 0.2 * t)));
    float amp = k.y == 2 ? 0.7 + 0.3 * sin(0.4 * t) : 1.0;
    vec2 dir = vec2(cos(ang), sin(ang));
    float e = 0.004 * exp2(rd);
    float tL = microThick(uv + dir * e, rd, k.w);
    float tR = microThick(uv - dir * e, rd, k.w);
    float tU = microThick(uv + vec2(-dir.y, dir.x) * e, rd, k.w);
    float tD = microThick(uv - vec2(-dir.y, dir.x) * e, rd, k.w);
    float T0 = microThick(uv, rd, k.w);
    float gDir = (tL - tR) / (2.0 * e) * e * 12.0 * amp;
    float gMag = length(vec2(tL - tR, tU - tD)) / (2.0 * e) * e * 12.0;
    float Tb = microThick(uv, rd + 2.5, k.w);
    if (k.x == 0) return C * (0.85 + 0.6 * (T0 - 0.5) * ct) * 1.1;
    if (k.x == 1) return C * (0.05 + 3.0 * ct * smoothstep(0.02, 0.45, gMag)) + 0.1 * C * smoothstep(0.0, 0.4, gMag);
    if (k.x == 2) return C * clamp(0.8 + 1.7 * ct * (T0 - Tb), 0.1, 1.5);
    if (k.x == 3) return C * clamp(0.65 + 2.6 * ct * gDir * 3.0, 0.1, 1.7);
    if (k.x == 4) {
        float ret = T0 * 3.0 + 0.1 * t;
        float s = sin(3.14159 * ret);
        return C * (0.25 + 1.3 * ct * s * s);
    }
    float edge = smoothstep(0.03, 0.4, gMag * ct);
    vec3 flatC = C * vec3(1.1, 1.0, 0.88);
    vec3 edgeC = C * vec3(0.86, 0.97, 1.16);
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
            col += gLabW[i] * microLook(gLabK[i], p, t, rd, ct);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
