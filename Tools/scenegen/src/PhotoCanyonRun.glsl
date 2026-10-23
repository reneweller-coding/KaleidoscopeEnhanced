//@doc
 * @brief PHOTO CANYON RUN: a flight low over the photo as a mountain land (brightness is height): canyons cut where the photo is dark, crests rise where it is bright, and the photo's own colours lie on the ground; the sky is the photo's soft
 * blur, so the picture is always the whole land.  The ground is the photo mirrored without end, so the flight never runs out.  The flight follows the drive of the music, the height of the land the swell, the sun circles with the phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated)
 *   audioSwell      -> the height of the land
 *   audioPhase      -> the sun circles (integrated)
 *
 * Knobs: heightP (the base height of the land), hueP.
//@params heightP
//@audio audioSwell
//@body
/**  The height of the land at a place: the photo's brightness, softened.
 *
 * @param xz   The place on the ground. (in)
 * @param amp  The height scale. (in)
 *
 * @return
 *   The height.
 **/
float landH(vec2 xz, float amp) { return amp * luma(imgLod(xz * 0.35 + 0.5, 1.8)); }
void main()
{
    vec2 p = screenP();
    float amp = (0.2 + 0.35 * clamp(heightP, 0.0, 1.0)) * (0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    float adv = 0.02 * audioAdvance + 0.03 * sceneTime;
    vec3 ro = vec3(0.6 * sin(0.4 * adv * 0.5), 1.2 * amp + 0.3, 1.6 * adv);
    vec3 fw = normalize(vec3(0.12 * sin(0.3 * adv), -0.42, 1.0));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 up = cross(fw, rt);
    vec3 rd = normalize(fw + p.x * 1.0 * rt + p.y * 1.0 * up);
    float t = 0.05;
    float hit = 0.0;
    vec3 pos = ro;
    for (int i = 0; i < 80; ++i) {
        pos = ro + rd * t;
        if (pos.y < landH(pos.xz, amp)) { hit = 1.0; break; }
        t += 0.03 + 0.045 * t;
        if (t > 14.0) break;
    }
    vec3 sky = imgLod(vec2(0.5 + 0.2 * p.x, 0.6 + 0.4 * p.y), 5.0) * (0.85 + 0.35 * smoothstep(-0.3, 0.5, p.y));
    vec3 col = sky;
    if (hit > 0.5) {
        vec2 e = vec2(0.03, 0.0);
        float h0 = landH(pos.xz, amp);
        float hx = landH(pos.xz + e.xy, amp), hz = landH(pos.xz + e.yx, amp);
        vec3 n = normalize(vec3(-(hx - h0) / e.x, 1.0, -(hz - h0) / e.x));
        float sa = 0.1 * audioPhase + 0.02 * sceneTime;
        vec3 L = normalize(vec3(cos(sa) * 0.8, 0.55, sin(sa) * 0.8));
        float lam = clamp(dot(n, L), 0.0, 1.0);
        vec3 c = imgLod(pos.xz * 0.35 + 0.5, 0.8);
        float fog = 1.0 - exp(-0.09 * t);
        col = mix(c * (0.3 + 1.0 * lam) * 1.15, sky, fog);
    }
    finish(col);
}
