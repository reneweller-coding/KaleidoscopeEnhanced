//@doc
 * @brief SPHERICAL HARMONIC BLOOM: a sphere whose radius swells with a spherical harmonic Y_lm -- lobes and
 * petals in rings and segments, like a blooming flower or a mode of a vibrating drop -- seen close up so it fills
 * the frame, turning slowly, its petals breathing in and out.  Each lobe wears the photo; the nodal lines between
 * them are dark grooves.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony moves to another mode (l, m), the old petals melting into the new
 *   audioSwell      -> the petals' depth
 *   audioPhase      -> the bloom turns (integrated)
 *   audioKick       -> the petal tips flash (light)
 *
 * Knobs: degreeP (the base degree l), depthP (the base petal depth), photoP (photo share), hueP.
//@params degreeP depthP photoP
//@audio audioSwell audioKick audioHarmAdvance
//@body
/**  A real spherical-harmonic-like pattern of degree l and order m: the associated Legendre function's shape
 * (sin^m theta times a Legendre-like polynomial in cos theta) times cos(m phi).
 *
 * @param d  The direction (unit). (in)
 * @param l  The degree. (in)
 * @param m  The order, 0..l. (in)
 *
 * @return
 *   The harmonic's value, about -1..1.
 **/
float harmonic(vec3 d, float l, float m)
{
    float ct = d.y, st = sqrt(max(1.0 - ct * ct, 0.0));
    float ph = atan(d.z, d.x);
    // the latitude part: sin^m and l - m zeros along the meridian (a Chebyshev-like stand-in for P_l^m)
    float lat = pow(st, m) * cos((l - m) * acos(clamp(ct, -1.0, 1.0)));
    return lat * cos(m * ph);
}
/**  The bloom's signed distance (approximate): a unit sphere swollen by the harmonic.
 *
 * @param q    The point. (in)
 * @param l    The degree. (in)
 * @param m    The order. (in)
 * @param amp  The petals' depth. (in)
 *
 * @return
 *   The distance estimate.
 **/
float bloomSdf(vec3 q, float l, float m, float amp)
{
    float r = length(q);
    return (r - 1.0 - amp * harmonic(q / max(r, 1e-4), l, m)) * 0.5;
}

void main()
{
    vec2 p = screenP();
    float h = max(audioHarmAdvance, 0.0);
    float l0 = 3.0 + floor(clamp(degreeP, 0.0, 0.999) * 3.0);
    float s0 = floor(h), g = smoothstep(0.2, 0.8, fract(h));
    float lA = l0 + mod(s0, 3.0), mA = mod(s0 * 2.0, lA + 1.0);
    float lB = l0 + mod(s0 + 1.0, 3.0), mB = mod((s0 + 1.0) * 2.0, lB + 1.0);
    float amp = (0.15 + 0.25 * clamp(depthP, 0.0, 1.0)) * (0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0))
                * (0.85 + 0.15 * sin(1.3 * sceneTime));
    float spin = 0.06 * audioPhase + 0.05 * sceneTime;
    mat2 r1 = rot2(spin), r2 = rot2(0.4 * sin(0.07 * sceneTime));
    vec3 ro = vec3(0.0, 0.0, 2.15), rd = normalize(vec3(p, -1.2));
    float t = 0.0, dist = 1.0;
    vec3 q = ro;
    for (int i = 0; i < 70; ++i) {
        q = ro + rd * t;
        vec3 qr = q;
        qr.xz = r1 * qr.xz;
        qr.yz = r2 * qr.yz;
        dist = mix(bloomSdf(qr, lA, mA, amp), bloomSdf(qr, lB, mB, amp), g);
        if (dist < 0.001 || t > 5.0) break;
        t += dist;
    }
    vec3 col;
    if (dist < 0.01) {
        vec3 qr = q;
        qr.xz = r1 * qr.xz;
        qr.yz = r2 * qr.yz;
        vec3 d = normalize(qr);
        float hv = mix(harmonic(d, lA, mA), harmonic(d, lB, mB), g);
        // the normal by finite differences of the field
        vec2 e = vec2(0.003, 0.0);
        vec3 nrm = normalize(vec3(
            mix(bloomSdf(qr + e.xyy, lA, mA, amp), bloomSdf(qr + e.xyy, lB, mB, amp), g) - mix(bloomSdf(qr - e.xyy, lA, mA, amp), bloomSdf(qr - e.xyy, lB, mB, amp), g),
            mix(bloomSdf(qr + e.yxy, lA, mA, amp), bloomSdf(qr + e.yxy, lB, mB, amp), g) - mix(bloomSdf(qr - e.yxy, lA, mA, amp), bloomSdf(qr - e.yxy, lB, mB, amp), g),
            mix(bloomSdf(qr + e.yyx, lA, mA, amp), bloomSdf(qr + e.yyx, lB, mB, amp), g) - mix(bloomSdf(qr - e.yyx, lA, mA, amp), bloomSdf(qr - e.yyx, lB, mB, amp), g)));
        vec2 uv = vec2(atan(d.z, d.x) / 3.14159265, d.y) * 0.5 + 0.5;
        vec3 photo = imgLod(uv, 0.5);
        vec3 tone = imgPalette(0.5 + 0.4 * hv + 0.03 * audioPhase);
        float light = 0.35 + 0.65 * max(dot(nrm, normalize(vec3(0.4, 0.6, 0.8))), 0.0);
        float groove = smoothstep(0.0, 0.12, abs(hv));
        col = mix(tone * 1.2, photo * 1.3, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * light * (0.35 + 0.65 * groove);
        col += mix(tone, vec3(1.0), 0.5) * smoothstep(0.7, 1.0, abs(hv)) * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    } else {
        col = imgLod(p * 0.7 + 0.5, 2.0) * 0.15;
    }
    finish(col);
}
