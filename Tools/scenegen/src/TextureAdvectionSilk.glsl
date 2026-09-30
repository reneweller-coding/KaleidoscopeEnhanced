//@doc
 * @brief TEXTURE ADVECTION SILK: the photograph carried along by a slow,
 * swirling current and drawn out into fine silk threads -- every point of
 * the picture is smeared along the flow's streamlines (line integral
 * convolution), so its colours become long glossy fibres that curl around
 * the vortices; the flow itself slowly evolves, the fibres shimmer with a
 * sheen that runs along them.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the silk streams along the flow (integrated, jump-free)
 *   audioSpread     -> the swirl strength
 *   audioKick       -> the sheen flares (light)
 *   audioMode       -> the silk: cool pearl in minor, warm gold in major (tint)
 *   audioRoughness  -> the fibres get finer
 *   audioSwell      -> how much of the photo's own colour shows (slow)
 *
 * Knobs: fibreP (fibre length), vortexP (vortex size), sheenP, hueP.
//@params fibreP vortexP sheenP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
float gT, gVS, gSw;
vec2 flowAt(vec2 x)
{
    // Curl of a noise potential: divergence-free swirls.
    float e = 0.02;
    vec2 q = x * gVS + vec2(0.0, gT);
    float n0 = fbm3(q);
    float nx = fbm3(q + vec2(e, 0.0));
    float ny = fbm3(q + vec2(0.0, e));
    return vec2(ny - n0, -(nx - n0)) / e * gSw + vec2(0.15, 0.05);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    gT = 0.01 * sceneTime;
    gVS = 0.8 + 1.5 * (1.0 - clamp(vortexP, 0.0, 1.0));
    gSw = 0.4 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    float stepL = (0.006 + 0.01 * clamp(fibreP, 0.0, 1.0));
    float adv = 0.02 * sceneTime + 0.15 * audioAdvance;
    // Streaming noise texture along the flow (phase moves along the lines).
    vec3 acc = vec3(0.0);
    float nacc = 0.0, wsum = 0.0;
    vec2 xf = p, xb = p;
    float fine = 120.0 + 200.0 * rough;
    for (int i = 0; i < 16; ++i) {
        float w = 1.0 - float(i) / 16.0;
        vec2 vf = normalize(flowAt(xf) + 1e-4);
        vec2 vb = normalize(flowAt(xb) + 1e-4);
        xf += vf * stepL;
        xb -= vb * stepL;
        acc += (imgLod(xf * 0.5 + 0.5 - vec2(adv, 0.0), 2.0) + imgLod(xb * 0.5 + 0.5 - vec2(adv, 0.0), 2.0)) * w;
        nacc += (noise2(xf * fine) + noise2(xb * fine)) * w;       // smooth noise: no cell grid
        wsum += 2.0 * w;
    }
    vec3 photo = acc / wsum;
    float fibre = nacc / wsum;                                 // LIC of white noise: threads along the flow
    fibre = (fibre - 0.5) * 4.0 + 0.5;
    vec3 silk = mix(vec3(0.85, 0.88, 0.95), vec3(1.0, 0.85, 0.55), mode);
    vec3 col = mix(silk * luma(photo) * 1.4, photo * 1.2, 0.35 + 0.5 * swell);
    col *= 0.6 + 0.6 * clamp(fibre, 0.0, 1.0);
    // Sheen along the threads: brighter where the flow faces a light direction.
    vec2 v = normalize(flowAt(p) + 1e-4);
    float sheen = pow(abs(dot(v, normalize(vec2(0.6, 0.8)))), 12.0);
    vec3 gc = glowColour(photo, p, hueP * 0.159);
    col += mix(vec3(1.0), gc, 0.3) * sheen * (0.08 + 0.3 * clamp(sheenP, 0.0, 1.0)) * (1.0 + 1.5 * kick) * (0.5 + fibre);
    finish(col);
}
