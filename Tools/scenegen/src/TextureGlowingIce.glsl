//@doc
 * @brief TEXTURE GLOWING ICE: looking into a block of glacier ice lit from
 * within -- deep blue and cyan light glowing through the ice, brighter in
 * the clear parts, the frozen-in structure of the photograph showing as
 * pale veils, bubbles and pressure bands at different depths (parallax
 * layers), and a network of fracture planes that flash white where the
 * light catches them.  The light inside wanders slowly.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the inner light wanders (integrated, jump-free)
 *   audioAdvance    -> the view drifts through the depth layers (integrated)
 *   audioSpread     -> how deep the ice looks (layer spread)
 *   audioMode       -> the ice tint: deep blue in minor, turquoise-green in major
 *   audioBass       -> the inner glow (light)
 *   audioHigh       -> the fractures flash (light)
 *
 * Knobs: clarityP (clear vs. milky), fractureP (fracture density), layersP, hueP.
//@params clarityP fractureP layersP
//@audio audioPhase audioSpread audioMode audioBass audioHigh
//@body
float cracks(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.1 + 0.8 * hash22(i + o);
        float d = length(f - c);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 iceC = mix(vec3(0.1, 0.35, 0.9), vec3(0.15, 0.8, 0.8), mode);
    iceC = mix(iceC, glowColour(imgLod(p * 0.3 + 0.5, 6.0), p, hueP * 0.159), 0.12);
    // Inner light: a soft glow that wanders.
    float lp = 0.05 * sceneTime + 0.3 * audioPhase;
    vec2 lc = vec2(0.5 * sin(lp), 0.3 * cos(lp * 0.8));
    float inner = exp(-length(p - lc) * 1.5) * (0.6 + 0.8 * bass);
    vec3 col = iceC * (0.15 + 0.9 * inner);
    // Frozen-in layers at several depths (parallax).
    int nL = 3 + int(clamp(layersP, 0.0, 1.0) * 2.99);
    float spread = 0.3 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    float clarity = clamp(clarityP, 0.0, 1.0);
    for (int L = 0; L < 5; ++L) {
        if (L >= nL) break;
        float fl = float(L);
        float z = 1.0 + fl * spread;
        vec2 q = p / z + vec2(0.02 * sceneTime + 0.2 * audioAdvance, 0.01 * sceneTime) * (1.0 / z) + fl * 3.7;
        vec2 uv = q * 0.6 + 0.5;
        float lum = luma(imgLod(uv, 2.0 + fl * 0.5));
        float avg = luma(imgLod(uv, 7.0));
        float veil = smoothstep(0.02, 0.2, lum - avg) * (1.0 - 0.6 * clarity);
        float fade = 1.0 / (1.0 + fl * 0.6);
        col += vec3(0.85, 0.95, 1.0) * veil * 0.35 * fade * (0.4 + inner);
        // Bubbles: round, bright rims.
        vec2 bq = q * 14.0, bi = floor(bq), bf = fract(bq);
        vec2 bc = 0.3 + 0.4 * hash22(bi + fl);
        float br = 0.08 + 0.1 * hash21(bi + 5.0);
        float bd = length(bf - bc);
        float bub = step(0.88, hash21(bi + fl * 3.0)) * smoothstep(0.02, 0.0, abs(bd - br));
        col += vec3(0.9, 0.97, 1.0) * bub * 0.4 * fade * (0.4 + inner);
    }
    // Fractures: planes seen edge-on as bright lines that flash with the highs.
    vec2 fq = p * (1.5 + 2.0 * clamp(fractureP, 0.0, 1.0)) + 0.01 * sceneTime;
    fq += 0.3 * vec2(fbm3(fq), fbm3(fq + 4.0));
    float fr = cracks(fq);
    // only some borders are real fractures
    float present = smoothstep(0.45, 0.65, noise2(fq * 0.7 + 9.0));
    float fl2 = smoothstep(0.03, 0.0, fr) * present;
    col += vec3(0.9, 0.97, 1.0) * fl2 * (0.15 + 0.9 * hi) * (0.4 + inner);
    col += iceC * smoothstep(0.12, 0.0, fr) * 0.15 * present;
    finish(col * 1.1);
}
