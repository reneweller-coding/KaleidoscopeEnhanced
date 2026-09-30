//@doc
 * @brief TEXTURE TIDE POOLS: looking down into rock pools at low tide --
 * the photograph is the rocky shore, and in its hollows clear water
 * stands in pools, rippling gently in the breeze so the rock and pebbles
 * at their bottoms wobble, caustic light nets dancing across them, bits of
 * seaweed swaying; as the tide slowly rises and falls, the pools grow and
 * shrink along the rock's contours.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the ripples and the tide (integrated, jump-free)
 *   audioSpread     -> how high the tide stands
 *   audioBass       -> the caustics brighten (light)
 *   audioMode       -> the water: cold green in minor, tropical turquoise in major
 *   audioRoughness  -> breeze on the water
 *   audioSwell      -> the wet sheen on the rock (slow)
 *
 * Knobs: poolP (pool depth), causticP (caustic strength), rockP (rock relief), hueP.
//@params poolP causticP rockP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    float T = 0.3 * sceneTime + 2.0 * audioAdvance;
    // Rock height from the photo (broad) with detail.
    float hB = luma(imgK(uv, 4.0));
    float hD = luma(imgK(uv, 1.5));
    float H = hB * 0.8 + hD * 0.2 * (0.5 + clamp(rockP, 0.0, 1.0));
    // Tide level.
    float tide = 0.35 + 0.2 * clamp(audioSpread, 0.0, 1.0) + 0.05 * sin(0.03 * sceneTime);
    float depth = tide - H;
    float water = smoothstep(-0.005, 0.01, depth);
    // Rock shading.
    float e = 1.0 / 256.0;
    vec2 g = vec2(luma(imgK(uv + vec2(e, 0.0), 4.0)) - luma(imgK(uv - vec2(e, 0.0), 4.0)),
                  luma(imgK(uv + vec2(0.0, e), 4.0)) - luma(imgK(uv - vec2(0.0, e), 4.0))) / (2.0 * e);
    vec3 n = normalize(vec3(-g * 0.02 * (0.5 + clamp(rockP, 0.0, 1.0)), 1.0));
    vec3 L = normalize(vec3(-0.5, 0.6, 0.7));
    float diff = max(dot(n, L), 0.0);
    vec3 rock = imgK(uv, 0.6) * (0.3 + 0.8 * diff);
    rock += vec3(1.0) * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 20.0) * (0.05 + 0.3 * swell) * smoothstep(0.08, 0.0, abs(depth));   // wet rim
    // Water: ripples refract the bottom.
    vec2 rip = vec2(noise2(p * 12.0 + vec2(T, 0.0)) - 0.5, noise2(p * 12.0 + vec2(0.0, T) + 5.0) - 0.5) * (0.004 + 0.012 * rough);
    vec3 bottom = imgK(uv + rip * (1.0 + depth * 8.0), 1.0 + depth * 4.0);
    vec3 wc = mix(vec3(0.3, 0.55, 0.45), vec3(0.2, 0.75, 0.8), mode);
    float d2 = clamp(depth * (2.0 + 4.0 * clamp(poolP, 0.0, 1.0)), 0.0, 1.0);
    vec3 pool = mix(bottom, bottom * wc * 1.2, d2) * (1.0 - 0.4 * d2);
    // Caustics on the bottom.
    vec2 cq = p * 7.0;
    float c1 = fbm3(cq + vec2(T * 0.4, 0.0) + rip * 30.0);
    float c2 = fbm3(cq * 1.3 - vec2(0.0, T * 0.35) + 3.0);
    float caus = pow(max(0.0, 1.0 - abs(c1 - c2) * 2.5), 8.0);
    pool += wc * caus * (0.15 + 0.5 * clamp(causticP, 0.0, 1.0)) * (0.6 + 0.8 * bass) * (1.0 - d2 * 0.5);
    // Seaweed fronds: swaying dark wisps in the deeper parts.
    float weed = smoothstep(0.55, 0.75, fbm3(vec2(p.x * 8.0 + 0.3 * sin(T + p.y * 6.0), p.y * 3.0))) * smoothstep(0.05, 0.15, depth);
    pool = mix(pool, pool * vec3(0.4, 0.6, 0.3), weed * 0.6);
    vec3 col = mix(rock, pool, water);
    col = mix(col, col * glowColour(imgK(uv, 6.0), p, hueP * 0.159) * 1.3, 0.05);
    finish(col);
}
