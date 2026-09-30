//@doc
 * @brief TEXTURE FIREFLY GATHERING: a swarm of fireflies over the dark
 * photograph -- thousands of small glowing points that drift, blink and
 * gather where the photo is bright, as if drawn to its light, tracing its
 * shapes in living sparks, then disperse and gather again elsewhere as the
 * photo drifts; each firefly glows yellow-green (or in the photo's colour),
 * blinking on its own rhythm with a soft halo.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the swarm drifts (integrated, jump-free)
 *   audioSpread     -> how tightly they gather on the bright parts
 *   audioKick       -> a wave of synchronized flashes (light)
 *   audioHigh       -> the blinking brightens (light)
 *   audioSwell      -> how much of the photo shows (slow)
 *   audioMode       -> colour: green-yellow in minor, warm gold in major
 *
 * Knobs: countP (fireflies), photoP (photo visibility), colourP (photo colours vs. firefly green), hueP.
//@params countP photoP colourP
//@audio audioSpread audioKick audioHigh audioSwell audioMode
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    vec2 uv0 = p * 0.7 + 0.5 + vec2(0.006, 0.004) * sceneTime;
    vec3 col = imgLod(uv0, 2.0) * (0.03 + 0.1 * clamp(photoP, 0.0, 1.0) * (0.5 + swell));
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 ffC = mix(vec3(0.7, 1.0, 0.25), vec3(1.0, 0.8, 0.3), mode);
    float gather = 0.5 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float cs = 0.06 - 0.014 * fl;
        vec2 g = p / cs + vec2(0.2 * sceneTime + 2.0 * audioAdvance, 0.1 * sceneTime) * (1.0 + 0.3 * fl) + fl * 13.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            vec2 c = id + 0.5 + 0.35 * vec2(sin(sceneTime * 0.3 + hash21(id) * 6.28), cos(sceneTime * 0.27 + hash21(id + 1.0) * 6.28));
            vec2 cw = (c - vec2(0.2 * sceneTime + 2.0 * audioAdvance, 0.1 * sceneTime) * (1.0 + 0.3 * fl) - fl * 13.0) * cs;
            // They gather on bright parts: the chance of a firefly here follows
            // the photo's local brightness.
            vec2 cuv = cw * 0.7 + 0.5 + vec2(0.006, 0.004) * sceneTime;
            float b = luma(imgLod(cuv, 3.0));
            float bb = luma(imgLod(cuv, 7.0));
            float want = clamp((b - bb) * 5.0 * gather + b * 0.6 - 0.05, 0.0, 1.0) * (0.5 + 0.8 * clamp(countP, 0.0, 1.0)) + 0.08;
            if (hash21(id + fl * 7.0) > want) continue;
            float d = length(g - c);
            float blink = pow(max(0.0, sin(sceneTime * (1.0 + hash21(id + 3.0)) + hash21(id + 5.0) * 6.28)), 3.0);
            float wave = kick * exp(-pow((cw.x + cw.y * 0.5) * 2.0 - fract(sceneTime * 0.2) * 7.0 + 3.5, 2.0));   // wraps off-screen
            float I = (0.35 + 0.8 * want + blink * (0.8 + 0.8 * hi) + 1.5 * wave) / (1.0 + fl * 0.5);
            vec3 c3 = mix(ffC, glowColour(imgLod(cuv, 4.0), cw, hueP * 0.159), clamp(colourP, 0.0, 1.0) * 0.7);
            col += c3 * (smoothstep(0.1, 0.02, d) * 1.6 + exp(-d * 7.0) * 0.45) * I;
        }
    }
    finish(col);
}
