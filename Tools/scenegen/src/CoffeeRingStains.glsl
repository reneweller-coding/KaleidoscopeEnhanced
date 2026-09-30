//@doc
 * @brief COFFEE RING STAINS: drops drying on a sheet -- round stains of
 * coffee, tea and wine spread and dry across the paper, each leaving the
 * characteristic dark ring at its edge (the coffee-ring effect) with a
 * pale centre, overlapping stains darkening each other, some with
 * satellite droplets and drips; the stains slowly fade as new ones fall.
 * The paper and the stain colours are tinted by the photograph.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> new stains fall and dry (integrated, jump-free)
 *   audioSpread     -> stain size
 *   audioKick       -> the wet stains shimmer (light)
 *   audioMode       -> tea/coffee browns in minor, wine reds in major
 *   audioRoughness  -> the rims get irregular
 *   audioSwell      -> stain darkness (slow)
 *
 * Knobs: stainP (stain density), ringP (ring sharpness), paperP (photo in the paper), hueP.
//@params stainP ringP paperP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 paper = vec3(0.95, 0.93, 0.87) * (0.97 + 0.03 * fbm3(p * 50.0));
    paper = mix(paper, paper * (0.75 + 0.35 * imgK(uv, 3.0)), 0.25 * clamp(paperP, 0.0, 1.0));
    vec3 col = paper;
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    float S = 1.5 + 1.5 * clamp(stainP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        for (int k = 0; k < 2; ++k) {
            float fk = float(k);
            float h = hash21(id + fk * 5.3);
            float cyc = T * (0.4 + 0.4 * h) + h * 3.0 + fk * 0.5;
            float life = fract(cyc);
            float gen = floor(cyc);
            if (hash21(id + gen * 1.9 + fk) > 0.6) continue;
            vec2 c = id + 0.5 + 0.35 * (hash22(id + gen + fk * 3.0) - 0.5);
            float R = (0.18 + 0.2 * clamp(audioSpread, 0.0, 1.0)) * (0.5 + 0.7 * hash21(id + gen + 4.0));
            vec2 d = g - c;
            float ang = atan(d.y, d.x);
            vec2 u = vec2(cos(ang), sin(ang));
            float rr = length(d) / R + (0.03 + 0.1 * rough) * (fbm3(u * 3.0 + h * 9.0 + gen) - 0.5);
            if (rr > 1.3) continue;
            float alpha = smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.6, life);
            vec3 stainC = mix(vec3(0.55, 0.35, 0.18), vec3(0.55, 0.1, 0.2), mode);
            stainC = mix(stainC, stainC * glowColour(imgLod(hash22(id + gen), 4.0), id, hueP * 0.159) * 1.3, 0.15);
            // Each stain is a window onto the turning kaleidoscope (tinted by the drink).
            stainC = mix(stainC, stainC * (0.4 + 1.3 * imgK(uv, 1.5)), 0.6);
            float sharp = 20.0 + 40.0 * clamp(ringP, 0.0, 1.0);
            float ringD = exp(-max(1.0 - rr, 0.0) * sharp) * step(rr, 1.0);
            float fill = step(rr, 1.0) * 0.25;
            float dens = (fill + ringD * 0.8) * (0.6 + 0.6 * swell);
            // Wet sheen while fresh.
            float wet = (1.0 - smoothstep(0.0, 0.2, life)) * step(rr, 1.0);
            col *= mix(vec3(1.0), stainC, clamp(dens * alpha, 0.0, 1.0));
            col += vec3(1.0) * wet * alpha * (0.03 + 0.12 * kick) * smoothstep(0.4, 0.8, noise2(d * 10.0 + sceneTime));
        }
    }
    finish(col);
}
