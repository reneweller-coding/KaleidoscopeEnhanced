//@doc
 * @brief CROSS HATCH PHOTO: the photograph as a living copperplate engraving
 * -- its tones are cut in layers of fine parallel lines: light areas get a
 * single sparse layer, darker ones a second layer across it, the darkest
 * three and four, each line swelling and thinning with the tone like an
 * engraver's burin; the lines bend gently along the picture's forms, and
 * the hatching directions slowly turn while the photo drifts.  Ink on
 * paper.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the photo drifts (integrated, jump-free)
 *   audioPhase      -> the hatch directions turn (integrated)
 *   audioSpread     -> contrast (how deep the dark layers go)
 *   audioKick       -> the lines brighten (light)
 *   audioMode       -> the paper: cool grey in minor, warm cream in major
 *   audioSwell      -> the photo's colour in the ink (slow)
 *
 * Knobs: lineP (line spacing), bendP (lines follow forms), zoomP, hueP.
//@params lineP bendP zoomP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.2, 0.8, clamp(audioMode, 0.0, 1.0));
    float z = 0.5 + 0.5 * clamp(zoomP, 0.0, 1.0);
    vec2 uv = p * z + 0.5 + vec2(0.004, 0.003) * sceneTime + vec2(0.02, 0.0) * audioAdvance;
    vec3 ph = imgLod(uv, 1.5);
    float tone = luma(ph);
    float contrast = 0.7 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float dark = clamp((0.55 - tone) * contrast + 0.45, 0.0, 1.0);
    float N = 90.0 + 90.0 * (1.0 - clamp(lineP, 0.0, 1.0));
    // Lines bend along the forms: a phase offset from the broad photo.
    float bend = 0.02 * clamp(bendP, 0.0, 1.0);
    float hb = luma(imgLod(uv, 4.5));
    float rot = 0.02 * sceneTime + 0.2 * audioPhase;
    float ink = 0.0;
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float ang = rot + fk * 0.785398 + (k > 1 ? 0.39 : 0.0);
        vec2 d = vec2(cos(ang), sin(ang));
        float x = (dot(p, d) + bend * hb * (1.0 + fk)) * N;
        float f = abs(fract(x) - 0.5) * 2.0;
        float px = fwidth(x) * 2.0 + 1e-4;
        // Layer k is active once the tone is dark enough; its lines swell with the darkness.
        float act = smoothstep(fk * 0.22, fk * 0.22 + 0.18, dark);
        float w = act * (0.15 + 0.55 * clamp((dark - fk * 0.22) / 0.4, 0.0, 1.0));
        float line = smoothstep(w + px, w - px, f) * step(0.001, w);
        // Break the lines slightly, like a hand-cut plate.
        line *= 0.85 + 0.15 * noise2(vec2(x * 0.05, dot(p, vec2(-d.y, d.x)) * 40.0));
        ink = max(ink, line);
    }
    // Where lines are finer than pixels, keep the tone instead of aliasing.
    float fine = smoothstep(0.4, 0.9, fwidth(dot(p, vec2(1.0, 0.0)) * N) * 2.0);
    ink = mix(ink, dark * 0.9, fine);
    vec3 lc = mix(vec3(1.0), glowColour(ph, p, hueP * 0.159), 0.2 + 0.6 * swell);
    vec3 paper = vec3(0.95, 0.93, 0.87) * (0.97 + 0.03 * noise2(p * 350.0));
    vec3 inkC = mix(vec3(0.06, 0.05, 0.08), lc * 0.3, 0.4 * swell);
    vec3 onPaper = mix(paper, inkC, ink);
    onPaper *= mix(vec3(0.9, 0.95, 1.05), vec3(1.04, 1.0, 0.94), mode);
    finish(onPaper);
}
