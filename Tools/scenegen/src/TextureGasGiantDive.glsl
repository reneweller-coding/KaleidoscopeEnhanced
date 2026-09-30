//@doc
 * @brief TEXTURE GAS GIANT DIVE: hovering over the cloud tops of a gas
 * giant -- broad bands of atmosphere race past each other in opposite
 * directions, their edges curling into festoons and eddies, great oval
 * storms turn slowly between them, and the colours (cream, ochre, rust,
 * blue-grey) are drawn from the photograph's palette; the band structure
 * stretches endlessly across the view.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the jets flow (integrated, jump-free)
 *   audioSpread     -> the jets' speed contrast
 *   audioRoughness  -> turbulence at the band edges
 *   audioKick       -> lightning in the storms (light)
 *   audioMode       -> palette warmth
 *   audioSwell      -> the storms swell (slow)
 *
 * Knobs: bandP (band count), stormP (storm size), contrastP, hueP.
//@params bandP stormP contrastP
//@audio audioSpread audioRoughness audioKick audioMode audioSwell
//@body
float gBands, gT, gShear;
// Cloud texture advected by the zonal jets (flow-map with two phases).
float clouds(vec2 x, float phaseT)
{
    float u = sin(x.y * gBands) * gShear;                      // jet speed at this latitude
    vec2 q = x - vec2(u * phaseT, 0.0);
    vec2 w = vec2(fbm3(q * 1.5), fbm3(q * 1.5 + 5.0)) - 0.5;
    return fbm(vec2(q.x * 1.2, q.y * 6.0) + w * 1.2);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    gBands = 5.0 + 6.0 * clamp(bandP, 0.0, 1.0);
    gShear = 0.15 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    vec2 x = p * 1.5;
    // Storms: ovals on a jittered grid; they swirl the coordinates.
    float S = 1.2;
    vec2 g = x * vec2(S, S * 1.6);
    vec2 gi = floor(g);
    float stormSize = (0.15 + 0.15 * clamp(stormP, 0.0, 1.0)) * (0.8 + 0.4 * swell);
    float stormGlow = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        if (hash21(id) > 0.45) continue;
        vec2 c = id + 0.5 + 0.3 * (hash22(id + 1.0) - 0.5) + vec2(0.1 * sin(0.02 * sceneTime + hash21(id + 2.0) * 6.28), 0.0);   // bounded wander
        vec2 d = (g - c) / vec2(1.6, 1.0);
        float R = stormSize * (0.6 + 0.8 * hash21(id + 3.0));
        float fall = exp(-dot(d, d) / (R * R)) * smoothstep(0.95, 0.5, length(g - c));   // ends inside the 3x3 search
        float ang = fall * (3.0 + 1.5 * sin(0.1 * sceneTime + 0.5 * audioAdvance + hash21(id + 4.0) * 6.28)) * (hash21(id + 6.0) < 0.5 ? 1.0 : -1.0);   // bounded winding
        g = c + rot2(ang) * (g - c);
        stormGlow += fall * step(0.7, hash21(id + 5.0));
    }
    x = g / vec2(S, S * 1.6);
    // Flow map: two phases half a period apart, cross-faded (no smearing forever).
    float T = 0.15 * sceneTime + 1.0 * audioAdvance;
    float P = 6.0;
    float ph1 = fract(T / P), ph2 = fract(T / P + 0.5);
    float c1 = clouds(x + 3.1 * floor(T / P), ph1 * P);
    float c2 = clouds(x + 3.1 * floor(T / P + 0.5) + 7.7, ph2 * P);
    float wgt = abs(ph1 * 2.0 - 1.0);                           // 1 where phase 1 is at its seam
    float cl = mix(c1, c2, wgt);
    // Band colours from the photo palette by latitude, modulated by the clouds.
    float lat = x.y * gBands / 6.2831853;
    float band = 0.5 + 0.5 * sin(x.y * gBands * 0.5 + 0.7);
    vec3 cA = imgPalette(fract(lat * 0.37 + hueP * 0.159));
    vec3 cB = imgPalette(fract(lat * 0.37 + 0.33 + hueP * 0.159));
    vec3 col = mix(cA, cB, smoothstep(0.3, 0.7, band + (cl - 0.5) * (0.8 + 0.8 * rough)));
    col = mix(col, col * mix(vec3(0.85, 0.9, 1.1), vec3(1.15, 0.95, 0.8), mode), 0.6);
    float con = 0.6 + 0.8 * clamp(contrastP, 0.0, 1.0);
    col *= 0.55 + con * 0.6 * cl;
    col += vec3(1.0, 0.95, 0.9) * smoothstep(0.65, 0.9, cl) * 0.15;
    // Lightning inside the storms.
    col += vec3(0.7, 0.8, 1.0) * stormGlow * kick * 0.6;
    finish(col);
}
