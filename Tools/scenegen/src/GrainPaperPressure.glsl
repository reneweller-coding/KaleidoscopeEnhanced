//@doc
 * @brief GRAIN PAPER PRESSURE: embossing: the photo as a raised surface on paper whose height follows the brightness; a raking light runs over it and draws out the paper fibres, so the picture lies pressed
 * into the sheet, its colours subdued under the shade.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light's direction turns (integrated)
 *   audioSwell      -> the pressure
 *
 * Knobs: pressP (the base pressure), fibreP (how strong the fibres are), hueP.
//@params pressP fibreP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.1 * sceneTime + 0.8 * audioPhase;
    float e = 0.004;
    float H0 = luma(imgLod(uv, 1.8));
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), 1.8)) - luma(imgLod(uv - vec2(e, 0.0), 1.8)),
                  luma(imgLod(uv + vec2(0.0, e), 1.8)) - luma(imgLod(uv - vec2(0.0, e), 1.8))) / (2.0 * e);
    float fib = fbm(p * 260.0) - 0.5 + 0.5 * (noise2(p * vec2(30.0, 700.0)) - 0.5);
    vec2 fg = vec2(fbm(p * 260.0 + vec2(0.01, 0.0)) - fbm(p * 260.0 - vec2(0.01, 0.0)), fbm(p * 260.0 + vec2(0.0, 0.01)) - fbm(p * 260.0 - vec2(0.0, 0.01))) * 8.0;
    float press = (0.03 + 0.09 * clamp(pressP, 0.0, 1.0)) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    vec3 n = normalize(vec3(-g * press * 8.0 - fg * (0.02 + 0.08 * clamp(fibreP, 0.0, 1.0)), 1.0));
    vec3 L = normalize(vec3(cos(0.4 * t) * 0.8, sin(0.4 * t) * 0.8, 0.45));
    float lam = clamp(dot(n, L), 0.0, 1.0);
    vec3 col = imgLod(uv, 0.5) * (0.35 + 0.8 * lam) * (0.94 + 0.12 * fib);
    finish(col * 1.1);
}
