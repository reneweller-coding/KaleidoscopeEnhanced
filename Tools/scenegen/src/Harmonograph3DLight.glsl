//@doc
 * @brief HARMONOGRAPH 3D LIGHT: a room full of harmonograph threads: five sets of pendulums with slightly different
 * frequencies each draw a glowing thread -- x and y the sums of two damped sines, the depth a third -- woven into
 * each other and filling the room, fading as the swing dies down and starting afresh.  Each thread is the curve
 * over its last stretch of time, sampled and projected in perspective; its far end (the oldest part) fades.  The
 * threads' colours are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the pendulums' frequency ratios lean toward the current interval (gliding)
 *   audioPhrasePos   -> the damping: each phrase the swing dies down and is struck again (smooth)
 *   audioAdvance     -> the room turns slowly (integrated)
 *
 * Knobs: threadP (how many threads), spanP (how much of each curve shows), hueP.
//@params threadP spanP
//@audio audioHarmAdvance audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float threads = 2.0 + 3.0 * clamp(threadP, 0.0, 1.0);
    float span = 6.0 + 8.0 * clamp(spanP, 0.0, 1.0);
    float damp = 0.04 + 0.16 * (0.5 - 0.5 * cos(6.2831853 * audioPhrasePos));
    float turn = 0.03 * sceneTime + 0.12 * audioAdvance;
    float T = 0.5 * sceneTime;
    float lean = 0.03 * sin(0.7 * h);
    vec3 col = vec3(0.0);
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        float on = clamp(threads - fk, 0.0, 1.0);
        if (on <= 0.0) break;
        vec3 f = vec3(2.0 + 0.01 * fk + lean, 3.0 - 0.012 * fk, 2.0 + 0.007 * fk - lean) * (1.0 + 0.15 * fk);
        vec3 ph = vec3(0.3 * fk, 1.1 + 0.5 * fk, 2.0 + 0.2 * fk);
        float best = 1e9, bestAge = 0.0;
        vec2 prev = vec2(0.0);
        for (int i = 0; i <= 140; ++i) {
            float age = float(i) / 140.0;
            float t = T - span * age;
            float e = exp(-damp * span * age);
            vec3 x = 0.6 * e * vec3(sin(f.x * t + ph.x) + 0.4 * sin(1.5 * f.x * t), sin(f.y * t + ph.y), sin(f.z * t + ph.z));
            x.xz = rot2(turn + fk) * x.xz;
            vec2 s = x.xy / (1.2 + 0.6 * x.z);
            if (i > 0) {
                vec2 e2 = s - prev;
                float tt = clamp(dot(p - prev, e2) / max(dot(e2, e2), 1e-8), 0.0, 1.0);
                float d = length(p - prev - e2 * tt);
                if (d < best) { best = d; bestAge = age; }
            }
            prev = s;
        }
        float g = exp(-pow(best / 0.003, 2.0)) + 0.2 * exp(-best / 0.012);
        col += famLight(fh, fk / 4.0, 0.3) * g * (1.0 - bestAge) * on;
    }
    finish(famExpose(col, 2.20, 0.90, 0.00, fh));
}
