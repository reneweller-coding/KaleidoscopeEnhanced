//@doc
 * @brief LINOCUT GOUGE FLOW: linocut: the photo as cuts of a gouge that follow the lines of the flow, with burr and omissions; the print changes between positive and negative.  The lines are the contour lines of the photo's smoothed brightness (so they follow the shapes), their width follows the darkness,
 * a wobble breaks them like a hand-cut line, and the sheet fades from positive to negative with the phrase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the print changes between positive and negative (periodic)
 *   audioSwell     -> the width of the cuts
 *
 * Knobs: sizeP (the number of lines), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5 + 0.02 * vec2(sin(0.04 * sceneTime), cos(0.03 * sceneTime));
    vec3 c = imgLod(uv, 0.8);
    float l = luma(imgLod(uv, 3.0));
    float N = 12.0 + 22.0 * clamp(sizeP, 0.0, 1.0);
    float s = l * N + 1.2 * (fbm(p * 7.0 + 0.02 * sceneTime) - 0.5) + 0.25 * sin(p.x * 9.0 + p.y * 5.0);
    float fr = abs(fract(s) - 0.5) * 2.0;
    float dark = clamp(1.0 - luma(c), 0.0, 1.0);
    float w = (0.15 + 0.6 * dark) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float cut = 1.0 - smoothstep(w - 0.1, w, fr);
    float burr = smoothstep(0.55, 0.75, noise2(p * 140.0));
    float gap = smoothstep(0.82, 0.92, noise2(vec2(floor(s) * 7.0, p.x * 6.0 + p.y * 3.0)));
    float ink = cut * (0.8 + 0.2 * burr) * (1.0 - gap * 0.8);
    float neg = smoothstep(0.2, 0.8, 0.5 - 0.5 * cos(6.2831853 * audioPhrasePos));
    float v = mix(ink, 1.0 - ink, neg);
    vec3 paper = vec3(0.95, 0.93, 0.88) * (0.95 + 0.07 * noise2(p * 250.0));
    vec3 inkc = mix(vec3(0.05, 0.05, 0.07), c * 0.35, 0.3);
    vec3 col = mix(paper, inkc, v);
    col = mix(col, col * (0.6 + 0.6 * c), 0.35);
    finish(col * 1.05);
}
