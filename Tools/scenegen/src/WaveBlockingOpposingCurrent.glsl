//@doc
 * @brief WAVE BLOCKING OPPOSING CURRENT: waves running against a current: as the current grows toward the right of the picture the waves grow shorter, steeper and higher, until at one place they stand still (they are blocked, the
 * current as fast as their group) and break; the photo is piled up there, the waves crowding into the blocking line.  The wave numbers follow from the dispersion relation with the current (found step by step along the picture), the
 * current follows the swell of the music, the wavelength the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the current
 *   audioHarmAdvance -> the wavelength at the source follows the key
 *   audioAdvance    -> the waves run (integrated)
 *
 * Knobs: heightP (the height of the waves), hueP.
//@params heightP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float tt = 0.5 * sceneTime + 0.4 * audioAdvance;
    float U0 = 0.12 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float gg = 1.0;
    vec2 dir0 = normalize(vec2(1.0, 0.25 * sin(0.03 * sceneTime)));
    float xs = dot(p, dir0);
    float D = 0.0, eta = 0.0, G = 0.0;
    for (int j = 0; j < 3; ++j) {
        float fj = float(j);
        float w0 = (0.55 + 0.35 * fj) * (1.0 + 0.2 * sin(0.45 * audioHarmAdvance));
        float th = 0.0;
        float amp = 0.0;
        float kloc = 0.0;
        float x0 = -0.5 * asp;
        const int NS = 36;
        float dx = (xs - x0) / float(NS);
        for (int s = 0; s < NS; ++s) {
            float xx = x0 + (float(s) + 0.5) * dx;
            float U = U0 * smoothstep(-0.4 * asp, 0.45 * asp, xx) * 2.4;
            float disc = max(gg - 4.0 * U * w0, 0.0);
            float sr = U > 1e-4 ? (sqrt(gg) - sqrt(disc)) / (2.0 * U) : w0 / sqrt(gg);
            kloc = sr * sr;
            th += kloc * dx;
        }
        float cg = 0.5 * sqrt(gg / max(kloc, 1e-3)) - U0 * smoothstep(-0.4 * asp, 0.45 * asp, xs) * 2.4;
        amp = (0.06 + 0.1 * clamp(heightP, 0.0, 1.0)) * inversesqrt(clamp(abs(cg) + 0.05, 0.05, 2.0)) * 0.6;
        float ph = th - w0 * tt + 2.1 * fj;
        D += amp * cos(ph);
        eta += amp * sin(ph);
        G += amp * kloc * cos(ph);
    }
    vec2 q = p + dir0 * D * 1.3;
    vec3 c = imgLod(q * 0.8 + 0.5 + vec2(0.0, 0.1 * eta), 0.7);
    float lam = clamp(0.8 + 1.4 * G, 0.2, 1.6);
    finish(c * lam);
}
