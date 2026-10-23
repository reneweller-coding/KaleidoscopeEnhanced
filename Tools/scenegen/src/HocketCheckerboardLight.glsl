//@doc
 * @brief HOCKET CHECKERBOARD LIGHT: the hocket: a melody is divided between voices, each plays only single notes; the picture is a chessboard on which one half of the squares carries the photo and the other half waits, and the halves swap in time.  The waiting squares show only the photo's dark,
 * blurred echo; the swap passes smoothly through the phrase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> which half is lit; a smooth cross-fade over the phrase (periodic)
 *   audioAdvance   -> the board drifts slowly (integrated)
 *
 * Knobs: sizeP (the size of the squares), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.1 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec2 off = 0.05 * vec2(sin(0.02 * audioAdvance + 0.03 * sceneTime), cos(0.017 * audioAdvance));
    vec2 g = (p + off) / S;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float par = mod(ci.x + ci.y, 2.0);
    float ph = 6.2831853 * audioPhrasePos;
    float a = smoothstep(-0.5, 0.5, sin(ph));
    float lit = par < 0.5 ? a : 1.0 - a;
    vec3 c = imgLod(p * 0.85 + 0.5, 0.5);
    vec3 echo = imgLod(p * 0.85 + 0.5, 3.2) * 0.22;
    float edge = smoothstep(0.0, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec3 col = mix(echo, c * 1.1, lit);
    finish(col * (0.5 + 0.5 * edge) * 1.1);
}
