//@doc
 * @brief LIGHT CAROUSEL RINGS: rings of light points nested at different depths, circling in opposite directions like
 * a carousel of light: each ring is a circle of round lights tilted toward the eye, the near rings large and their
 * lights soft discs, the far ones small and sharp, all counter-rotating.  Every ring listens to its own band of the
 * music, glowing up with it.  The lights' colours are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> each ring's lights follow their own band
 *   audioAdvance      -> the rings turn, each its own way (integrated)
 *   audioSwell        -> the rings tilt a little further toward the eye
 *
 * Knobs: ringP (how many rings), lightP (how many lights per ring), hueP.
//@params ringP lightP
//@audio audioSpectrum[32] audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float rings = 4.0 + 3.0 * clamp(ringP, 0.0, 1.0);
    float M = floor(24.0 + 16.0 * clamp(lightP, 0.0, 1.0));
    float turn = 0.06 * sceneTime + 0.3 * audioAdvance;
    float tilt = 1.0 + 0.15 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        if (fk >= rings) break;
        float R = 0.35 + 0.22 * fk;
        float z = 1.6 + 0.35 * fk;
        float dir = mod(fk, 2.0) > 0.5 ? -1.0 : 1.0;
        float band = clamp(audioSpectrum[3 + 4 * k], 0.0, 1.0);
        for (int i = 0; i < 40; ++i) {
            float fi = float(i);
            if (fi >= M) break;
            float a = 6.2831853 * fi / M + dir * turn * (1.0 - 0.08 * fk) + fk;
            vec3 x = vec3(R * cos(a), 0.0, R * sin(a));
            x.yz = rot2(tilt) * x.yz;
            x.z += z;
            vec2 sp = x.xy / x.z * 1.3 + vec2(0.0, 0.06 * (fk - 2.0));
            float size = 0.006 + 0.012 / x.z;
            float d = length(p - sp);
            float g = smoothstep(size, size * 0.7, d) + 0.25 * exp(-d / (size * 2.0));
            col += famLight(fh, fk / 6.0, 0.4 * band) * g * (0.35 + 0.9 * band) * (1.2 / x.z);
        }
    }
    finish(col);
}
