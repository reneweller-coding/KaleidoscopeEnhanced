//@doc
 * @brief TEXTURE FLOW PARTICLES: the photograph dissolved into a river of
 * light particles -- countless fine grains stream along the contours of
 * the texture (the flow runs across its brightness gradient, so it follows
 * the grain of wood, the rings of agate, the veins of marble), each grain
 * carrying the colour of the photo where it is, drawn as a short glowing
 * streak.  Denser streams gather where the texture has strong structure,
 * sparse drift fills the calm areas.  An endless field that mirrors
 * without seams; every photo gives its own current.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the streams' flow (integrated, jump-free)
 *   audioSpread     -> streak length: a wide spectrum draws long threads
 *   audioRoughness  -> turbulence mixed into the flow
 *   audioMode       -> the flow's sense of rotation leans (slow blend)
 *   audioHigh       -> the grains sparkle (light)
 *   audioSwell      -> particle density (slow)
 *
 * Knobs: scaleP (how close), densityP (grains), curlP (share of free
 * turbulence against the photo's own contours), hueP.
//@params scaleP densityP curlP
//@audio audioSpread audioRoughness audioMode audioHigh audioSwell
//@expr densityP = clamp(0.4 + 0.4*swell + 0.2*seed2, 0.0, 1.0)
//@body
float gCurl, gSc;

// The flow direction at uv: along the texture's contours (perpendicular to
// its luma gradient), blended with a slow curl-noise swirl.
vec2 flowDir(vec2 uv)
{
    vec2 g = texGrad(uv, 5.0);
    vec2 along = vec2(-g.y, g.x);
    float ga = length(along);
    float e = 0.02;
    vec2 cq = uv * 3.0 + 0.02 * sceneTime;
    float n1 = fbm3(cq + vec2(0.0, e)), n2 = fbm3(cq - vec2(0.0, e));
    float n3 = fbm3(cq + vec2(e, 0.0)), n4 = fbm3(cq - vec2(e, 0.0));
    vec2 curl = vec2(n1 - n2, n4 - n3) / (2.0 * e);
    vec2 dA = along / (ga + 1e-4), dC = curl / (length(curl) + 1e-4);
    // Where the photo has structure its contours rule; calm areas swirl freely.
    float w = gCurl * (1.0 - smoothstep(0.1, 0.8, ga));
    vec2 d = normalize(mix(dA, dC, w) + 1e-4);
    return d;
}

void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gSc = 0.6 + 0.9 * clamp(scaleP, 0.0, 1.0);
    gCurl = 0.2 + 0.5 * clamp(curlP, 0.0, 1.0) + 0.2 * clamp(audioRoughness, 0.0, 1.0);
    vec2 uv0 = p * gSc + 0.5 + vec2(0.006, 0.004) * sceneTime;

    // Line-integral: walk backward and forward along the flow, collecting
    // sparse round grains that slide along the streamline with time.
    float len = 0.0025 + 0.003 * clamp(audioSpread, 0.0, 1.0);
    float dens = 0.9 - 0.12 * clamp(densityP, 0.0, 1.0);
    float flow = 0.25 * sceneTime + 2.0 * audioAdvance;
    // Line integral convolution: fine noise averaged along the streamline,
    // both ways; a phase pulse travels along each line with the flow, so the
    // threads visibly stream.  Many thin threads, not a smear.
    float acc = 0.0, wsum = 0.0;
    vec2 uF = uv0, uB = uv0;
    for (int i = 0; i < 16; ++i) {
        float fi = float(i);
        float w = exp(-fi * fi / 90.0);
        uF += flowDir(uF) * len;
        uB -= flowDir(uB) * len;
        float nF = noise2(uF * 260.0);
        float nB = noise2(uB * 260.0);
        nF *= nF * nF; nB *= nB * nB;                        // sparse bright seeds
        // travelling pulse: phase along the line
        float pF = 0.5 + 0.5 * sin((flow - fi * 0.35) * 2.0);
        float pB = 0.5 + 0.5 * sin((flow + fi * 0.35) * 2.0);
        acc += w * (nF * pF + nB * pB);
        wsum += 2.0 * w;
    }
    float lic = acc / wsum;
    // The average of pulse-weighted noise sits near 0.25; stretch its spread.
    float lc = (lic - 0.07) * 9.0 + 0.4 * (clamp(densityP, 0.0, 1.0) - 0.5);
    float streak = smoothstep(0.0, 1.0, lc) * 1.5;

    // Colour from the photo (saturated where it has colour, a hue field where grey).
    vec3 photo = imgLod(uv0, 2.0);
    vec3 c = mix(photo * 1.2, glowColour(photo, uv0 * 1.5, hueP * 0.159) * 1.3, 0.5);
    vec3 col = photo * 0.08;
    col += c * streak * (0.9 + 0.6 * swell);
    col += vec3(1.0) * pow(clamp(streak, 0.0, 1.0), 3.0) * (0.15 + 0.6 * hi);
    finish(col);
}
