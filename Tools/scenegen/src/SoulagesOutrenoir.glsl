//@doc
 * @brief SOULAGES OUTRENOIR: black beyond black, after Pierre Soulages -- a
 * surface of thick black paint combed and ridged in broad strokes, and all
 * that is visible is LIGHT on black: the grooves and ridges catch a moving
 * light so that bands of sheen slide across the black, silvery, bluish,
 * warm, while the paint itself stays black.  The strokes follow the
 * photograph's structure (its gradients set the direction of the combing),
 * so every photo gives its own relief.  The light never stops moving.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light's path (integrated, jump-free)
 *   audioSpread     -> comb spacing (wide spectrum = finer grooves)
 *   audioRoughness  -> the ridges get rougher
 *   audioMode       -> the sheen warms in major
 *   audioSwell      -> sheen strength (slow)
 *   audioHigh       -> sparkle on the sharpest crests (light)
 *
 * Knobs: grooveP (groove depth), bandP (width of the stroke bands),
 * sheenP (glossiness), hueP.
//@params grooveP bandP sheenP
//@audio audioPhase audioSpread audioRoughness audioMode audioSwell audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.8 + 0.5 + vec2(0.003, 0.002) * sceneTime;
    // Broad strokes: bands of combed paint. Each band has its own direction;
    // the bands meet in soft seams (cross-faded), never in hard cuts.  The
    // photo's gradient bends the combing where it has a clear direction.
    vec2 g = texGrad(uv, 6.0);
    float bw = 0.3 + 0.35 * clamp(bandP, 0.0, 1.0);
    float by = (p.y + 0.35 * fbm3(p * 0.9)) / bw;
    float b0 = floor(by), bf = fract(by);
    float gm = smoothstep(0.3, 2.0, length(g));
    vec2 dirPhoto = normalize(vec2(-g.y, g.x) + 1e-4);
    float freq = 16.0 + 18.0 * clamp(audioSpread, 0.0, 1.0);
    float hsum = 0.0; vec2 gsum = vec2(0.0); float wsum = 0.0;
    for (int k = 0; k < 2; ++k) {
        float band = b0 + float(k);
        float wgt = (k == 0) ? smoothstep(0.85, 0.5, bf) : smoothstep(0.5, 0.85, bf);
        float bandAng = (hash11(band * 3.1) - 0.5) * 1.4;
        vec2 dir = normalize(vec2(cos(bandAng), sin(bandAng)) + dirPhoto * 0.5 * gm);
        vec2 nrm = vec2(-dir.y, dir.x);
        float ph = dot(p, nrm) * freq + 3.0 * fbm3(p * 2.0 + band) + 1.5 * rough * noise2(p * 30.0);
        hsum += wgt * sin(ph);
        gsum += wgt * nrm * cos(ph);
        wsum += wgt;
    }
    gsum /= max(wsum, 1e-3);
    // In the seams the combing flattens out (paint pushed together).
    gsum *= 0.4 + 0.6 * abs(bf - 0.5) * 2.0;
    // Slope of the relief (the derivative across the grooves).
    float depth = 0.3 + 0.7 * clamp(grooveP, 0.0, 1.0);
    vec3 n = normalize(vec3(gsum * depth * 0.8, 1.0));
    // The moving light.
    float lp = 0.06 * sceneTime + 0.3 * audioPhase;
    vec3 L = normalize(vec3(cos(lp), sin(lp * 0.7), 1.2));
    float glossK = 6.0 + 14.0 * clamp(sheenP, 0.0, 1.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), glossK);
    float sheenB = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
    vec3 sheenC = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), clamp(audioMode, 0.0, 1.0));
    sheenC = mix(sheenC, glowColour(imgLod(uv, 6.0), p, hueP * 0.159), 0.08);
    vec3 col = vec3(0.012, 0.012, 0.014);
    col += sheenC * (spec * 0.9 + sheenB * 0.18) * (0.7 + 0.6 * swell);
    vec2 gq = p * 220.0, gcell = floor(gq);
    float glint = step(0.985, hash21(gcell)) * smoothstep(0.35, 0.1, length(fract(gq) - 0.5));
    col += vec3(1.0) * spec * glint * (0.2 + 1.0 * hi);
    finish(col);
}
