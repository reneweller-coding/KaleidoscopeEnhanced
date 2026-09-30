//@doc
 * @brief TEXTURE EMBER BED: looking down into a bed of glowing embers -- the
 * photograph becomes the coals: its bright parts glow orange-white hot, its
 * dark parts are black charred crust with fine glowing cracks, and waves of
 * heat breathe across the bed so the glow swells and ebbs region by region,
 * while round sparks rise and drift away, and heat shimmer wavers above.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the heat waves roll across the bed (integrated, jump-free)
 *   audioBass       -> the glow swells (light)
 *   audioSpread     -> how much of the bed is hot
 *   audioRoughness  -> the heat shimmer
 *   audioHigh       -> sparks (light)
 *   audioMode       -> temperature: deep red in minor, yellow-white in major (slow blend)
 *
 * Knobs: heatP (overall heat), crackP (crack network), sparksP, hueP.
//@params heatP crackP sparksP
//@audio audioBass audioSpread audioRoughness audioHigh audioMode
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 sh = 0.004 * rough * vec2(sin(p.y * 50.0 + sceneTime * 3.0), cos(p.x * 45.0 - sceneTime * 2.6));
    vec2 uv = p * 0.8 + 0.5 + vec2(0.003, -0.002) * sceneTime + sh;
    float lum = luma(imgLod(uv, 1.5));
    float avg = luma(imgLod(uv, 6.0));
    // Heat waves breathing across the bed.
    float wave = 0.5 + 0.5 * sin(dot(p, vec2(2.1, 1.3)) + fbm3(p * 2.0) * 3.0 - 0.3 * sceneTime - 2.0 * audioAdvance);
    // Coals: lumps (a soft noise of pieces) whose hot cores follow the photo's
    // bright parts; between the lumps black ash.
    float lumps = smoothstep(0.35, 0.7, fbm(p * 5.0 + 3.0));
    float heat = clamp((lum - avg) * 1.5 + lumps * 0.7 - 0.25 + 0.2 * clamp(heatP, 0.0, 1.0) + 0.15 * clamp(audioSpread, 0.0, 1.0), 0.0, 1.0);
    heat *= 0.6 + 0.6 * wave;
    heat *= 0.8 + 0.5 * bass;
    // Cracks in the crust glow even where it is dark.
    float e = texEdge(uv, 2.0);
    float crack = smoothstep(0.4, 0.9, e) * clamp(crackP, 0.0, 1.0) * (0.5 + 0.5 * wave);
    // Blackbody-ish ramp.
    float mode = clamp(audioMode, 0.0, 1.0);
    float t = clamp(heat * (0.8 + 0.4 * mode) + crack * 0.5, 0.0, 1.3);
    vec3 col = mix(vec3(0.02, 0.012, 0.01), vec3(0.55, 0.05, 0.0), smoothstep(0.1, 0.35, t));
    col = mix(col, vec3(1.0, 0.35, 0.03), smoothstep(0.35, 0.65, t));
    col = mix(col, vec3(1.0, 0.8, 0.35), smoothstep(0.65, 0.95, t));
    col = mix(col, vec3(1.0, 0.97, 0.85), smoothstep(0.95, 1.25, t));
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.5, 0.08);
    // The charred crust shows the photo's texture where cool.
    col += imgLod(uv, 0.5) * 0.05 * (1.0 - smoothstep(0.1, 0.4, t));
    col *= 1.3;
    // Sparks: round, rising and drifting, fading as they cool.
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = p * (18.0 + 10.0 * fl) + vec2(sin(sceneTime * 0.3 + fl) * 0.5, -sceneTime * (1.5 + fl));
        vec2 gi = floor(g), gf = fract(g);
        vec2 gc = 0.3 + 0.4 * hash22(gi + fl);
        float has = step(1.0 - 0.1 * clamp(sparksP, 0.0, 1.0) - 0.04 * hi, hash21(gi + fl * 7.0));
        float life = fract(hash21(gi + 3.0) + sceneTime * 0.2);
        col += vec3(1.0, 0.6, 0.2) * smoothstep(0.12, 0.0, length(gf - gc)) * has * (1.0 - life) * (0.8 + 1.2 * hi);
    }
    finish(col);
}
