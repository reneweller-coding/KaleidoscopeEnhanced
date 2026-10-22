//@doc
 * @brief OSTRACOD LIGHT TRAINS: hundreds of tiny ostracods court in the dark sea, each laying a train of glowing dots
 * as it swims -- spirals winding outward and ladders of two rails -- dot after dot appearing and lingering in an
 * afterglow; each phrase a new wave of trains is laid, and the dots pulse softly with the beat.  A train has twenty
 * dots along its path; dot k appears when the swimmer reaches it (a share of the phrase into it) and then fades, all of
 * them gone before the phrase ends, so the next phrase starts clean.  The trains drift and turn slowly, so each wave
 * lies elsewhere.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> each phrase the swimmers lay a new wave of trains, dot after dot
 *   audioBeatPhase -> the dots pulse softly with the beat (light)
 *   audioAdvance   -> the trains drift and turn (integrated)
 *
 * Knobs: trainP (how many trains), dotP (the dots' size), hueP.
//@params trainP dotP
//@audio audioPhrasePos audioBeatPhase
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float NC = floor(16.0 + 8.0 * clamp(trainP, 0.0, 1.0));
    float ds = 0.006 + 0.004 * clamp(dotP, 0.0, 1.0);
    float pos = clamp(audioPhrasePos, 0.0, 1.0);
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float pulse = 0.8 + 0.2 * cos(6.2831853 * audioBeatPhase);
    float end = 1.0 - smoothstep(0.85, 1.0, pos);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int c = 0; c < 24; ++c) {
        float fc = float(c);
        if (fc >= NC) break;
        float h1 = fract(sin(fc * 12.9898) * 43758.5453), h2 = fract(sin(fc * 78.233) * 43758.5453);
        vec2 ctr = vec2(1.6 * (fract(fc * 0.7548777 + 0.1) - 0.5), 0.9 * (fract(fc * 0.5698403 + 0.4) - 0.5));
        ctr += 0.1 * vec2(sin(drift + 6.0 * h1), cos(0.8 * drift + 6.0 * h2));
        float ang = 6.2831853 * h2 + 0.3 * drift;
        vec2 dir = vec2(cos(ang), sin(ang)), perp = vec2(-dir.y, dir.x);
        vec2 dv = p - ctr;
        if (dot(dv, dv) > 0.09) continue;
        float delay = 0.15 * h1;
        for (int k = 0; k < 20; ++k) {
            float s = float(k) / 19.0;
            vec2 at;
            if (h1 < 0.5) {
                float th = 4.0 * 3.14159265 * s + 6.2831853 * h2;      // a spiral winding outward
                at = ctr + (0.02 + 0.14 * s) * vec2(cos(th), sin(th));
            } else {
                at = ctr + dir * (s - 0.5) * 0.4 + perp * (mod(float(k), 2.0) < 0.5 ? 0.03 : -0.03);   // a ladder
            }
            float tk = 0.05 + delay + 0.55 * s;
            float age = pos - tk;
            float b = smoothstep(0.0, 0.015, age) * exp(-max(age, 0.0) * 3.0) * end;
            float d = length(p - at);
            col += famLight(fh, 0.3 + 0.4 * h2, 0.5 * b) * b * pulse * 1.5 * (smoothstep(ds, ds * 0.5, d) + 0.3 * exp(-d / (3.0 * ds)));
        }
    }
    finish(famExpose(col, 2.30, 0.90, 0.00, fh));
}
