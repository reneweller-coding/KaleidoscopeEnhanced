//@doc
 * @brief TEXTURE SUMINAGASHI DROPS: the Japanese art of floating ink --
 * drop after drop of ink and of clear water is laid on the surface, each
 * new drop spreading out and pushing all the older rings outward, so
 * nested, ever-deformed rings of colour grow across the water (computed
 * with the exact marbling transform); a gentle breath of air stirs the
 * rings into slow swirls.  The ink colours and the paper come from the
 * photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drops fall (integrated, jump-free)
 *   audioSpread     -> drop size
 *   audioHarmChange -> the stirring swirls (slow, smoothed)
 *   audioMode       -> inks: indigo-black in minor, the photo's colours in major
 *   audioKick       -> the wet sheen on the water (light)
 *   audioSwell      -> the paper shows through (slow)
 *
 * Knobs: dropRateP, swirlP, colourP (photo colours in the ink), hueP.
//@params dropRateP swirlP colourP
//@audio audioSpread audioHarmChange audioMode audioKick audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    // The breath of air: a slow swirl (undone first, it acts last).
    float sw = (0.4 + 1.2 * clamp(swirlP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioHarmChange, 0.0, 1.0));
    vec2 q = p;
    for (int i = 0; i < 2; ++i) {
        float fi = float(i);
        vec2 c = 0.4 * vec2(sin(0.013 * sceneTime + fi * 2.0), cos(0.011 * sceneTime + fi * 3.0));
        vec2 d = q - c;
        float ang = sw * 0.6 * sin(0.05 * sceneTime + fi * 1.7) * exp(-dot(d, d) * 3.0);
        q = c + rot2(-ang) * d;
    }
    // Drops: one every period; the last N are applied newest first.
    float rate = 0.35 + 0.5 * clamp(dropRateP, 0.0, 1.0);
    float t = 0.5 * sceneTime * rate + 1.2 * audioAdvance * rate;
    float M = floor(t);
    float ft = fract(t);
    const int N = 45;
    float Rbase = (0.1 + 0.07 * clamp(audioSpread, 0.0, 1.0));
    vec2 uvP = p * 0.6 + 0.5;
    vec3 paper = mix(vec3(0.92, 0.9, 0.84), imgLod(uvP, 3.0) * 0.6 + 0.35, 0.35 + 0.3 * swell);
    vec3 col = paper;
    for (int k = 0; k < N; ++k) {
        float m = M - float(k);
        float age = float(k) + ft;                               // in drop periods
        // Drops land in turn at slowly wandering spots, so each spot
        // grows its own set of concentric rings (one per quadrant and one in the middle).
        float spot = mod(m, 5.0);
        float slow = 0.004 * sceneTime + m * 0.01;
        vec2 c = (spot > 3.5 ? vec2(0.0) : vec2((mod(spot, 2.0) - 0.5) * 1.2, (floor(spot / 2.0) - 0.5) * 0.7)) + 0.2 * vec2(sin(spot * 2.1 + slow * (1.0 + spot * 0.3)), cos(spot * 1.7 + slow * 1.3));
        c += 0.03 * (hash22(vec2(m, 1.0)) - 0.5);
        float Rf = Rbase * (0.7 + 0.6 * hash11(m * 0.91));
        float R = Rf * sqrt(smoothstep(0.0, 1.0, age));          // the drop spreads out after landing
        vec2 d = q - c;
        float dd = dot(d, d);
        if (dd < R * R) {
            // Inside this drop: its ink (even) or clear water (odd).
            bool ink = mod(floor(m / 5.0), 2.0) < 0.5;
            if (ink) {
                float mi = floor(m / 10.0);
                vec3 pc = imgLod(vec2(hash11(mi * 0.37 + spot), hash11(mi * 0.53 + 2.0 + spot)), 4.0);
                vec3 ic = mix(vec3(0.08, 0.1, 0.2), glowColour(pc, vec2(m * 0.1, 0.0), hueP * 0.159) * 0.6, clamp(colourP, 0.0, 1.0) * (0.3 + 0.7 * mode));
                ic = mix(ic, ic * 0.6, hash11(m * 1.7));
                float fade = smoothstep(float(N) - 1.0, float(N) - 5.0, age);   // oldest inks fade to paper before they leave
                col = mix(paper, ic, fade);
            } else {
                col = paper;
            }
            // Soft ink edge inside the ring.
            col = mix(col, col * 0.85, smoothstep(R * R * 0.8, R * R, dd) * 0.5);
            break;
        }
        // Undo this drop's push: the point came from further in.
        q = c + d * sqrt(max(1.0 - R * R / max(dd, 1e-8), 0.0));
    }
    // Wet sheen on the water.
    float sheen = pow(max(0.0, fbm3(p * 1.3 + vec2(0.02 * sceneTime, 0.0))), 3.0);
    col += vec3(1.0) * sheen * (0.04 + 0.2 * kick);
    finish(col);
}
