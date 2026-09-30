//@doc
 * @brief TEXTURE RIVER DELTA: a vast river delta seen from high above --
 * braided channels split and rejoin across the land in branching threads,
 * the water catching the sky in bright silver and turquoise, milky
 * sediment plumes streaming along the channels, sandbars in pale ochre,
 * the land between them the photograph's own colours and textures,
 * darkened like wetland vegetation.  The view drifts slowly downstream.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift and the sediment flow (integrated)
 *   audioSpread     -> the channels widen (flood)
 *   audioKick       -> sun glints on the water (light)
 *   audioMode       -> water: steel blue in minor, turquoise in major
 *   audioRoughness  -> more small braids
 *   audioSwell      -> the sediment plumes (slow)
 *
 * Knobs: braidP (braiding), waterP (water brightness), landP (photo on the land), hueP.
//@params braidP waterP landP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
// Channel mask from ridged noise: 1 in a channel.
float channels(vec2 q, float width)
{
    float n = abs(fbm3(q) - 0.5) * 2.0;                        // 0 on the isoline
    return smoothstep(width, width * 0.4, n);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 drift = vec2(0.015, 0.0) * sceneTime + vec2(0.1, 0.0) * audioAdvance;
    vec2 w = p + drift;
    // The delta flows along +x: stretch noise along the flow for braids.
    vec2 q = vec2(w.x * 1.2, w.y * 3.5);
    q += 0.4 * vec2(fbm3(w * 1.5), fbm3(w * 1.5 + 4.0));
    float flood = clamp(audioSpread, 0.0, 1.0);
    float wid = 0.08 + 0.08 * flood;
    float ch = channels(q, wid);
    float br = 0.4 + 0.6 * clamp(braidP, 0.0, 1.0);
    ch = max(ch, channels(q * 2.1 + 3.0, wid * 0.8) * br);
    ch = max(ch, channels(q * 4.3 + 7.0, wid * 0.7) * br * (0.3 + 0.7 * rough));
    // Sandbars: the margins of channels.
    float bar = smoothstep(0.0, 0.3, ch) * (1.0 - smoothstep(0.5, 0.9, ch));
    // Land: the photo, darkened and greened like wetland.
    vec2 uv = w * 0.5 + 0.5;
    vec3 ph = imgLod(uv, 1.5);
    vec3 land = mix(vec3(0.08, 0.12, 0.06), ph * vec3(0.55, 0.7, 0.45), clamp(landP, 0.0, 1.0));
    land *= 0.7 + 0.3 * fbm3(w * 12.0);
    // Water: sky reflection with sediment plumes streaming along.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 water = mix(vec3(0.35, 0.45, 0.6), vec3(0.25, 0.65, 0.7), mode) * (0.8 + 0.6 * clamp(waterP, 0.0, 1.0));
    water = mix(water, water * glowColour(imgLod(uv, 6.0), w, hueP * 0.159) * 1.4, 0.15);
    float sed = fbm(vec2(q.x * 2.0 - 0.3 * sceneTime - 2.0 * audioAdvance, q.y * 6.0));
    water = mix(water, vec3(0.75, 0.68, 0.55), smoothstep(0.45, 0.8, sed) * (0.3 + 0.5 * swell));
    // Glints of sun.
    vec2 sg = w * 70.0;
    vec2 si = floor(sg), sf = fract(sg);
    vec2 sc = 0.25 + 0.5 * hash22(si);
    float tw = pow(max(0.0, sin(sceneTime * (0.7 + hash21(si)) + hash21(si + 1.0) * 30.0)), 10.0);
    float gl = smoothstep(0.25, 0.0, length(sf - sc)) * step(0.85, hash21(si + 2.0)) * tw;
    water += vec3(1.0, 0.97, 0.9) * gl * (0.3 + 1.2 * kick);
    vec3 sand = vec3(0.7, 0.62, 0.48) * (0.85 + 0.3 * luma(ph));
    vec3 col = mix(land, sand, bar * 0.8);
    col = mix(col, water, smoothstep(0.45, 0.75, ch));
    // Faint haze of altitude.
    col = mix(col, vec3(0.6, 0.7, 0.8), 0.06);
    finish(col);
}
