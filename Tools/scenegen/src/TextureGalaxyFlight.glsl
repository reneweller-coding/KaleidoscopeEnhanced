//@doc
 * @brief TEXTURE GALAXY FLIGHT: drifting over the face of a spiral galaxy --
 * the photograph wound into the galaxy's arms (its colours become the
 * star clouds, dust lanes darken the inner edges of the arms), a bright
 * yellow core, blue star-forming knots along the arms, pink nebulae,
 * countless faint stars; the galaxy turns slowly and we glide across it,
 * other galaxies drifting in the distance.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the galaxy turns (integrated, jump-free)
 *   audioSpread     -> the arms open wider
 *   audioKick       -> the star-forming knots flare (light)
 *   audioMode       -> palette: cool blue galaxy in minor, warm golden in major (tint)
 *   audioHigh       -> the stars twinkle (light)
 *   audioSwell      -> the core glow (slow)
 *
 * Knobs: armsP (arm count), dustP (dust lanes), photoP (photo colours), hueP.
//@params armsP dustP photoP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
vec3 galaxy(vec2 q, float spin, float arms, float wind, float dust, float photoK, float mode, float kick)
{
    float r = length(q) + 1e-4;
    float a = atan(q.y, q.x);
    float lr = log(r);
    // Arm phase: logarithmic spiral, integer arm count (seamless).
    float ph = arms * (a - wind * lr - spin);
    float armI = 0.5 + 0.5 * cos(ph);
    vec2 u = vec2(cos(a - wind * lr - spin), sin(a - wind * lr - spin));
    float clouds = fbm(u * 3.0 + vec2(lr * 4.0, 0.0));
    float disk = exp(-r * 2.2);
    float arm = pow(armI, 2.0) * (0.6 + 0.6 * clouds) * disk;
    // Dust lane on the inner (leading) edge of each arm.
    float lane = pow(0.5 + 0.5 * cos(ph + 0.9), 6.0) * dust * smoothstep(0.05, 0.25, r) * disk;
    vec2 uv = u * (0.2 + 0.25 * r) + 0.5;
    vec3 pc = imgLod(uv, 2.5);
    vec3 starC = mix(mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.85, 0.6), mode), glowColour(pc, u, hueP * 0.159), photoK);
    vec3 col = starC * arm * 1.8;
    col *= 1.0 - 0.8 * lane;
    // Knots: blue star-forming regions and pink nebulae along the arms.
    float knot = smoothstep(0.7, 0.9, fbm3(u * 8.0 + vec2(lr * 12.0, 1.0))) * pow(armI, 4.0) * disk;
    col += mix(vec3(0.5, 0.7, 1.0), vec3(1.0, 0.4, 0.6), step(0.5, fbm3(u * 3.0 + 5.0))) * knot * (1.0 + 2.0 * kick);
    // Core.
    col += mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.8, 0.5), mode) * exp(-r * 14.0) * 1.5;
    return col;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float spin = 0.05 * sceneTime + 0.35 * audioAdvance;
    float arms = floor(2.0 + 2.0 * clamp(armsP, 0.0, 1.0));
    float wind = 1.2 + 0.8 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float dust = 0.3 + 0.7 * clamp(dustP, 0.0, 1.0);
    float photoK = clamp(photoP, 0.0, 1.0) * 0.7;
    // Glide: the main galaxy drifts in a slow loop.
    vec2 c = 0.25 * vec2(sin(0.013 * sceneTime), cos(0.011 * sceneTime));
    vec2 q = (p - c) * 1.2;
    q.y *= 1.3;                                                 // inclined disk
    vec3 col = galaxy(q, spin, arms, wind, dust, photoK, mode, kick) * (0.8 + 0.5 * swell);
    // Distant galaxies on a sparse grid.
    vec2 g = p * 2.0 + 7.0;
    vec2 gi = floor(g);
    vec2 gc = gi + 0.5 + 0.3 * (hash22(gi) - 0.5);
    if (hash21(gi + 3.0) < 0.35) {
        vec2 lq = (g - gc) * 5.0;
        lq = rot2(hash21(gi) * 6.28) * lq;
        lq.y *= 1.0 + 2.0 * hash21(gi + 4.0);
        col += galaxy(lq, spin * 1.3 + hash21(gi) * 6.0, 2.0, 1.5, 0.5, photoK, mode, 0.0) * 0.25;
    }
    // Stars: round, twinkling, in two layers.
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 sg = p * (60.0 + 50.0 * fl) + fl * 11.0 + vec2(0.01, 0.0) * sceneTime;
        vec2 si = floor(sg);
        float d = length(fract(sg) - 0.25 - 0.5 * hash22(si));
        float on = step(0.9, hash21(si + fl));
        float tw = 0.7 + 0.3 * sin(sceneTime * (1.0 + 2.0 * hash21(si)) + hash21(si + 1.0) * 30.0) * (0.3 + hi);
        col += vec3(0.85, 0.9, 1.0) * on * smoothstep(0.2, 0.02, d) * tw * (0.5 - 0.2 * fl);
    }
    finish(col);
}
