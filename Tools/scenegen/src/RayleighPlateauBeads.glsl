//@doc
 * @brief RAYLEIGH PLATEAU BEADS: the Rayleigh-Plateau instability: a jet of liquid breaks into drops, first thickened like pearls; hundreds of threads run vertically, thicken and turn into strings of beads, and the photo colours the beads.  Every thread has a radius that swells and pinches with a wave whose
 * amplitude grows downwards; far down the pinches close and the thread falls apart into separate drops.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the disturbance wavelength glides with the key (integrated)
 *   audioSwell       -> the decay of the threads: how high up the breaking begins
 *
 * Knobs: sizeP (the number of threads), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 22.0 + 40.0 * clamp(sizeP, 0.0, 1.0);
    float xw = p.x / asp * 0.98 + 0.5;
    float k = floor(xw * N);
    float fx = (fract(xw * N) - 0.5);
    float h = hash21(vec2(k, 1.0));
    float lam = (0.07 + 0.03 * h) * (1.0 + 0.2 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime));
    float yy = p.y + 0.5;
    float grow = clamp(1.0 - yy, 0.0, 1.0) * (0.55 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float ph = 6.2831853 * (yy / lam + 0.3 * sceneTime * (0.5 + h) * -1.0 * 0.3 - 0.2 * h) + 6.28 * h;
    float r0 = 0.28;
    float rr = r0 * (1.0 + 1.35 * grow * cos(ph));
    float W = max(rr, 0.0) * (1.0 - smoothstep(1.2, 1.7, grow * 1.4));
    float inside = 1.0 - smoothstep(W - 0.04, W, abs(fx));
    vec3 c = imgLod(vec2(p.x * 0.85 / asp * 1.0 + 0.5, p.y * 0.85 + 0.5), 0.8);
    c = mix(vec3(luma(c)), c, 1.35);
    float bead = 0.5 + 0.5 * sqrt(max(1.0 - (fx / max(W, 1e-3)) * (fx / max(W, 1e-3)), 0.0));
    float spec = pow(max(0.0, 1.0 - abs(fx / max(W, 1e-3) + 0.35) * 3.0), 3.0) * 0.5;
    vec3 col = c * bead * 1.3 + spec;
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.12;
    finish(mix(bg, col, inside));
}
