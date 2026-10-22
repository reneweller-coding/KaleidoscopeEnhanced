//@doc
 * @brief PENNING TRAP ROSETTES: a lattice of Penning traps, each holding an ion whose orbit is a rosette -- the fast
 * cyclotron circle riding on the slow magnetron circle, x = R+ e^(i w+ t) + R- e^(i w- t) -- traced as a glowing
 * path; neighbouring rosettes grow into each other until they fill the picture.  Each pixel looks at the rosettes of
 * the four nearest traps, since they overlap.  The ion's path over a stretch of time is sampled and drawn, the ion
 * itself a bright point at its head.  The paths' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass        -> the electric field: the magnetron circle widens
 *   audioHarmAdvance -> the magnetic field's frequency ratio glides with the chord changes (the rosettes' lobes)
 *   audioAdvance     -> the ions run (integrated)
 *
 * Knobs: trapP (the traps' spacing), spanP (how much of each path shows), hueP.
//@params trapP spanP
//@audio audioBass audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float S = 0.4 + 0.2 * clamp(trapP, 0.0, 1.0);
    float ratio = 9.0 + 4.0 * sin(0.5 * h) + 1.5 * sin(0.21 * h + 1.0);   // w+ / w-
    float Rm = S * (0.32 + 0.12 * clamp(audioBass, 0.0, 1.0));
    float Rc = S * 0.16;
    float span = 6.2831853 * (0.6 + 0.8 * clamp(spanP, 0.0, 1.0));
    float run = 0.2 * sceneTime + 0.8 * audioAdvance;
    vec2 g = p / S - 0.5;
    vec2 g0 = floor(g);
    vec3 col = vec3(0.0);
    for (int k = 0; k < 4; ++k) {
        vec2 cid = g0 + vec2(float(k & 1), float(k >> 1));
        vec2 c = (cid + 1.0) * S;
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
        float best = 1e9, age = 0.0;
        float t0 = run * (0.8 + 0.4 * hc) + 6.2831853 * hc;
        vec2 prev = vec2(0.0);
        for (int i = 0; i <= 120; ++i) {
            float t = t0 - span * float(i) / 120.0;
            vec2 x = c + Rm * vec2(cos(t), sin(t)) + Rc * vec2(cos(ratio * t), sin(ratio * t));
            if (i > 0) {
                vec2 e = x - prev;
                float d = length(p - prev - e * clamp(dot(p - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0));
                if (d < best) { best = d; age = float(i) / 120.0; }
            }
            prev = x;
        }
        vec2 ion = c + Rm * vec2(cos(t0), sin(t0)) + Rc * vec2(cos(ratio * t0), sin(ratio * t0));
        float g1 = exp(-pow(best / 0.003, 2.0)) * (1.0 - 0.8 * age) + 0.15 * exp(-best / 0.012) * (1.0 - age);
        float ionG = exp(-pow(length(p - ion) / 0.012, 2.0));
        col += famLight(fh, 0.2 + 0.6 * hc, 0.3) * g1 + famLight(fh, 0.5, 0.85) * ionG;
    }
    finish(famExpose(col, 4.18, 0.70, 0.03, fh));
}
