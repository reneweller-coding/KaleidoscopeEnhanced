//@doc
 * @brief AIRY PIXEL RESOLUTION: the photo as a grid of Airy discs: every cell shows the colour of the photo at its centre as a bright disc with
 * diffraction rings.  The aperture opens and closes: with a small aperture the picture is a carpet of broad overlapping discs, with a
 * large one it clears up into sharp points.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the aperture
 *   audioAdvance    -> the grid drifts slowly (integrated)
 *
 * Knobs: cellP (the grid's size), hueP.
//@params cellP
//@audio audioSwell
//@body
/**  The Airy pattern (2 J1(x) / x)^2.
 *
 * @param x  The argument. (in)
 *
 * @return
 *   The intensity, 1 at the centre.
 **/
float airyDisc(float x)
{
    x = abs(x);
    if (x < 2.0) { float y = x * x; float j = 0.5 - y / 16.0 + y * y / 384.0; return 4.0 * j * j; }
    float j1 = sqrt(2.0 / (3.14159265 * x)) * cos(x - 2.3561945);
    return 4.0 * j1 * j1 / (x * x);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.05 + 0.6 * audioAdvance;
    float N = 16.0 + 24.0 * (1.0 - clamp(cellP, 0.0, 1.0));
    vec2 q = p * N + vec2(0.3 * sin(t), 0.2 * cos(t * 1.3));
    vec2 g = floor(q);
    float k = 2.0 + 9.0 * clamp(audioSwell, 0.0, 1.0);
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 c = g + vec2(float(i), float(j)) + 0.5;
            float w = airyDisc(k * length(q - c));
            vec3 pc = imgLod((c - vec2(0.3 * sin(t), 0.2 * cos(t * 1.3))) / N * 0.8 + 0.5, 1.5);
            sum += pc * w;
            ws += w;
        }
    }
    vec3 col = sum / max(ws, 0.05) * clamp(ws * 1.4, 0.1, 1.1);
    finish(col);
}
