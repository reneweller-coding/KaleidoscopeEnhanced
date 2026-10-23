//@doc
 * @brief WAVELET NOISE BAND CASCADE: wavelet noise: noise that is steered separately in bands of frequency; the photo is taken into bands, and every band gets its own noise that drifts at its own speed.  The picture is the photo's coarse tone plus, band by band, noise of that band's grain scaled by the photo's local energy
 * in the band; each band drifts at its own speed and direction.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass, audioMid, audioHigh -> the strength of coarse, middle and fine bands (amplitudes only)
 *   audioAdvance -> the bands drift (integrated)
 *
 * Knobs: sizeP (the base grain), hueP.
//@params sizeP
//@audio audioBass audioMid audioHigh audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    vec3 base = imgLod(uv, 6.5);
    vec3 col = base;
    float sc = 3.0 + 3.0 * clamp(sizeP, 0.0, 1.0);
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        float lod = 6.0 - fk * 0.9;
        vec3 a = imgLod(uv, lod);
        vec3 b = imgLod(uv, lod + 0.9);
        vec3 band = a - b;
        float en = length(band);
        float f = sc * exp2(fk * 0.9);
        float ang = 1.1 * fk;
        vec2 dr = vec2(cos(ang), sin(ang)) * t * (1.0 + 0.6 * fk);
        float n1 = noise2(p * f + dr) - 0.5;
        float n2 = noise2(p * f * 1.3 + 7.0 - dr.yx) - 0.5;
        float aud = fk < 2.0 ? audioBass : (fk < 5.0 ? audioMid : audioHigh);
        float g = 1.0 + 0.8 * (clamp(aud, 0.0, 1.0) - 0.4);
        vec3 nc = mix(vec3(0.5 * (n1 + n2)), vec3(n1, n2, 0.5 * (n1 + n2)), 0.25) * 2.0;
        col += (band * 0.35 + nc * en * 1.8 * (0.5 + 0.0 * fk)) * g;
    }
    finish(col * 1.1);
}
