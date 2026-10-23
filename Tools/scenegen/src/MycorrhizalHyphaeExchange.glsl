//@doc
 * @brief MYCORRHIZAL HYPHAE EXCHANGE: mycorrhiza: a network of fine fungal threads that exchanges sugar and phosphate between roots; the photo colours the roots, and pulses of nutrient run on the threads.  A jittered lattice of root nodes is linked by threads to the neighbours on the right, below and on the
 * diagonal; small bright pulses travel along the threads in both directions.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the rate of the pulses (how many are on their way) and their brightness
 *   audioAdvance -> the pulses run on (integrated)
 *
 * Knobs: sizeP (the size of the network), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.1 + 0.08 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    vec3 col = imgLod(p * 0.85 + 0.5, 1.5) * 0.28;
    float t = 0.1 * audioAdvance + 0.15 * sceneTime;
    float sw = 0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 hA = hash22(cj);
            vec2 A = (cj + 0.5 + 0.42 * (hA - 0.5) * 2.0) * S;
            vec3 cA = imgLod(A * 0.85 + 0.5, 1.5);
            cA = mix(vec3(luma(cA)), cA, 1.4);
            float dn = length(p - A) / S;
            col = mix(col, cA * 1.4, (1.0 - smoothstep(0.1, 0.16, dn)));
            for (int e = 0; e < 3; ++e) {
                vec2 o = e == 0 ? vec2(1.0, 0.0) : (e == 1 ? vec2(0.0, 1.0) : vec2(1.0, 1.0));
                vec2 cB = cj + o;
                vec2 hB = hash22(cB);
                vec2 B = (cB + 0.5 + 0.42 * (hB - 0.5) * 2.0) * S;
                float d = sdSeg(p, A, B);
                float th = 0.0025 + 0.002 * hash21(cj + o * 3.0);
                float line = 1.0 - smoothstep(th * 0.6, th * 1.4, d);
                vec3 cL = imgLod(0.5 * (A + B) * 0.85 + 0.5, 1.5);
                col = mix(col, mix(cL, cA, 0.4) * 0.9 + 0.12, line * 0.85);
                float s = clamp(dot(p - A, B - A) / max(dot(B - A, B - A), 1e-5), 0.0, 1.0);
                float pul = 0.0;
                for (int k = 0; k < 2; ++k) {
                    float pp = fract(t * (0.12 + 0.1 * hash21(cj + float(e))) * (k == 0 ? 1.0 : -1.0) + hash21(cj + float(10 * k + e)));
                    float ds = (s - pp) * length(B - A);
                    pul += exp(-ds * ds / (0.0003 + 0.0002 * sw)) * line;
                }
                col += vec3(1.0, 0.95, 0.7) * pul * 0.9 * sw;
            }
        }
    finish(col * 1.1);
}
