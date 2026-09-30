//@doc
 * @brief SEISMIC WAVEFRONTS: a seismograph's view of the underground --
 * wavefronts from several quakes spread as rings through layered rock
 * (the photograph's structure sets the layers' speeds), bending where they
 * cross into faster or slower strata, reflecting, and interfering; the
 * wave amplitude is shown in a red-blue diverging colour scale over the
 * grey rock layers, fading as the waves weaken.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves travel (integrated, jump-free)
 *   audioSpread     -> the wave packets widen
 *   audioKick       -> a new quake flares (light)
 *   audioMode       -> the scale: blue-red in minor, green-magenta in major
 *   audioRoughness  -> the layers bend the waves more
 *   audioSwell      -> the rock layers show (slow)
 *
 * Knobs: quakeP (quake sources), freqP (wave frequency), layerP (layer contrast), hueP.
//@params quakeP freqP layerP
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
    // Rock layers: the photo's broad luma sets slowness; strata along y.
    float slow = luma(imgLod(uv, 4.0));
    float strata = sin(p.y * 12.0 + 3.0 * fbm3(p * 1.5)) * 0.5 + 0.5;
    float travelK = 1.0 + (0.3 + 0.7 * rough) * (slow - 0.5 + 0.3 * (strata - 0.5));
    float T = 0.4 * sceneTime + 2.5 * audioAdvance;
    float k = 12.0 + 20.0 * clamp(freqP, 0.0, 1.0);
    float width = 0.15 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    float amp = 0.0;
    float nQ = 2.0 + 3.0 * clamp(quakeP, 0.0, 1.0);
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        float on = smoothstep(fi - 0.5, fi + 0.5, nQ - 0.5);
        if (on <= 0.0) break;
        float cyc = T * (0.12 + 0.04 * fi) + fi * 0.37;
        float age = fract(cyc);
        float gen = floor(cyc);
        vec2 c = vec2(0.9 * (hash11(gen * 1.3 + fi) - 0.5) * 2.0, 0.5 * (hash11(gen * 2.1 + fi + 5.0) - 0.5) * 2.0);
        float d = length(p - c) * travelK;
        float front = age * 1.6;
        float pkt = exp(-pow((d - front) / width, 2.0));
        amp += on * pkt * sin((d - front) * k) * (1.0 - age) * smoothstep(0.0, 0.05, age) / (1.0 + d * 2.0);
        // A reflected wave from the strata (faint, delayed).
        float dr = length(p - vec2(c.x, -c.y - 0.3)) * travelK;
        amp += on * 0.35 * exp(-pow((dr - front * 0.9) / width, 2.0)) * sin((dr - front * 0.9) * k) * (1.0 - age) * smoothstep(0.0, 0.05, age) / (1.0 + dr * 2.0);
    }
    amp *= 0.7 + 0.8 * kick;
    vec3 pos = mix(vec3(0.9, 0.2, 0.15), vec3(0.2, 0.85, 0.3), mode);
    vec3 neg = mix(vec3(0.15, 0.3, 0.95), vec3(0.85, 0.2, 0.8), mode);
    // Rock: the kaleidoscoped photo as an embossed relief.
    vec3 rock = vec3(0.2 + 0.4 * imgKRelief(uv, 1.5, vec2(-0.6, 0.8))) + (vec3(luma(imgK(uv, 2.0))) - 0.35) * (0.3 + 0.7 * clamp(layerP, 0.0, 1.0));
    rock *= 0.8 + 0.2 * strata;
    rock *= 0.4 + 0.6 * swell;
    vec3 col = rock * 0.5;
    col = mix(col, pos, clamp(amp, 0.0, 1.0));
    col = mix(col, neg, clamp(-amp, 0.0, 1.0));
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
