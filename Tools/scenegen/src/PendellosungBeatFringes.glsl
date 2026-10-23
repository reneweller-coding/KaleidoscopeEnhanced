//@doc
 * @brief PENDELLOSUNG BEAT FRINGES: the Pendellosung effect: X-rays swing between two waves in the crystal; the picture shows beat fringes in a wedge sample, with the photo as the colour of the lattice.  The intensity is the square of a sine of the local thickness, the thickness grows across the wedge, the
 * wedge's slope follows the key, and a fan of fine fringes opens from the thin end.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the slope of the wedge glides with the key (integrated)
 *   audioAdvance     -> the thickness drifts (integrated)
 *
 * Knobs: sizeP (the fringe spacing), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float slope = 0.8 + 0.5 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    float t = (p.x + 0.5 * asp) * slope + 0.25 * p.y * (0.8 + 0.4 * sin(0.03 * sceneTime));
    float Lam = 0.05 + 0.06 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float fan = 1.0 + 1.6 * p.y * p.y;
    float ph = t / Lam * fan + 0.3 * (0.02 * audioAdvance + 0.03 * sceneTime);
    float I = pow(sin(3.1415927 * ph), 2.0);
    float I2 = pow(sin(3.1415927 * ph * 2.0 + 1.0 * p.y), 2.0) * 0.4;
    float env = smoothstep(-0.5 * asp, -0.3 * asp, p.x);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 col = c * (0.15 + 1.1 * mix(0.5, I, env) + I2 * env);
    float edge = 1.0 - smoothstep(0.0, 0.01, abs(p.x + 0.5 * asp * 0.98));
    finish(col * 1.1 + edge * 0.1);
}
