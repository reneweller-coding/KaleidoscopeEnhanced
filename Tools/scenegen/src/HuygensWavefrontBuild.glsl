//@doc
 * @brief HUYGENS WAVEFRONT BUILD: Huygens' construction: every point of a wave is the source of a spherical wave whose envelope is the new front; the picture shows rows of elementary waves as rings of the photo and the envelope that forms and breaks at obstacles.  A row of point sources in the gaps of a screen sends rings;
 * the sum of the waves (the intensity) is shown with the photo, and the single rings are drawn thin.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of sources (the gaps) glides (smoothed)
 *   audioAdvance -> the phase of the waves runs (integrated)
 *
 * Knobs: sizeP (the wavelength), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float lam = 0.05 + 0.05 * clamp(sizeP, 0.0, 1.0);
    float k = 6.2831853 / lam;
    float n = 6.0 + 10.0 * clamp(audioSpread, 0.0, 1.0);
    float ph = 6.2831853 * (0.03 * audioAdvance + 0.05 * sceneTime);
    float re = 0.0;
    float im = 0.0;
    float rings = 0.0;
    for (int i = 0; i < 16; ++i) {
        float fi = float(i);
        float on = clamp(n - fi, 0.0, 1.0);
        if (on <= 0.0) continue;
        vec2 src = vec2(-0.5 * asp * 0.7, ((fi + 0.5) / n - 0.5) * 0.8);
        vec2 d = p - src;
        float r = length(d);
        float w = on / sqrt(r * 6.0 + 0.4);
        re += w * cos(k * r - ph);
        im += w * sin(k * r - ph);
        float R = fract((0.03 * audioAdvance + 0.05 * sceneTime) * 0.7 + fi * 0.37) * 1.4;
        rings += on * exp(-pow((r - R * 0.5) / 0.005, 2.0)) * exp(-R * 1.2);
    }
    float I = (re * re + im * im) / (n * 0.35 + 0.5);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 col = c * (0.12 + 1.2 * clamp(I * 0.6, 0.0, 1.4)) + vec3(1.0, 0.95, 0.85) * rings * 0.6;
    float scr = 1.0 - smoothstep(0.0, 0.004, abs(p.x + 0.5 * asp * 0.7));
    col = mix(col, vec3(0.05), scr * 0.0);
    finish(col);
}
