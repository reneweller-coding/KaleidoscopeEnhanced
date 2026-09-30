//@doc
 * @brief TEXTURE SMOKE CHAMBER: a dark hall filled with slowly rolling smoke,
 * cut by broad beams of projected light -- each beam carries the
 * photograph like a gobo, so its rays are patterned with the picture's
 * light and shadow and coloured with its colours; the beams sweep slowly
 * through the smoke, cross each other and mix, and the smoke only shows
 * where light catches it, in layered billows at different depths.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the smoke rolls (integrated, jump-free)
 *   audioPhase      -> the beams sweep (integrated)
 *   audioSpread     -> beam width
 *   audioBass       -> the beams brighten (light)
 *   audioMode       -> the haze colour: cold in minor, warm in major
 *   audioSwell      -> smoke density (slow)
 *
 * Knobs: beamsP (number of beams), goboP (how strongly the photo patterns the rays), smokeP, hueP.
//@params beamsP goboP smokeP
//@audio audioPhase audioSpread audioBass audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    // Smoke: layered billows at different depths drifting at different speeds.
    float dens = 0.0;
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float sc = 1.2 + 0.7 * fk;
        vec2 o = vec2(T * (1.0 + 0.4 * fk), -0.3 * T) + fk * 3.7;
        vec2 w = vec2(fbm3(p * sc * 0.6 + o * 0.5), fbm3(p * sc * 0.6 - o * 0.5 + 4.0));
        dens += smoothstep(0.42, 0.75, fbm(p * sc + o + 1.2 * w)) / (1.0 + fk * 0.4);
    }
    dens *= (0.45 + 0.4 * clamp(smokeP, 0.0, 1.0)) * (0.6 + 0.7 * swell);
    float nB = floor(3.0 + 3.0 * clamp(beamsP, 0.0, 1.0));
    float bw = 0.07 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    vec3 light = vec3(0.0);
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        float on = smoothstep(fi - 0.5, fi + 0.5, nB - 0.5);
        if (on <= 0.0) break;
        // Each beam: a source off-screen, direction sweeping slowly.
        float side = mod(fi, 2.0) * 2.0 - 1.0;
        vec2 src = vec2(side * (1.2 + 0.2 * hash11(fi)), 0.9 - 0.35 * fi / 6.0 * 2.0);
        float sweep = 0.35 * sin(0.05 * sceneTime * (0.7 + 0.5 * hash11(fi + 2.0)) + 0.4 * audioPhase + fi * 1.9);
        vec2 dir = normalize(vec2(-side, -0.45 + sweep));
        vec2 rel = p - src;
        float along = dot(rel, dir);
        float across = dot(rel, vec2(-dir.y, dir.x));
        float angle = across / max(along, 0.05);                   // position inside the cone
        float cone = smoothstep(bw, bw * 0.5, abs(angle)) * step(0.0, along);
        // Gobo: the photo across the cone makes the rays.
        vec2 guv = vec2(0.5 + angle / bw * 0.45, 0.5 + 0.2 * sin(0.02 * sceneTime + fi)) + hash22(vec2(fi, 3.0)) * 0.3;
        vec3 g = imgLod(guv, 2.5);
        float ray = mix(1.0, 0.2 + 1.3 * smoothstep(0.1, 0.8, luma(g)), clamp(goboP, 0.0, 1.0));
        vec3 bc = glowColour(imgLod(guv, 4.0), vec2(fi, 0.0), hueP * 0.159 + fi * 0.13);
        bc = mix(bc, g / max(luma(g), 0.1) * 0.5, 0.35 * clamp(goboP, 0.0, 1.0));
        float fall = 1.0 / (1.0 + along * along * 0.5);
        light += bc * cone * ray * fall * on * (0.5 + 0.5 * bass);
    }
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 haze = mix(vec3(0.02, 0.025, 0.04), vec3(0.04, 0.025, 0.02), mode);
    vec3 col = haze * (0.5 + dens) + light * (0.015 + 1.6 * pow(dens, 1.5));
    // A faint floor glow where the beams land.
    col += light * 0.02;
    finish(col);
}
