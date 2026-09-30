//@doc
 * @brief TEXTURE UNDERWATER HAZE: drifting through open water beneath the
 * surface -- shafts of sunlight slant down through blue-green haze and
 * sway with the waves above, the rippled surface shimmering far overhead,
 * floating particles and tiny bubbles rising through the beams, and the
 * photograph looming faintly out of the haze as a reef or wreck in the
 * distance.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift and the rising bubbles (integrated, jump-free)
 *   audioSpread     -> the beams widen
 *   audioBass       -> the beams brighten (light)
 *   audioMode       -> the water: deep blue in minor, tropical turquoise in major
 *   audioHigh       -> the bubbles sparkle (light)
 *   audioSwell      -> the haze thickens (slow)
 *
 * Knobs: beamP (number of beams), particleP (particle density), reefP (photo in the haze), hueP.
//@params beamP particleP reefP
//@audio audioSpread audioBass audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 water = mix(vec3(0.02, 0.12, 0.3), vec3(0.03, 0.35, 0.4), mode);
    vec3 lightC = mix(vec3(0.6, 0.85, 1.0), vec3(0.7, 1.0, 0.9), mode);
    // Depth gradient (repeating softly so the plane is endless vertically).
    float depthG = 0.5 + 0.5 * sin(p.y * 1.2 + 1.0);
    vec3 col = water * (0.5 + 0.7 * depthG);
    // The reef in the haze.
    vec2 uv = p * 0.5 + 0.5 + vec2(0.005, 0.0) * sceneTime + vec2(0.03, 0.0) * audioAdvance;
    vec3 reef = imgLod(uv, 2.5);
    col = mix(col, reef * water * 3.0, (0.15 + 0.35 * clamp(reefP, 0.0, 1.0)) * (1.0 - 0.5 * swell) * smoothstep(0.2, 0.6, luma(reef)));
    // God rays: slanted beams swaying with the waves.
    float nb = 3.0 + 5.0 * clamp(beamP, 0.0, 1.0);
    float slant = 0.25;
    float x = p.x + p.y * slant;
    float sway = 0.05 * sin(0.4 * sceneTime + x * 2.0);
    float bw = 0.3 + 0.4 * clamp(audioSpread, 0.0, 1.0);
    float beams = 0.0;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float f = fbm3(vec2((x + sway) * nb * (1.0 + 0.5 * fk) + fk * 3.0, 0.2 * sceneTime + fk));
        beams += smoothstep(1.0 - bw * 0.5, 1.0, f + 0.35) / (1.0 + fk);
    }
    beams *= 0.5 + 0.5 * smoothstep(-0.6, 0.6, p.y);            // stronger near the surface
    col += lightC * beams * (0.25 + 0.4 * bass) * (1.0 - 0.4 * swell);
    // Surface shimmer at the top (repeats with the depth gradient).
    float surf = smoothstep(0.85, 1.0, depthG) * pow(max(0.0, fbm3(vec2(p.x * 6.0, 0.3 * sceneTime)) * 1.4 - 0.2), 3.0);
    col += lightC * surf * 0.5;
    // Haze.
    col = mix(col, water * 1.3, 0.2 + 0.3 * swell);
    // Particles and bubbles.
    float T = 0.1 * sceneTime + 0.6 * audioAdvance;
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = p * (25.0 + 20.0 * fl) + vec2(0.3 * sin(T + fl), -T * (2.0 + fl)) + fl * 7.0;
        vec2 gi = floor(g);
        vec2 c = 0.2 + 0.6 * hash22(gi + fl);
        float d = length(fract(g) - c);
        float on = step(hash21(gi + 5.0 + fl), 0.1 + 0.3 * clamp(particleP, 0.0, 1.0));
        float bubble = step(0.7, hash21(gi + 9.0));
        vec3 pc = bubble > 0.5 ? lightC * (smoothstep(0.18, 0.12, d) * smoothstep(0.06, 0.12, d) * 1.2 + smoothstep(0.08, 0.02, length(fract(g) - c - vec2(-0.04, 0.04))) * (0.4 + 1.2 * hi))
                               : lightC * 0.4 * smoothstep(0.1, 0.02, d);
        col += pc * on * (0.5 + beams) / (1.0 + fl * 0.5);
    }
    col = mix(col, col * glowColour(reef, p, hueP * 0.159) * 1.3, 0.05);
    finish(col);
}
