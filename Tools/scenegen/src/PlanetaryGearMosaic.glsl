//@doc
 * @brief PLANETARY GEAR MOSAIC: a mosaic of planetary gears: a sun wheel, three planets and a ring gear, turning in the ratio their teeth fix, each wheel with the photo on it at another size; gear teeth run round the wheels' rims.  The
 * ratio follows the harmony (simple ratios, crossing over from one to the next), the whole turning with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the gear ratio changes between simple ratios (crossing over)
 *   audioPhase      -> the gears turn (integrated)
 *
 * Knobs: sizeP (the size of the units), hueP.
//@params sizeP
//@audio audioHarmAdvance
//@body
/**  The picture of one planetary gear unit for a given ratio.
 *
 * @param d     The place relative to the unit's centre. (in)
 * @param cell  The unit's cell, for variety. (in)
 * @param rat   The ratio of the sun's radius to the planets' radius. (in)
 * @param S     The size of the unit. (in)
 *
 * @return
 *   The colour (rgb) and the coverage (a).
 **/
vec4 planetUnit(vec2 d, vec2 cell, float rat, float S)
{
    float beta = 0.15 * audioPhase + 0.04 * sceneTime + 0.9 * hash21(cell) * 6.2831853;
    float rp = 0.45 * S / (rat + 2.0), rs = rat * rp;
    float rr = rs + 2.0 * rp;
    float sc = 0.42 * S / rr;
    float thS = -beta * 2.0;
    float car = beta;
    vec3 col = vec3(0.0);
    float cov = 0.0;
    float r = length(d);
    vec2 ds = rot2(-thS) * d;
    float teeth = 0.5 + 0.5 * cos(14.0 * atan(d.y, d.x) + 0.0);
    if (r > rr * 0.98 && r < rr * 1.12 + 0.01 * S) {
        float thR = car * 0.0;
        vec2 dq = rot2(-thR) * d;
        float tt = 0.5 + 0.5 * cos(30.0 * atan(dq.y, dq.x));
        float ring = smoothstep(rr * 0.98, rr * 1.0, r) * smoothstep(rr * 1.12, rr * 1.06, r);
        col = imgLod(dq / S * 0.8 + 0.5, 1.0) * (0.55 + 0.3 * tt);
        cov = ring;
    }
    if (r < rs) {
        float tt = 0.5 + 0.5 * cos(9.0 * atan(ds.y, ds.x));
        col = imgLod(ds / S * 1.5 + 0.5, 0.8) * (0.7 + 0.3 * tt);
        cov = smoothstep(rs, rs - 0.01 * S, r);
    }
    for (int k = 0; k < 3; ++k) {
        float ak = car + 2.0943951 * float(k);
        vec2 cc = (rs + rp) * vec2(cos(ak), sin(ak));
        float thp = -(rs / rp) * thS + (1.0 + rs / rp) * car;
        vec2 dp = rot2(-thp) * (d - cc);
        float rd = length(dp);
        if (rd < rp) {
            float tt = 0.5 + 0.5 * cos(7.0 * atan(dp.y, dp.x));
            col = imgLod(dp / (rp * 2.0) * 0.6 + 0.5 + 0.15 * float(k), 0.8) * (0.8 + 0.25 * tt);
            cov = smoothstep(rp, rp - 0.01 * S, rd);
        }
    }
    return vec4(col, cov);
}
void main()
{
    vec2 p = screenP();
    float S = 0.62 - 0.22 * clamp(sizeP, 0.0, 1.0);
    vec2 cell = floor(p / S + 0.5);
    vec2 d = p - cell * S;
    float rk = 1.0 + 2.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float r0 = floor(rk);
    vec4 u0 = planetUnit(d, cell, r0, S), u1 = planetUnit(d, cell, r0 + 1.0, S);
    float ff = smoothstep(0.0, 1.0, fract(rk));
    vec4 u = mix(u0, u1, ff);
    vec3 bg = vec3(0.04) + 0.1 * imgLod(p * 0.8 + 0.5, 4.0);
    finish(mix(bg, u.rgb * 1.15, u.a));
}
