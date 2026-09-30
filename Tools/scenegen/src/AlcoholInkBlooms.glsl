//@doc
 * @brief ALCOHOL INK BLOOMS: alcohol ink on white synthetic paper, blooming --
 * drops of intensely coloured ink spread out in soft-edged pools, each pool
 * pushing its pigment to the rim so it ends in a dark, sharp, lacy
 * boundary, often with a thin metallic gold line along it; pools push into
 * each other, leaving pale channels and cell-like shapes; the paper shows
 * white where the alcohol has cleared it.  New blooms keep opening and
 * spreading over the old ones.  The ink colours come from the photograph.
 * An endless field, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the blooms spread (integrated, jump-free)
 *   audioHarmChange -> a fresh bloom starts on chord changes (smoothed)
 *   audioSpread     -> bloom size
 *   audioRoughness  -> the rims get lacier
 *   audioHigh       -> the gold lines glint (light)
 *   audioSwell      -> ink saturation (slow)
 *
 * Knobs: bloomsP (how many), goldP (metallic rims), paperP (how much white
 * shows), hueP.
//@params bloomsP goldP paperP
//@audio audioHarmChange audioSpread audioRoughness audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP() * 1.6;
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.4 * audioAdvance + 0.08 * clamp(audioHarmChange, 0.0, 1.0);

    // Blooms on a jittered grid in "time layers": each layer is a generation
    // of drops; a drop's radius grows over its life, later ones lie on top.
    vec3 paper = vec3(0.97, 0.96, 0.94);
    vec3 col = paper;
    float rimAcc = 0.0, goldAcc = 0.0;
    float size = 0.55 + 0.45 * clamp(audioSpread, 0.0, 1.0);
    float dens = 0.45 + 0.4 * clamp(bloomsP, 0.0, 1.0);
    for (int L = 0; L < 4; ++L) {
        float fl = float(L);
        // Each generation cycles: born, grows, then is covered by the next.
        float gen = floor(T + fl * 0.25);
        float life = fract(T + fl * 0.25);
        vec2 q = p / size + hash22(vec2(gen, fl)) * 11.0;
        vec2 gi = floor(q);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + gen * 3.1) > dens) continue;
            vec2 c = id + 0.5 + 0.3 * (hash22(id + gen) - 0.5);
            vec2 d = q - c;
            d += 0.18 * vec2(fbm3(q * 1.3 + id), fbm3(q * 1.3 + id + 5.0)) - 0.09;     // organic, not circular
            float ang = atan(d.y, d.x);
            vec2 dir = vec2(cos(ang), sin(ang));
            // Irregular, lacy rim (noise on the circle, seamless).
            float R = (0.25 + 0.5 * smoothstep(0.0, 0.8, life)) * (0.7 + 0.35 * hash21(id + 9.0));
            float lace = 0.12 * (fbm3(dir * 2.5 + id + gen) - 0.5) + (0.015 + 0.04 * rough) * (noise2(dir * 7.0 + id) - 0.5);
            float r = length(d) / R + lace;
            float inside = smoothstep(1.0, 0.97, r);
            // Ink: pale in the middle (the alcohol pushed it out), dense at the rim.
            float dens2 = mix(0.35, 1.0, smoothstep(0.3, 0.97, r));
            vec3 ph = imgLod(id * 0.093 + gen * 0.17, 5.0);
            vec3 ink = hsv2rgb(vec3(fract((satOf(ph) > 0.2 ? hue_of(ph) : hueP * 0.159) + 0.12 * hash21(id + gen) + 0.1 * fl), 0.85, 0.85));
            ink = mix(vec3(1.0), ink, (0.55 + 0.4 * swell) * dens2);
            // Fade out at the end of life (covered by the next layer anyway).
            float a = inside * smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.8, life);
            col = mix(col, col * ink, a);
            float rim = exp(-pow((r - 0.99) / 0.018, 2.0)) * smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.8, life);
            rimAcc = max(rimAcc, rim);
            goldAcc = max(goldAcc, exp(-pow((r - 1.015) / 0.008, 2.0)) * step(0.5, hash21(id + 17.0)) * smoothstep(1.0, 0.8, life));
        }
    }
    // Dark lacy rims, and gold lines along some of them.
    col *= 1.0 - 0.55 * rimAcc;
    vec3 gold = vec3(1.0, 0.8, 0.35);
    col = mix(col, gold * (0.8 + 0.8 * hi), goldAcc * (0.3 + 0.7 * clamp(goldP, 0.0, 1.0)));
    // Paper shows more where cleared.
    col = mix(col, paper, 0.15 * clamp(paperP, 0.0, 1.0));
    finish(col * 0.95);
}
