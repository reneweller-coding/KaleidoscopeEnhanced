//@doc
 * @brief TEXTURE NEON RAIN: rain falling through neon light at night -- long
 * thin streaks of rain slant down in several depth layers, each drop lit
 * by the coloured signs of the photograph behind (which glows blurred
 * through the wet air), near streaks long and soft, far ones short and
 * sharp; wet reflections shimmer across the whole plane as a faint
 * mirrored copy.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rain falls (integrated, jump-free)
 *   audioSpread     -> the rain gets heavier
 *   audioKick       -> a flash of the signs (light)
 *   audioMode       -> palette: cyan-magenta in minor, the photo's warm colours in major
 *   audioHigh       -> the near drops sparkle (light)
 *   audioSwell      -> the glow of the signs through the air (slow)
 *
 * Knobs: slantP (wind slant), layerP (depth layers), glowP, hueP.
//@params slantP layerP glowP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5 + vec2(0.003, 0.0) * sceneTime;
    // The neon behind: the photo blurred and made to glow.
    vec3 bg = imgK(uv, 3.5);
    vec3 alt = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.2, 0.8), smoothstep(0.3, 0.7, fbm3(p * 1.5 + 3.0)));
    vec3 neon = mix(alt, glowColour(bg, p * 0.7, hueP * 0.159), mode);   // always saturated, even for grey photos
    // Signs: the photo's local highlights (so bright photos do not glow all over).
    float sign = smoothstep(0.03, 0.15, luma(bg) - luma(imgK(uv, 6.5)));
    vec3 col = neon * sign * (0.35 + 0.45 * clamp(glowP, 0.0, 1.0) + 0.3 * swell) * (1.0 + 0.8 * kick);
    col += neon * 0.015;
    // Rain layers.
    float slant = -0.15 - 0.25 * clamp(slantP, 0.0, 1.0);
    float nLay = 2.0 + 2.0 * clamp(layerP, 0.0, 1.0);
    float heavy = 0.25 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    float fall = 1.2 * sceneTime + 6.0 * audioAdvance;
    for (int L = 0; L < 4; ++L) {
        float fl = float(L);
        float on = smoothstep(fl - 0.5, fl + 0.5, nLay - 0.5);
        if (on <= 0.0) break;
        float depth = 1.0 + fl * 0.9;
        vec2 q = vec2(p.x - p.y * slant, p.y) * depth;
        float colW = 0.03;
        float ci = floor(q.x / colW);
        for (int k = -1; k <= 1; ++k) {
            float c = ci + float(k);
            float h = hash21(vec2(c, fl));
            if (h > heavy) continue;
            float x0 = (c + 0.5 + 0.35 * (hash21(vec2(fl, c) + 3.0) - 0.5)) * colW;
            float len = (0.25 + 0.2 * hash21(vec2(c, fl) + 5.0)) / depth;
            float period = 1.6;
            float y = mod(q.y + fall * (1.0 + 0.3 * h) + h * 10.0, period);   // drop head position cycles down
            float along = smoothstep(len, 0.0, y) * smoothstep(0.0, 0.02, y);
            float dx = abs(q.x - x0);
            float w = (0.0025 + 0.002 / depth) * depth;
            float streak = smoothstep(w, 0.0, dx) * along;
            // Each drop is lit by the neon at its place.
            vec3 lc = mix(neon, vec3(1.0), 0.3) * (0.3 + 0.9 * sign);
            col += lc * streak * (0.5 + 0.3 * fl) * on;
            col += vec3(1.0) * streak * hi * 0.3 * step(fl, 0.5) * step(y, 0.02 + len * 0.1);
        }
    }
    // Wet shimmer: a faint mirrored copy of the neon, broken by ripples.
    vec2 ruv = vec2(uv.x + 0.004 * sin(p.y * 80.0 + sceneTime * 3.0), 1.0 - uv.y);
    col += neon * smoothstep(0.03, 0.15, luma(imgLod(ruv, 3.5)) - luma(imgLod(ruv, 6.5))) * 0.06 * (0.5 + swell);
    finish(col);
}
