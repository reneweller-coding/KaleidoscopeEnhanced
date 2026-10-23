//@doc
 * @brief CAVITY MODE MOSAIC HOT SPOTS: cavity modes: in a hollow space standing waves with hot spots arise; the picture shows the photo whose brightness wanders with the distribution of modes, with several modes superposed.  Four modes of a rectangular cavity (sines of integer multiples) are added with slowly turning
 * phases, so the hot spots move; the choice of modes glides with the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the choice of modes glides (integrated)
 *   audioAdvance     -> the phases turn (integrated)
 *
 * Knobs: sizeP (the mode numbers), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 q = vec2(p.x / asp + 0.5, p.y + 0.5);
    float base = 2.0 + 4.0 * clamp(sizeP, 0.0, 1.0);
    float ph = 0.03 * audioHarmAdvance + 0.01 * sceneTime;
    float t = 0.03 * audioAdvance + 0.06 * sceneTime;
    float psi = 0.0;
    for (int m = 0; m < 4; ++m) {
        float fm = float(m);
        float mx = base + floor(2.0 * sin(ph + 1.7 * fm) + 2.0) + fm;
        float my = base * 0.8 + floor(2.0 * cos(ph * 1.3 + 2.3 * fm) + 2.0);
        float wgt = 0.5 + 0.5 * sin(ph * 2.0 + 1.1 * fm);
        psi += wgt * sin(3.1415927 * mx * q.x) * sin(3.1415927 * my * q.y) * cos(t * (1.0 + 0.5 * fm) + fm);
    }
    float I = psi * psi;
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    float hot = smoothstep(0.05, 1.2, I);
    vec3 col = c * (0.15 + 1.5 * hot) + vec3(1.0, 0.85, 0.6) * pow(hot, 4.0) * 0.2;
    float wall = smoothstep(0.0, 0.01, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
    finish(col * (0.6 + 0.4 * wall));
}
