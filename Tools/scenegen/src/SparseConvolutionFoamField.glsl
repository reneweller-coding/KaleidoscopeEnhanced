//@doc
 * @brief SPARSE CONVOLUTION FOAM FIELD: sparse convolution: many randomly scattered kernels, each with its own shape; the photo becomes a foam of discs and rings drawn from a library of kernels.  Three layers of kernels (full discs, rings and dished discs) lie on jittered nets of different sizes; the photo colours them,
 * and the density follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the density: how many kernels are present
 *   audioAdvance -> the kernels drift (integrated)
 *
 * Knobs: sizeP (the size of the kernels), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.1 + 0.08 * clamp(sizeP, 0.0, 1.0);
    vec3 col = imgLod(p * 0.85 + 0.5, 2.0) * 0.25;
    float dens = 0.35 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    for (int layer = 0; layer < 3; ++layer) {
        float fl = float(layer);
        float sc = 1.0 + 0.55 * fl;
        vec2 g = (p + 0.02 * vec2(sin(0.03 * audioAdvance + fl), cos(0.025 * audioAdvance + fl * 2.0)) * 3.0) / (S * sc) + 0.31 * fl;
        vec2 gi = floor(g);
        for (int dy = -1; dy <= 1; ++dy)
            for (int dx = -1; dx <= 1; ++dx) {
                vec2 cj = gi + vec2(float(dx), float(dy));
                vec2 h = hash22(cj + fl * 3.0);
                if (h.x > dens) continue;
                vec2 pt = cj + 0.5 + 0.4 * (h - 0.5) * 2.0;
                float R = 0.3 + 0.3 * h.y;
                vec2 d = g - pt;
                float r = length(d) / R;
                if (r > 1.0) continue;
                vec3 c = imgLod(pt * S * sc * 0.85 + 0.5, 1.2);
                c = mix(vec3(luma(c)), c, 1.35);
                float kind = floor(hash21(cj + 11.0 + fl) * 3.0);
                float shape = kind < 0.5 ? 1.0 : (kind < 1.5 ? smoothstep(0.55, 0.8, r) : 0.45 + 0.8 * r * r);
                float a = (1.0 - smoothstep(0.88, 1.0, r)) * (0.75 + 0.25 * fl * 0.0);
                col = mix(col, c * shape * 1.2 + 0.05, a);
            }
    }
    finish(col);
}
