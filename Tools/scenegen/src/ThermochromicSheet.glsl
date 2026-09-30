//@doc
 * @brief THERMOCHROMIC SHEET: a sheet of heat-sensitive liquid-crystal foil
 * being warmed by invisible hands -- where warmth spreads the black foil
 * blooms into its rainbow sequence (deep red, gold, green, turquoise,
 * blue, violet) in concentric rings around each warm spot, the rings
 * drifting and spreading, cooling back to black at the edges; the heat
 * pattern follows the photograph's warm (bright) areas.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the warm spots wander (integrated, jump-free)
 *   audioSpread     -> the warmth spreads wider
 *   audioBass       -> a pulse of heat (light-level warmth, smoothed)
 *   audioMode       -> the foil's range: cool (green-blue) in minor, warm (red-gold) in major
 *   audioRoughness  -> the foil's crinkled texture
 *   audioSwell      -> the overall temperature (slow)
 *
 * Knobs: spotP (warm spots), ringP (colour band width), photoP (the photo's heat), hueP.
//@params spotP ringP photoP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
vec3 lcColour(float t)
{
    // Liquid-crystal sequence with rising temperature; black below and above.
    vec3 c = vec3(0.0);
    c = mix(c, vec3(0.6, 0.05, 0.02), smoothstep(0.05, 0.2, t));
    c = mix(c, vec3(0.95, 0.65, 0.05), smoothstep(0.2, 0.35, t));
    c = mix(c, vec3(0.15, 0.85, 0.2), smoothstep(0.35, 0.5, t));
    c = mix(c, vec3(0.05, 0.8, 0.8), smoothstep(0.5, 0.65, t));
    c = mix(c, vec3(0.1, 0.25, 0.95), smoothstep(0.65, 0.8, t));
    c = mix(c, vec3(0.4, 0.1, 0.6), smoothstep(0.8, 0.92, t));
    c = mix(c, vec3(0.05, 0.02, 0.1), smoothstep(0.92, 1.05, t));
    return c;
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    // Heat: the photo's warmth plus wandering warm spots.
    float heat = clamp(photoP, 0.0, 1.0) * 0.6 * luma(imgLod(uv, 4.0));
    float nS = 2.0 + 4.0 * clamp(spotP, 0.0, 1.0);
    float spread = 0.25 + 0.3 * clamp(audioSpread, 0.0, 1.0);
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        float on = smoothstep(fi - 0.5, fi + 0.5, nS - 0.5);
        if (on <= 0.0) break;
        vec2 c = vec2(0.8 * sin(T * (0.7 + 0.2 * fi) + fi * 2.1), 0.45 * cos(T * (0.5 + 0.3 * fi) + fi * 1.3));
        heat += exp(-dot(p - c, p - c) / (spread * spread)) * on * (0.7 + 0.3 * sin(0.3 * sceneTime + fi));
    }
    heat = heat * (0.5 + 0.4 * swell + 0.2 * bass);
    heat = 0.9 * (1.0 - exp(-heat * 1.3));                    // saturates below the black-out end of the scale
    // Band width: squeeze or stretch the temperature scale.
    float t = heat * (0.85 + 0.2 * clamp(ringP, 0.0, 1.0)) + mix(-0.05, 0.05, mode);
    t += 0.06 * clamp(ringP, 0.0, 1.0) * sin(heat * 25.0);        // finer rings
    // Crinkled foil: small variations of the local temperature and a sheen.
    float cr = fbm3(p * 25.0);
    t += (0.02 + 0.06 * rough) * (cr - 0.5);
    vec3 col = lcColour(t);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.08);
    col += vec3(1.0) * pow(max(0.0, cr - 0.55) * 2.2, 4.0) * 0.12;
    finish(col * 1.1);
}
