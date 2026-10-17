//@doc
 * @brief DISTANCE FIELD ECHO: rings of echo running outward from the photo's own brightness steps -- every level of
 * brightness is a contour, the distance from it a field, and waves travel out along that field from each contour,
 * one wavelength per beat.  The waves do not draw lines: they push the photo to and fro, so the picture ripples
 * outward from all its edges at once, like rings on water from every shape in it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the rings run out one wavelength per beat (continuous across the beats)
 *   audioSwell      -> how far the rings push the picture
 *   audioAdvance    -> the photo drifts (integrated)
 *
 * Knobs: levelsP (how many brightness steps send rings), waveP (the rings' spacing), photoP (photo share), hueP.
//@params levelsP waveP photoP
//@audio audioBeatPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.016 * sceneTime + 0.01 * audioAdvance), cos(0.013 * sceneTime));
    vec2 uv = p * 0.5 + 0.5 + drift;
    float n = 3.0 + 5.0 * clamp(levelsP, 0.0, 1.0);
    float L = luma(imgLod(uv, 3.0));
    vec2 gr = texGrad(uv, 3.0);
    float gl = max(length(gr), 0.3);
    float lv = (floor(L * n) + 0.5) / n;
    float d = abs(L - lv) / gl;                                 // the distance to the nearest brightness step (first order)
    float wl = 0.012 + 0.02 * clamp(waveP, 0.0, 1.0);
    float ph = 6.2831853 * (d / wl - audioBeatPhase);
    float amp = (0.004 + 0.01 * clamp(audioSwell, 0.0, 1.0)) * exp(-d * 6.0);
    vec2 nrm = gr / gl;
    vec2 uv2 = uv + nrm * amp * sin(ph);
    vec3 col = imgLod(uv2, 0.3);
    col *= 0.92 + 0.12 * cos(ph) * exp(-d * 6.0);
    vec3 tone = imgPalette(lv + 0.03 * audioPhase);
    col = mix(col * tone * 1.6, col, 0.55 + 0.45 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.05);
}
