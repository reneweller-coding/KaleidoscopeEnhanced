//@doc
 * @brief HONEY FOLD: a thick stream of honey falling onto itself, seen close
 * and backlit -- the viscous rope coils and folds into loops on a growing
 * mound, the golden light shining through it, bright where it is thin and
 * deep amber where it is thick, with glossy highlights along every fold and
 * tiny air bubbles caught inside.  Many ropes side by side fill the frame,
 * each coiling at its own rhythm, so the whole picture is an endless
 * golden weave in motion.  The honey's tint follows the photo's warm tones.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the coiling (integrated, jump-free)
 *   audioSpread     -> rope thickness
 *   audioRoughness  -> the coils wobble
 *   audioBass       -> the backlight (light)
 *   audioHigh       -> the glints on the folds (light)
 *   audioMode       -> pale acacia honey in major, dark buckwheat in minor
 *
 * Knobs: ropesP (how many ropes), coilP (coil size), bubbleP, hueP.
//@params ropesP coilP bubbleP
//@audio audioSpread audioRoughness audioBass audioHigh audioMode
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.4 * audioAdvance;
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 thin = mix(vec3(1.0, 0.72, 0.22), vec3(1.0, 0.88, 0.5), mode);
    vec3 thick = mix(vec3(0.3, 0.09, 0.01), vec3(0.6, 0.3, 0.04), mode);
    vec3 phc = imgLod(p * 0.3 + 0.5, 6.0);
    if (satOf(phc) > 0.25) thin = mix(thin, hsv2rgb(vec3(hue_of(phc), 0.6, 1.0)), 0.2);
    // Folds of a viscous sheet: a domain-warped field, folded over itself
    // (the absolute value makes the creases), creeping slowly.
    float sc = 1.2 + 1.5 * clamp(coilP, 0.0, 1.0);
    vec2 q = p * sc;
    vec2 w = vec2(fbm3(q * 0.7 + vec2(T, 0.0)), fbm3(q * 0.7 + vec2(0.0, -T) + 5.0));
    q += (1.2 + 0.4 * rough) * (w - 0.5);
    float n = fbm(q * (0.9 + 0.6 * clamp(ropesP, 0.0, 1.0)) + vec2(0.0, T * 0.5));
    float fold = 1.0 - abs(n * 2.0 - 1.0);                       // creases where n = 0.5
    float thickness = (0.4 + 1.8 * pow(fold, 2.0)) * (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    // Slope of the surface for the gloss.
    float e = 0.01;
    float nx = fbm(( (p + vec2(e, 0.0)) * sc + (1.2 + 0.4 * rough) * (w - 0.5)) * (0.9 + 0.6 * clamp(ropesP, 0.0, 1.0)) + vec2(0.0, T * 0.5));
    float ny = fbm(( (p + vec2(0.0, e)) * sc + (1.2 + 0.4 * rough) * (w - 0.5)) * (0.9 + 0.6 * clamp(ropesP, 0.0, 1.0)) + vec2(0.0, T * 0.5));
    vec2 g = vec2(1.0 - abs(nx * 2.0 - 1.0) - fold, 1.0 - abs(ny * 2.0 - 1.0) - fold) / e;
    vec3 nrm = normalize(vec3(-g * 0.02, 1.0));
    // Backlight through honey (Beer-Lambert), plus the gloss of the surface.
    vec3 col = mix(thin * 1.5, thick, 1.0 - exp(-thickness * 1.2)) * (0.7 + 0.6 * bass);
    vec3 L = normalize(vec3(-0.4, 0.5, 1.0));
    float spec = pow(max(dot(reflect(-L, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
    col += vec3(1.0, 0.95, 0.85) * spec * (0.3 + 0.9 * hi);
    // Air bubbles caught in the honey: round, bright-rimmed.
    vec2 bq = q * 6.0, bi = floor(bq), bf = fract(bq);
    vec2 bc = 0.3 + 0.4 * hash22(bi);
    float br = 0.06 + 0.1 * hash21(bi + 3.0);
    float bub = step(1.0 - 0.12 * clamp(bubbleP, 0.0, 1.0), hash21(bi + 7.0));
    float bd = length(bf - bc);
    col = mix(col, col * 1.5 + 0.1, bub * smoothstep(br, br * 0.7, bd) * 0.5);
    col += vec3(1.0) * bub * smoothstep(0.02, 0.0, abs(bd - br * 0.85)) * 0.3;
    finish(col);
}
