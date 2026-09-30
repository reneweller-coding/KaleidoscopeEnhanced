//@doc
 * @brief TEXTURE MIST LIGHTS: coloured lights glowing through drifting fog
 * at night -- dozens of soft lamps (the photograph's bright points,
 * scattered at different distances) bloom into large halos in the mist,
 * the fog rolling in banks between them so the halos swell and fade as
 * denser or thinner fog passes; near lights large and diffuse, far ones
 * small pinpoints.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the fog banks roll (integrated, jump-free)
 *   audioSpread     -> the halos spread
 *   audioBass       -> the lights brighten (light)
 *   audioMode       -> the fog: cool blue-grey in minor, warm in major
 *   audioHigh       -> the pinpoints sparkle (light)
 *   audioSwell      -> the fog density (slow)
 *
 * Knobs: lightP (number of lights), haloP (halo size), fogP (base fog), hueP.
//@params lightP haloP fogP
//@audio audioSpread audioBass audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    // Fog: rolling banks at two depths.
    float fog1 = fbm(p * 1.3 + vec2(T * 2.0, 0.2 * T));
    float fog2 = fbm(p * 2.2 - vec2(T * 1.3, 0.0) + 4.0);
    float fog = clamp((0.3 + 0.4 * clamp(fogP, 0.0, 1.0)) * (0.6 + 0.8 * swell) * (0.5 + fog1 * 0.8 + fog2 * 0.4), 0.0, 1.5);
    vec3 fogC = mix(vec3(0.35, 0.4, 0.5), vec3(0.5, 0.42, 0.35), mode);
    vec3 col = fogC * 0.07 * (0.5 + fog);
    // Lights at three depths on jittered grids.
    float halo = (0.6 + 0.8 * clamp(haloP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);                                    // 0 near .. 2 far
        float S = 1.6 + 1.8 * fl;
        vec2 g = p * S + fl * 5.3 + vec2(0.02 * sceneTime * (1.0 - 0.3 * fl), 0.0);
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            float h = hash21(id + fl * 9.0);
            if (h > 0.25 + 0.5 * clamp(lightP, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.35 * (hash22(id + fl) - 0.5);
            vec2 cw = (c - fl * 5.3) / S;
            vec3 lc = glowColour(imgLod(cw * 0.5 + 0.5, 3.0), id, hueP * 0.159 + fl * 0.1);
            lc = mix(lc, mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.75, 0.45), mode), 0.3);
            float d = length(g - c) / S;                        // screen distance
            // Point, halo in the fog (scales with fog density), faint rays.
            float point = exp(-d * d / (0.00006 + 0.0002 * (2.0 - fl)));
            float hal = exp(-d / (0.09 * halo * (1.5 - fl * 0.35))) * (0.35 + 0.8 * fog) * (1.0 - 0.3 * fl);
            float rays = exp(-d / (0.25 * halo)) * 0.15 * fog;   // the wide bloom in the fog
            float tw = 1.0 + hi * 0.5 * sin(sceneTime * (3.0 + 5.0 * h) + h * 20.0) * step(1.5, fl);
            // The glow must end inside the 3x3 search (else it is cut at the cell borders).
            float win = smoothstep(1.0, 0.45, length(g - c));
            col += lc * (point * 1.5 * tw + (hal * 0.5 + rays) * win) * (0.7 + 0.6 * bass);
        }
    }
    // The fog veils everything a little.
    col = mix(col, fogC * 0.12 * (0.5 + fog), 0.2 * fog);
    finish(col);
}
