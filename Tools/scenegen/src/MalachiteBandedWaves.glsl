//@doc
 * @brief MALACHITE BANDED WAVES: concentric banding as in malachite: bands that follow the contours of a bent field in which the brightness of the photo shifts the waves; several centres grow their systems of bands that meet in
 * sharp cusps, every band shaded from dark rim to light middle and coloured by the photo.  The number of bands follows the spectral spread, the bending the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of bands
 *   audioSwell      -> the bending of the field
 *   audioAdvance    -> the centres drift slowly (integrated)
 *
 * Knobs: bandP (how fine the bands are), hueP.
//@params bandP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.01 * sceneTime + 0.04 * audioAdvance;
    float lum = luma(imgLod(p * 0.8 + 0.5, 3.0));
    float bend = 0.25 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    vec2 q = p + bend * 0.3 * vec2(fbm(p * 2.0 + t), fbm(p * 2.0 + 7.0 - t)) - 0.15 * bend;
    float d = 9.0, idc = 0.0;
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        vec2 c = vec2(sin(1.7 * fi + 3.0 * t), cos(2.3 * fi + 2.0 * t)) * vec2(0.7, 0.35);
        float di = length(q - c) * (1.0 + 0.4 * fi * 0.0) + 0.18 * lum * (1.0 + fi * 0.3);
        if (di < d) { d = di; idc = fi; }
    }
    float N = (7.0 + 14.0 * clamp(bandP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    float s = d * N;
    float b = floor(s), f = fract(s);
    vec3 base = imgLod(vec2(fract(b * 0.137 + idc * 0.31), fract(b * 0.311 + 0.2)) * 0.8 + 0.1, 2.5);
    vec3 pc = imgLod(p * 0.8 + 0.5, 1.5);
    float shade = 0.45 + 0.7 * sin(3.1415927 * f);
    float line = smoothstep(0.0, 0.07, f) * smoothstep(1.0, 0.93, f);
    finish(mix(base, pc, 0.45) * shade * (0.5 + 0.5 * line) * 1.2);
}
