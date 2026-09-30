//@doc
 * @brief TEXTURE LEAF STORM: an autumn storm of leaves swirling toward the
 * viewer -- thousands of leaves in several depth layers tumble and spin
 * through the air on gusty spiralling winds, each leaf a small pointed
 * shape with a midrib, its colour cut from the photograph (so every photo
 * gives its own foliage), turning so it flashes its lighter underside;
 * near leaves large and soft, far ones small and many.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the wind carries them (integrated, jump-free)
 *   audioSpread     -> the swirl of the gusts
 *   audioKick       -> a gust brightens the leaves (light)
 *   audioMode       -> palette: cool green-blue in minor, autumn gold-red in major (tint)
 *   audioHigh       -> the undersides flash (light)
 *   audioSwell      -> the dusk light behind (slow)
 *
 * Knobs: densityP (leaves), sizeP (leaf size), photoP (photo colours vs. autumn), hueP.
//@params densityP sizeP photoP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 dusk = mix(vec3(0.08, 0.1, 0.16), vec3(0.3, 0.16, 0.08), mode) * (0.6 + 0.8 * swell);
    vec3 col = dusk * (0.6 + 0.6 * smoothstep(-0.6, 0.6, p.y)) + imgLod(p * 0.4 + 0.5, 5.0) * 0.05;
    float T = 0.12 * sceneTime + 0.8 * audioAdvance;
    float swirl = 0.3 + 0.7 * clamp(audioSpread, 0.0, 1.0);
    for (int L = 3; L >= 0; --L) {                               // far to near
        float fl = float(L);
        float S = (6.0 + 5.0 * (1.0 - clamp(sizeP, 0.0, 1.0))) * (1.0 + fl * 0.6);
        // The wind field: a steady drift plus a slow swirl.
        vec2 w = p + swirl * 0.08 * vec2(sin(p.y * 2.0 + T * 0.7 + fl), cos(p.x * 1.7 - T * 0.5 + fl));
        vec2 g = w * S + vec2(-T * (1.5 + 0.4 * fl), T * 0.4) + fl * 17.0;
        vec2 gi = floor(g);
        float pxg = fwidth(g.x) * 1.5;                           // outside the branches: derivatives stay valid
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            float h = hash21(id + fl * 3.0);
            if (h > 0.3 + 0.5 * clamp(densityP, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.2 * vec2(sin(T * 2.0 + h * 6.28), cos(T * 1.7 + h * 9.0));   // stays inside the 3x3 search
            // Tumbling: the leaf turns (rot) and flips (its width shrinks with |cos|).
            float rot = T * (2.0 + 3.0 * h) * (h > 0.5 ? 1.0 : -1.0) + h * 6.28;
            float flip = cos(T * (1.5 + 2.0 * fract(h * 7.0)) + h * 11.0);
            vec2 l = rot2(rot) * (g - c);
            l.y /= max(abs(flip), 0.15);
            // Leaf shape: pointed ellipse (vesica) with a stem.
            float len = 0.3, wid = 0.13;
            float shape = length(vec2(l.x / len, l.y / (wid * (1.0 - 0.6 * abs(l.x / len))))) ;
            float px = pxg / len;
            float leaf = smoothstep(1.0 + px, 1.0 - px, shape);
            if (leaf <= 0.0) continue;
            vec2 cw = (c - vec2(-T * (1.5 + 0.4 * fl), T * 0.4) - fl * 17.0) / S;
            vec3 pc = imgLod(cw * 0.6 + 0.5, 2.5);
            vec3 autumn = mix(vec3(0.3, 0.55, 0.45), mix(vec3(0.9, 0.55, 0.1), vec3(0.75, 0.15, 0.08), fract(h * 5.0)), mode);
            vec3 lc = mix(autumn, glowColour(pc, id, hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.8);
            // Underside lighter when flipped; a midrib.
            lc *= flip > 0.0 ? 1.0 : 1.4 + 0.8 * hi;
            lc *= 1.0 - 0.35 * smoothstep(0.03, 0.0, abs(l.y));
            lc *= 0.75 + 0.35 * (1.0 - abs(l.x / len));
            float depthDim = 1.0 / (1.0 + fl * 0.5);
            col = mix(col, lc * depthDim * (1.0 + 0.5 * kick), leaf * (1.0 - fl * 0.12));
        }
    }
    finish(col);
}
