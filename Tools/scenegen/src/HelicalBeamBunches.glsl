//@doc
 * @brief HELICAL BEAM BUNCHES: a bundle of dozens of particle beams screwing side by side through a magnetic field,
 * and the eye travels with them: each beam is a train of glowing bunches -- small clouds of points -- following its
 * own helix round its own guiding line, the bunches spaced evenly, the near ones racing past large and soft.  A beam
 * sits on a grid across the field; its bunches lie at even steps along the flight, each at the helix angle of its
 * place.  The bunches' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the flight with the beams (integrated): the bunches stream toward the eye
 *   audioHarmAdvance -> the helices' pitch glides with the chord changes
 *   audioBeatPhase   -> the bunches' brightness runs down each beam, a pulse per beat (light only)
 *
 * Knobs: beamP (how many beams across), radiusP (the helices' radius), hueP.
//@params beamP radiusP
//@audio audioHarmAdvance audioBeatPhase
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float n = floor(3.0 + 2.0 * clamp(beamP, 0.0, 1.0));       // beams per row (n x n)
    float R = 0.06 + 0.06 * clamp(radiusP, 0.0, 1.0);
    float pitch = 2.5 + 1.2 * sin(0.6 * h);
    float fly = 0.4 * sceneTime + 1.6 * audioAdvance;
    const float STEP = 0.4;                                      // bunches' spacing along the flight
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int b = 0; b < 25; ++b) {
        float fb = float(b);
        if (fb >= n * n) break;
        vec2 g = vec2(mod(fb, n), floor(fb / n)) - 0.5 * (n - 1.0);
        vec2 base = g * 0.42;
        float hb = fract(sin(fb * 12.9898) * 43758.5453);
        float z0 = mod(-fly - hb * STEP, STEP);                  // the nearest bunch ahead of the eye
        for (int k = 0; k < 10; ++k) {
            float z = 0.25 + z0 + float(k) * STEP;
            float zw = z + fly;                                  // its place along the field
            // the helix angle: the pitch acts on the bounded depth only (never on the ever-growing flight)
            float a = pitch * z + 2.5 * zw + 6.2831853 * hb;
            vec3 x = vec3(base + R * vec2(cos(a), sin(a)), z);
            vec2 sp = x.xy / x.z;
            float size = 0.004 + 0.012 / x.z;
            float d = length(p - sp);
            float g1 = smoothstep(size, size * 0.6, d) + 0.3 * exp(-d / (size * 2.0));
            float pulse = 0.5 + 0.5 * pow(0.5 + 0.5 * cos(6.2831853 * (audioBeatPhase - zw * 0.25)), 4.0);
            float keep = smoothstep(0.25, 0.6, z) * smoothstep(0.25 + 10.0 * STEP, 0.25 + 8.0 * STEP, z);   // no bunch pops in or out
            col += famLight(fh, fract(hb * 3.0), 0.4 * pulse) * g1 * pulse * exp(-0.2 * z) * 1.2 * keep;
        }
    }
    finish(famExpose(col, 2.95, 0.70, 0.03, fh));
}
