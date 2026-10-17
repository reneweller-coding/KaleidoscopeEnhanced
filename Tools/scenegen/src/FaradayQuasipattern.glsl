//@doc
 * @brief FARADAY QUASIPATTERN: Faraday waves on a shaken liquid, driven at two frequencies so the surface takes an
 * eight-, ten- or twelve-fold quasipattern -- never repeating, rotationally symmetric, rosettes within rosettes.
 * The surface rises and falls with the beat; the photo below it is refracted by every slope and gathered into
 * bright caustic lines where the surface curves.  An endless field without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each section moves to another symmetry (8, 10 or 12 waves; crossfaded over four seconds)
 *   audioBass       -> the wave height
 *   audioBarPhase   -> the surface's rise and fall (twice a bar, continuous)
 *   audioPhase      -> the pattern turns (integrated)
 *   audioKick       -> the caustics flash (light)
 *
 * Knobs: foldP (the first symmetry), waveP (the wavelength), depthP (how strongly the surface refracts), hueP.
//@params foldP waveP depthP
//@audio audioBass audioKick audioBarPhase audioSectionId audioSectionAge
//@body
/**  The surface height of a quasipattern of n plane waves at a point.
 *
 * @param x  The point (screen units). (in)
 * @param n  The number of waves (the symmetry). (in)
 * @param k  The wavenumber. (in)
 *
 * @return
 *   The height, about -1..1.
 **/
float quasi(vec2 x, float n, float k)
{
    float s = 0.0;
    float rot = 0.05 * audioPhase + 0.004 * sceneTime;
    for (int i = 0; i < 12; ++i) {
        if (float(i) >= n) break;
        float a = 3.14159265 * float(i) / n + rot;
        s += cos(k * dot(x, vec2(cos(a), sin(a))) + 0.3 * sin(0.05 * sceneTime + float(i)));
    }
    return s / n * 2.0;
}
/**  The symmetry of a section: 8, 10 or 12 waves.
 *
 * @param k  The section's index (with the knob). (in)
 *
 * @return
 *   The number of waves.
 **/
float foldOf(float k) { float m = mod(k, 3.0); return m < 0.5 ? 8.0 : (m < 1.5 ? 10.0 : 12.0); }

void main()
{
    vec2 p = screenP();
    float k = 6.2831853 / (0.045 + 0.05 * clamp(waveP, 0.0, 1.0));
    float k0 = floor(clamp(foldP, 0.0, 0.999) * 3.0) + max(audioSectionId, 0.0);
    float nNow = foldOf(k0), nBefore = foldOf(k0 + 2.0);
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    float amp = (0.5 + 0.8 * clamp(audioBass, 0.0, 1.0)) * sin(6.2831853 * 2.0 * audioBarPhase + 0.7);
    float e = 0.002;
    vec3 h = vec3(0.0);                                        // height and its two slopes
    for (int j = 0; j < 3; ++j) {
        vec2 x = p + (j == 1 ? vec2(e, 0.0) : (j == 2 ? vec2(0.0, e) : vec2(0.0)));
        float v = m > 0.999 ? quasi(x, nNow, k) : mix(quasi(x, nBefore, k), quasi(x, nNow, k), m);
        h[j] = v * amp;
    }
    vec2 grad = vec2(h.y - h.x, h.z - h.x) / e;
    // the photo below, refracted by the slope; the caustics where the surface curves most
    float depth = 0.0008 + 0.0025 * clamp(depthP, 0.0, 1.0);
    vec2 uv = p * 0.75 + 0.5 + grad * depth + 0.004 * sceneTime * vec2(1.0, 0.4);
    vec3 photo = imgLod(uv, 0.4);
    float caus = smoothstep(0.55, 1.0, h.x / max(abs(amp), 0.2));
    vec3 tone = imgPalette(0.4 + 0.1 * h.x + 0.03 * audioPhase);
    vec3 col = photo * (0.7 + 0.3 * h.x) + mix(tone, vec3(1.0), 0.5) * caus * (0.25 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
