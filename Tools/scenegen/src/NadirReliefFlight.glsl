//@doc
 * @brief NADIR RELIEF FLIGHT: a flight with the view straight down over the photo as a relief: the parallax of the heights (the near crests slide faster than the valleys) and long cast shadows from a low sun, without a horizon;
 * the photo's colours lie on the land, mirrored without end so that the flight never runs out.  The flight follows the drive of the music, the height of the relief the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated)
 *   audioSwell      -> the height of the relief
 *
 * Knobs: heightP (the base height of the relief), hueP.
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
float nadirH(vec2 xz, float amp) { return amp * luma(imgLod(xz * 0.4 + 0.5, 1.6)); }
void main()
{
    vec2 p = screenP();
    float amp = (0.25 + 0.4 * clamp(heightP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float adv = 0.02 * audioAdvance + 0.03 * sceneTime;
    vec3 ro = vec3(0.3 * sin(0.2 * adv), 1.2, 1.0 * adv);
    vec3 rd = normalize(vec3(p.x * 0.9, -1.0, p.y * 0.9));
    float t = 0.1;
    vec3 pos = ro;
    float hit = 0.0;
    for (int i = 0; i < 48; ++i) {
        pos = ro + rd * t;
        if (pos.y < nadirH(pos.xz, amp)) { hit = 1.0; break; }
        t += 0.04 + 0.03 * t;
        if (t > 4.0) break;
    }
    vec3 col = imgLod(p * 0.8 + 0.5, 5.0) * 0.5;
    if (hit > 0.5) {
        vec2 e = vec2(0.02, 0.0);
        float h0 = nadirH(pos.xz, amp);
        float hx = nadirH(pos.xz + e.xy, amp), hz = nadirH(pos.xz + e.yx, amp);
        vec3 n = normalize(vec3(-(hx - h0) / e.x, 1.0, -(hz - h0) / e.x));
        vec3 L = normalize(vec3(0.7, 0.45, 0.5));
        float lam = clamp(dot(n, L), 0.0, 1.0);
        float sh = 1.0;
        for (int j = 1; j < 14; ++j) {
            vec3 sp = pos + L * (0.03 * float(j) * (1.0 + 0.15 * float(j)));
            if (sp.y < nadirH(sp.xz, amp)) { sh = 0.35; break; }
        }
        vec3 c = imgLod(pos.xz * 0.4 + 0.5, 0.8);
        col = c * (0.25 + 0.95 * lam) * sh * 1.2;
    }
    finish(col);
}
