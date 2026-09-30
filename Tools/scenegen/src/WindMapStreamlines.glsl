//@doc
 * @brief WIND MAP STREAMLINES: a living wind map -- thousands of fine glowing
 * streamlines trace the air currents across a dark map, bright and warm
 * where the wind is fast, cool and faint where it is calm, whirling around
 * the pressure systems, and the whole pattern streams forward along the
 * lines.  The pressure field is the photograph: its bright regions are
 * highs, its dark regions lows, and the wind circles them, so every photo
 * gives its own weather; the photo's shape shows faintly as the land.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the streaming along the lines (integrated, jump-free)
 *   audioSpread     -> streak length
 *   audioRoughness  -> gusts (turbulence added to the wind)
 *   audioSwell      -> overall wind strength (slow)
 *   audioHigh       -> the fastest streams sparkle (light)
 *   audioMode       -> the colour scale: cool-to-warm range shifts
 *
 * Knobs: densityP (lines), scaleP (map scale), landP (how much the land shows), hueP.
//@params densityP scaleP landP
//@audio audioSpread audioRoughness audioSwell audioHigh audioMode
//@body
float gSc, gRough;

vec2 wind(vec2 uv)
{
    // Geostrophic wind: along the isobars (perpendicular to the pressure gradient).
    vec2 g = texGrad(uv, 7.0) + 0.5 * texGrad(uv, 5.5);
    vec2 v = vec2(-g.y, g.x) * 0.03;
    v += gRough * 0.4 * (vec2(noise2(uv * 20.0 + sceneTime * 0.2), noise2(uv * 20.0 + 7.0 - sceneTime * 0.2)) - 0.5);
    return v;
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    gRough = clamp(audioRoughness, 0.0, 1.0) * 0.3;
    gSc = 0.5 + 0.6 * clamp(scaleP, 0.0, 1.0);
    vec2 uv = p * gSc + 0.5 + vec2(0.004, 0.002) * sceneTime;
    vec2 v0 = wind(uv);
    float speed = length(v0) / 0.03 * 0.35 * (0.7 + 0.6 * swell);
    // LIC along the wind: fine noise averaged along the streamline.
    float len = 0.0015 + 0.002 * clamp(audioSpread, 0.0, 1.0);
    float flow = 0.6 * sceneTime + 4.0 * audioAdvance;
    float acc = 0.0, wsum = 0.0;
    vec2 a = uv, b = uv;
    for (int i = 0; i < 14; ++i) {
        float fi = float(i);
        vec2 va = wind(a), vb = wind(b);
        a += normalize(va + 1e-5) * len;
        b -= normalize(vb + 1e-5) * len;   // (unit steps: lines follow the direction only)
        float na = noise2(a * 700.0), nb = noise2(b * 700.0);
        na = na * na * na; nb = nb * nb * nb;
        float wa = 0.5 + 0.5 * sin(flow - fi * 0.45);
        float wb = 0.5 + 0.5 * sin(flow + fi * 0.45);
        acc += na * wa + nb * wb;
        wsum += 2.0;
    }
    float lic = acc / wsum;
    float dens = 0.3 + 0.7 * clamp(densityP, 0.0, 1.0);
    float lines = smoothstep(0.0, 1.0, (lic - 0.05) * 12.0 * dens + 0.15);
    // Colour by speed (wind map scale).
    float s = clamp(speed, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 slow = mix(vec3(0.15, 0.35, 0.8), vec3(0.3, 0.2, 0.7), mode);
    vec3 fast = mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.4, 0.3), mode);
    vec3 sc = mix(slow, mix(vec3(0.2, 0.9, 0.6), fast, smoothstep(0.4, 1.0, s)), smoothstep(0.0, 0.5, s));
    sc = mix(sc, glowColour(imgLod(uv, 6.0), uv, hueP * 0.159), 0.15);
    // The land underneath: the photo, dark.
    vec3 land = imgLod(uv, 2.0) * (0.04 + 0.12 * clamp(landP, 0.0, 1.0));
    vec3 col = land + sc * lines * (1.1 + 1.6 * s);
    col += vec3(1.0) * pow(lines, 3.0) * smoothstep(0.6, 1.0, s) * (0.1 + 0.6 * hi);
    finish(col);
}
