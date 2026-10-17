//@doc
 * @brief STANDING WAVE MOSAIC: standing waves from four to twelve directions superposed -- with four, a square
 * lattice; with six, hexagons; with five, eight, ten or twelve, quasicrystal mosaics, never repeating, full of
 * rosettes and stars.  The field's levels are cut into flat tiles of colour like a mosaic, each tile a cut of the
 * photo, its grout the nodal lines; the waves pulse, so the tiles grow and shrink.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony changes the number of directions (4 .. 12, crossfaded)
 *   audioBeatPhase  -> the pulsation (continuous)
 *   audioPhase      -> the mosaic turns (integrated)
 *   audioKick       -> the grout flashes (light)
 *
 * Knobs: waveP (the wavelength), levelsP (tile levels), photoP (photo share), hueP.
//@params waveP levelsP photoP
//@audio audioKick audioHarmAdvance audioBeatPhase
//@body
/**  Standing waves from n directions, superposed.
 *
 * @param x  The point. (in)
 * @param n  The number of directions. (in)
 * @param k  The wavenumber. (in)
 *
 * @return
 *   The field, about -1..1.
 **/
float standing(vec2 x, float n, float k)
{
    float s = 0.0;
    float rot = 0.04 * audioPhase + 0.003 * sceneTime;
    for (int i = 0; i < 12; ++i) {
        if (float(i) >= n) break;
        float a = 3.14159265 * float(i) / n + rot;
        s += cos(k * dot(x, vec2(cos(a), sin(a))));
    }
    return s / n * 2.0;
}

void main()
{
    vec2 p = screenP();
    float h = max(audioHarmAdvance, 0.0);
    float nA = 4.0 + mod(floor(h) * 3.0, 9.0), nB = 4.0 + mod((floor(h) + 1.0) * 3.0, 9.0);
    float g = smoothstep(0.2, 0.8, fract(h));
    float k = 6.2831853 / (0.06 + 0.08 * clamp(waveP, 0.0, 1.0));
    float pulse = 0.8 + 0.2 * cos(6.2831853 * audioBeatPhase);
    float f = mix(standing(p, nA, k), standing(p, nB, k), g) * pulse;
    float levels = 3.0 + 4.0 * clamp(levelsP, 0.0, 1.0);
    float lv = floor((f * 0.5 + 0.5) * levels);
    float within = fract((f * 0.5 + 0.5) * levels);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.23, 0.41) * lv;
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(lv / levels + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.3, photo * 1.2, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * (0.5 + 0.5 * lv / levels + 0.2);
    float grout = 1.0 - smoothstep(0.0, 0.08, min(within, 1.0 - within));
    col = mix(col, mix(tone, vec3(1.0), 0.5) * (0.4 + 0.8 * clamp(audioKick, 0.0, 1.0)), grout * 0.6);
    finish(col);
}
