//@doc
 * @brief OIL DROPS ON WATER: the classic macro photograph -- a dish of water
 * with drops of oil floating on it, held above a colourful background, so
 * every oil drop is a lens that shows the background magnified and
 * bent, ringed by a dark refraction edge and a bright rim; small drops
 * cluster around big ones, drops drift together and merge.  The
 * background is the photograph, soft and colourful, and moves slowly
 * beneath.  An endless field, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drops drift (integrated, jump-free)
 *   audioSpread     -> magnification of the lenses
 *   audioSwell      -> drop size (slow)
 *   audioRoughness  -> the water surface trembles (ripples in the view)
 *   audioHigh       -> the rims sparkle (light)
 *   audioMode       -> the background warms in major
 *
 * Knobs: dropsP (how many), sizeP (drop size), blurP (background blur), hueP.
//@params dropsP sizeP blurP
//@audio audioSpread audioSwell audioRoughness audioHigh audioMode
//@body
void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    vec2 base = p * 0.7 + 0.5 + vec2(0.01, 0.006) * sceneTime;
    float blur = 2.5 + 3.0 * clamp(blurP, 0.0, 1.0);
    // Ripples on the water bend the view slightly.
    vec2 rip = 0.004 * rough * vec2(sin(p.y * 40.0 + sceneTime * 2.0), sin(p.x * 40.0 - sceneTime * 1.7));
    vec3 bgc = imgLod(base + rip, blur);
    bgc = mix(bgc, glowColour(bgc, base, hueP * 0.159) * (0.4 + 0.9 * luma(bgc)), 0.5) * 1.3;
    bgc *= mix(vec3(0.95, 1.0, 1.1), vec3(1.1, 1.0, 0.9), clamp(audioMode, 0.0, 1.0));
    vec3 col = bgc * 0.75;
    float mag = 0.25 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float szK = (0.6 + 0.8 * clamp(sizeP, 0.0, 1.0)) * (0.85 + 0.3 * swell);
    // Drops at three sizes (big lenses, medium, small satellites).
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float cell = (0.26 - 0.07 * fl) * szK;
        vec2 g = p / cell + vec2(T * (1.0 + fl * 0.5), T * 0.6) + fl * 17.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + fl * 9.0) > 0.35 + 0.45 * clamp(dropsP, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.25 * (hash22(id + fl) - 0.5);
            float r = 0.22 + 0.2 * hash21(id + 3.0 + fl);
            vec2 d = g - c;
            float dl = length(d) / r;
            if (dl > 1.08) continue;
            float z = sqrt(max(1.0 - dl * dl, 0.0));
            // The lens: the background seen through the drop, magnified and bent.
            vec2 cw = (c - vec2(T * (1.0 + fl * 0.5), T * 0.6) - fl * 17.0) * cell;
            vec2 luv = cw * 0.7 + 0.5 + vec2(0.01, 0.006) * sceneTime + (p - cw) * 0.7 * mag * (0.5 + 0.8 * z);
            vec3 inD = imgLod(luv, blur * 0.4);
            inD = mix(inD, glowColour(inD, luv, hueP * 0.159) * (0.4 + 0.9 * luma(inD)), 0.5) * 1.5;
            // Dark refraction edge, bright inner rim, a highlight.
            inD *= mix(1.0, 0.1, smoothstep(0.75, 1.0, dl));
            inD += vec3(1.0) * exp(-pow((dl - 0.85) / 0.05, 2.0)) * 0.25;
            inD += vec3(1.0) * smoothstep(0.25, 0.0, length(d / r - vec2(-0.35, 0.4))) * (0.4 + 0.9 * hi);
            float aa = 2.0 / resolution.y / (cell * r);
            col = mix(col, inD, smoothstep(1.0 + aa, 1.0 - aa, dl));
        }
    }
    finish(col);
}
