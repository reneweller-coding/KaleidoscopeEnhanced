//@doc
 * @brief WEATHER RADAR SWEEP: a weather radar screen at night -- the beam
 * sweeps around and around, and in its wake the rain echoes light up in
 * the radar palette (green drizzle, yellow rain, red downpours, magenta
 * hail cores) and slowly fade until the next pass; the echoes are storm
 * cells shaped by the photograph and drifting with the wind; range rings,
 * a faint map (the photo's edges) and the sweep's bright leading line.
 * Several radar sites overlap across the endless plane.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the storms drift (integrated, jump-free)
 *   audioPhase      -> the sweep turns (integrated)
 *   audioSpread     -> the storms grow and intensify
 *   audioKick       -> the leading line flashes (light)
 *   audioMode       -> the screen: green phosphor in minor, modern colour in major
 *   audioSwell      -> the afterglow lasts longer (slow)
 *
 * Knobs: siteP (radar site spacing), stormP (storm density), mapP (map lines), hueP.
//@params siteP stormP mapP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
vec3 radarPal(float v)
{
    vec3 c = mix(vec3(0.0, 0.35, 0.1), vec3(0.1, 0.85, 0.2), smoothstep(0.1, 0.3, v));
    c = mix(c, vec3(0.95, 0.9, 0.1), smoothstep(0.35, 0.5, v));
    c = mix(c, vec3(1.0, 0.25, 0.05), smoothstep(0.55, 0.7, v));
    c = mix(c, vec3(0.95, 0.1, 0.85), smoothstep(0.78, 0.9, v));
    return c;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 wind = vec2(0.012, 0.004) * sceneTime + vec2(0.08, 0.03) * audioAdvance;
    // Storm field: photo structure plus noise, drifting.
    vec2 w = p - wind;
    vec2 uv = w * 0.5 + 0.5;
    float storm = 0.6 * luma(imgLod(uv, 4.0)) + 0.6 * fbm(w * 3.0 + 1.3) - 0.35;
    storm += 0.3 * (fbm3(w * 8.0) - 0.5);
    float dens = 0.45 + 0.4 * clamp(stormP, 0.0, 1.0) + 0.2 * clamp(audioSpread, 0.0, 1.0);
    float v = smoothstep(0.55 - dens * 0.5, 1.0, storm);
    // Radar sites on a grid; every site within range sweeps this pixel,
    // the strongest return wins (no hard borders between sites).
    float S = 1.0 + 1.0 * (1.0 - clamp(siteP, 0.0, 1.0));
    vec2 g = p * S;
    vec2 gc = floor(g + 0.5);
    float after = 0.0, lead = 0.0, r = 9.0;
    float decay = 0.15 + 0.35 * swell;
    for (int jj = -1; jj <= 1; ++jj) for (int ii = -1; ii <= 1; ++ii) {
        vec2 si = gc + vec2(ii, jj);
        vec2 l = (g - si) / S;
        float rr = length(l);
        float range = smoothstep(0.75 / S + 0.1, 0.3 / S, rr);
        if (range <= 0.0) continue;
        float a = atan(l.y, l.x);
        float sweep = 0.6 * sceneTime + 3.0 * audioPhase + hash21(si) * 6.28;
        float since = fract((sweep - a) / 6.2831853);           // 0 just swept, 1 about to be swept
        after = max(after, exp(-since / decay) * range);
        lead = max(lead, (exp(-since * 120.0) + exp(-(1.0 - since) * 400.0) * 0.5) * range);
        r = min(r, rr);
    }
    vec3 echo = radarPal(v) * step(0.05, v) * (0.25 + 0.9 * after);
    vec3 phosphor = vec3(0.2, 1.0, 0.35) * (0.2 + 0.8 * v) * step(0.05, v) * (0.25 + 0.9 * after);
    vec3 col = mix(phosphor, echo, mode);
    // Leading line of the sweep.
    vec3 lineC = mix(vec3(0.4, 1.0, 0.5), vec3(0.8, 0.95, 1.0), mode);
    col += lineC * lead * (0.3 + 1.0 * kick);
    // Range rings and map.
    float rings = abs(fract(r * 8.0) - 0.5);
    float rpx = fwidth(r * 8.0) + 1e-4;
    col += lineC * smoothstep(rpx * 1.5, 0.0, 0.5 - rings) * 0.08;
    float mapE = texEdge(p * 0.6 + 0.5, 3.0);
    col += lineC * smoothstep(0.3, 0.8, mapE) * 0.06 * clamp(mapP + 0.2, 0.0, 1.2);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.08);
    col += vec3(0.0, 0.01, 0.015);
    finish(col);
}
