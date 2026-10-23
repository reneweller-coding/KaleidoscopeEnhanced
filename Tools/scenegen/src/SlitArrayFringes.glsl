//@doc
 * @brief SLIT ARRAY FRINGES: the photo through a field of slits of changing width: behind every slit lies a diffraction pattern, the
 * bright central band with fading side bands, in the photo's own colours; the slits' widths follow a slow wave across the field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the slits' width (the pattern narrows as the slits open)
 *   audioHarmAdvance -> the number of slits steps to the next simple count (cross-faded, integrated)
 *   audioAdvance    -> the wave of widths runs (integrated)
 *
 * Knobs: slitsP (the base count), hueP.
//@params slitsP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.3 + 2.0 * audioAdvance;
    float N = 8.0 + 10.0 * clamp(slitsP, 0.0, 1.0) + 2.0 * sin(0.4 * audioHarmAdvance);
    float X = p.x / 1.7778 + 0.5;
    float g = X * N;
    float i = floor(g);
    float u = (fract(g) - 0.5);
    float wd = 0.12 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    float a = wd * (0.5 + 0.5 * sin(0.7 * i + 0.4 * t));
    float xx = 3.14159265 * u * (1.0 + 6.0 * a);
    float sinc = abs(xx) < 1e-3 ? 1.0 : sin(xx * 3.0) / (xx * 3.0);
    float I = sinc * sinc;
    vec3 c = imgLod(uv, 0.5);
    float slit = smoothstep(0.5 * a + 0.02, 0.5 * a - 0.02, abs(u) * 0.5);
    vec3 col = c * (0.1 + 1.2 * I + 0.3 * slit);
    finish(col);
}
