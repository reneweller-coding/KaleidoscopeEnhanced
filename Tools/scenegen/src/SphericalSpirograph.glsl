//@doc
 * @brief SPHERICAL SPIROGRAPH: spirographs drawn on a sphere round the eye -- spherical trochoids, the path of a point
 * on a circle rolling round another circle on the sphere's surface -- as threads of light looping all round the
 * viewer.  A point is turned about a tilted axis by one angle and about the polar axis by k times that angle; the
 * curve closes after whole turns.  The eye sits at the sphere's centre, so every thread surrounds it; each is
 * sampled in 160 segments and projected from the centre.  The threads' light is shades of one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the ratio of the two turns glides with the chord changes (the light of two ratios
 *                       cross-faded)
 *   audioAdvance     -> the view turns inside the sphere (integrated)
 *   audioSwell       -> the threads' glow
 *
 * Knobs: tiltP (how far the rolling circle is tilted), threadP (how many threads), hueP.
//@params tiltP threadP
//@audio audioHarmAdvance audioSwell
//@body
/**  The distance on screen to one spherical trochoid.
 *
 * @param p      The screen point. (in)
 * @param k      The turn ratio. (in)
 * @param tilt   The rolling circle's tilt. (in)
 * @param seed   The thread's own orientation. (in)
 * @param fw     The view direction. (in)
 * @param rt     The screen's right. (in)
 * @param up     The screen's up. (in)
 *
 * @return
 *   The distance.
 **/
float trochoid(vec2 p, float k, float tilt, float seed, vec3 fw, vec3 rt, vec3 up)
{
    float best = 1e9;
    vec2 prev = vec2(0.0);
    bool have = false;
    for (int i = 0; i <= 160; ++i) {
        float t = 6.2831853 * float(i) / 160.0;
        vec3 x = vec3(cos(t), 0.0, sin(t));
        x.xy = rot2(tilt) * x.xy;
        x.xz = rot2(k * t + seed) * x.xz;
        x.yz = rot2(1.3 * seed) * x.yz;
        float z = dot(x, fw);
        if (z < 0.15) { have = false; continue; }
        vec2 s = vec2(dot(x, rt), dot(x, up)) / z * 0.55;
        if (have) {
            vec2 e = s - prev;
            if (dot(e, e) < 0.1) best = min(best, length(p - prev - e * clamp(dot(p - prev, e) / dot(e, e), 0.0, 1.0)));
        }
        prev = s;
        have = true;
    }
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float tilt = 0.5 + 0.7 * clamp(tiltP, 0.0, 1.0);
    float threads = 3.0 + 3.0 * clamp(threadP, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec3 fw = normalize(vec3(sin(turn), 0.3 * sin(0.7 * turn), cos(turn)));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 col = vec3(0.0);
    for (int j = 0; j < 6; ++j) {
        float fj = float(j);
        float on = clamp(threads - fj, 0.0, 1.0);
        if (on <= 0.0) break;
        float kA = 5.0 + mod(hk + fj, 6.0), kB = 5.0 + mod(hk + 1.0 + fj, 6.0);
        float dA = trochoid(p, kA, tilt, 1.9 * fj, fw, rt, up);
        float dB = hm > 0.002 ? trochoid(p, kB, tilt, 1.9 * fj, fw, rt, up) : 1e9;
        float g = (1.0 - hm) * (exp(-pow(dA / 0.003, 2.0)) + 0.2 * exp(-dA / 0.012))
                + hm * (exp(-pow(dB / 0.003, 2.0)) + 0.2 * exp(-dB / 0.012));
        col += famLight(fh, fj / 5.0, 0.3) * g * on;
    }
    col *= 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    finish(famExpose(col, 3.43, 1.00, 0.00, fh));
}
