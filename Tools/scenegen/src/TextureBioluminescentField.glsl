//@doc
 * @brief TEXTURE BIOLUMINESCENT FIELD: a dark shore at night teeming with
 * glowing plankton -- countless tiny cyan-blue sparks lie over the dark
 * photograph, and waves of excitation sweep through them in expanding
 * rings, as if something were stirring the water: each ring lights the
 * sparks it passes, which glow and slowly fade; the photo's bright
 * structures are densely populated, glowing filaments trace its edges.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the field drifts (integrated, jump-free)
 *   audioKick       -> a new ring of excitation, stronger (light)
 *   audioSpread     -> how far the rings spread
 *   audioHigh       -> the sparks glitter (light)
 *   audioMode       -> colour: cyan-blue in minor, green-gold in major
 *   audioSwell      -> the filaments along the photo glow (slow)
 *
 * Knobs: sparkP (spark density), ringP (ring rate), filamentP, hueP.
//@params sparkP ringP filamentP
//@audio audioKick audioSpread audioHigh audioMode audioSwell
//@body
// Excitation at world point w: a sum of expanding rings, each born in its
// own cell and fading as it grows (continuous generations).
float excite(vec2 w, float T, float reach)
{
    float e = 0.0;
    vec2 gi = floor(w * 1.2);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 c = gi + vec2(i, j);
        float h = hash21(c);
        float cyc = T * (0.5 + 0.5 * h) + h * 7.0;
        float age = fract(cyc);
        float gen = floor(cyc);
        vec2 ctr = (c + 0.2 + 0.6 * hash22(c + gen * 0.37)) / 1.2;
        float R = age * reach;
        float d = abs(length(w - ctr) - R);
        e += exp(-d * d / 0.004) * smoothstep(0.0, 0.1, age) * (1.0 - age) * (1.0 - age);
        // The afterglow inside the ring.
        e += 0.15 * smoothstep(R, R - 0.3, length(w - ctr)) * (1.0 - age) * smoothstep(0.0, 0.1, age) * step(length(w - ctr), R);
    }
    return e;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 drift = vec2(0.012, 0.006) * sceneTime + 0.08 * vec2(audioAdvance, 0.0);
    vec2 w = p + drift;
    vec2 uv = w * 0.7 + 0.5;
    vec3 pc = mix(vec3(0.15, 0.7, 1.0), vec3(0.5, 1.0, 0.45), mode);
    pc = mix(pc, glowColour(imgLod(uv, 5.0), w, hueP * 0.159), 0.2);
    float T = (0.08 + 0.12 * clamp(ringP, 0.0, 1.0)) * sceneTime;
    float reach = 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float e = excite(w, T, reach) * (0.7 + 1.0 * kick);
    // The dark photo beneath.
    vec3 col = imgLod(uv, 1.5) * 0.06 + vec3(0.0, 0.01, 0.02);
    // Filaments along the photo's edges, lit by the excitation.
    float ed = texEdge(uv, 3.0);
    col += pc * smoothstep(0.1, 0.5, ed) * (0.04 + 0.25 * swell + 0.4 * e) * clamp(filamentP + 0.2, 0.0, 1.2);
    // Sparks: round jittered points, densest where the photo is bright.
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = w * (40.0 + 25.0 * fl) + fl * 17.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            vec2 c = id + 0.2 + 0.6 * hash22(id + fl * 5.0) + 0.1 * vec2(sin(sceneTime * 0.5 + hash21(id) * 6.28), cos(sceneTime * 0.4 + hash21(id + 2.0) * 6.28));
            vec2 cw = c / (40.0 + 25.0 * fl);
            float b = luma(imgLod((cw - fl * 17.0 / (40.0 + 25.0 * fl)) * 0.7 + 0.5, 3.0));
            float dens = (0.25 + 0.6 * clamp(sparkP, 0.0, 1.0)) * (0.4 + 1.2 * b);
            if (hash21(id + 9.0 + fl) > dens) continue;
            float d = length(g - c);
            float tw = 0.6 + 0.4 * sin(sceneTime * (2.0 + 3.0 * hash21(id + 4.0)) + hash21(id) * 6.28);
            float I = (0.05 + 1.6 * e) * (0.7 + 0.6 * hi * tw);
            col += pc * (smoothstep(0.22, 0.05, d) * 1.1 + exp(-d * 4.0) * 0.12) * I / (1.0 + fl * 0.6);
        }
    }
    finish(col);
}
