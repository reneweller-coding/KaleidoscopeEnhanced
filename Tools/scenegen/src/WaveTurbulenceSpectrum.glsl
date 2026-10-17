//@doc
 * @brief WAVE TURBULENCE SPECTRUM: capillary wave turbulence -- a water surface covered with ripples of every size at
 * once, each scale running at its own speed (omega ~ k^(3/2)).  The music's spectrum is the ripples' spectrum: every
 * band of the analyser drives one octave of wavelengths, bass the long swells, treble the fine shivers.  The
 * surface refracts the photo beneath it and glints where the ripples peak.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum   -> each band's level is the height of one octave of ripples (structure: the texture follows the
 *                      timbre)
 *   audioKick       -> the glints flash (light)
 *
 * Knobs: depthP (how strongly the water refracts), fineP (the finest ripples' scale), glintP (the glints' share), hueP.
//@params depthP fineP glintP
//@audio audioKick audioSpectrum[32]
//@body
/**  The surface's height: eight octaves of ripples, each a few waves in fixed random directions, scaled by the
 * spectrum band that drives it (smoothed over neighbouring bands).
 *
 * @param x  The point. (in)
 *
 * @return
 *   The height.
 **/
float surface(vec2 x)
{
    float h = 0.0;
    float k0 = 8.0 + 8.0 * clamp(fineP, 0.0, 1.0);
    for (int o = 0; o < 8; ++o) {
        float fo = float(o);
        int b = o * 4;
        float lvl = 0.25 * (audioSpectrum[b] + audioSpectrum[b + 1] + audioSpectrum[b + 2] + audioSpectrum[b + 3]);
        float amp = (0.15 + 1.4 * clamp(lvl, 0.0, 1.0)) * pow(0.62, fo);
        float k = k0 * exp2(fo * 0.75);
        float om = 0.6 * pow(k / k0, 1.5);
        for (int j = 0; j < 3; ++j) {
            float a = 6.2831853 * hash11(fo * 7.3 + float(j) * 1.9);
            h += amp * sin(k * dot(x, vec2(cos(a), sin(a))) - om * sceneTime + 6.2831853 * hash11(fo + float(j) * 3.1));
        }
    }
    return h;
}

void main()
{
    vec2 p = screenP();
    float h = surface(p);
    vec2 g = vec2(dFdx(h), dFdy(h)) * resolution.y;
    vec2 uv = p * 0.75 + 0.5 + g * (0.0015 + 0.004 * clamp(depthP, 0.0, 1.0));
    vec3 photo = imgLod(uv, 0.3);
    vec3 n = normalize(vec3(-g * 0.02, 1.0));
    float spec = pow(max(dot(reflect(-normalize(vec3(0.4, 0.5, 1.0)), n), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);
    vec3 tone = imgPalette(0.5 + 0.1 * h + 0.03 * audioPhase);
    vec3 col = photo * (0.85 + 0.15 * h) + mix(tone, vec3(1.0), 0.7) * spec * (0.2 + 0.8 * clamp(glintP, 0.0, 1.0))
               * (0.6 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
