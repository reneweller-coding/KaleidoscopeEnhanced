//@doc
 * @brief KRILL SWARM PULSE: krill swarms: clouds of thousands of particles that twitch and split together; the picture is a field of such clouds over the photo, each cloud with a swarm colour of its own.  Every cloud holds twenty-four little bodies on wandering orbits that breathe in and out together (the phrase's
 * pulse), and the cloud divides into two when it is wide.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the twitching: the pulse of the clouds over the phrase (periodic)
 *   audioAdvance   -> the clouds drift (integrated)
 *
 * Knobs: sizeP (the size of the clouds), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.2 + 0.14 * clamp(sizeP, 0.0, 1.0);
    vec2 drift = 0.05 * vec2(sin(0.02 * audioAdvance + 0.03 * sceneTime), cos(0.017 * audioAdvance));
    vec2 g = (p + drift) / S;
    vec2 gi = floor(g);
    vec3 bg = imgLod(p * 0.85 + 0.5, 1.5) * 0.3;
    vec3 col = bg;
    float pulse = 0.5 - 0.5 * cos(6.2831853 * audioPhrasePos);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 hc = hash22(cj);
            vec2 cen = cj + 0.5 + 0.3 * (hc - 0.5) * 2.0;
            vec3 sc = imgLod((cen * S - drift) * 0.85 + 0.5, 1.5);
            sc = mix(vec3(luma(sc)), sc, 1.5) * 1.3 + 0.1;
            float spread = 0.18 + 0.2 * pulse + 0.1 * hc.x;
            float split = smoothstep(0.35, 0.5, spread);
            for (int k = 0; k < 24; ++k) {
                float fk = float(k);
                vec2 h = hash22(cj * 7.0 + fk);
                float a = 6.2831853 * h.x + 0.3 * sceneTime * (0.3 + h.y) * (h.y > 0.5 ? 1.0 : -1.0);
                float rr = spread * sqrt(h.y);
                vec2 off = rr * vec2(cos(a), sin(a));
                off.x += (h.x > 0.5 ? 1.0 : -1.0) * split * 0.18;
                vec2 pt = cen + off;
                float d = length(g - pt);
                col += sc * exp(-d * d / 0.0011) * 0.9;
            }
        }
    finish(col);
}
