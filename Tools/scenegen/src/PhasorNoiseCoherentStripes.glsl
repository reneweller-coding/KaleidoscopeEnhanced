//@doc
 * @brief PHASOR NOISE COHERENT STRIPES: phasor noise: a variant that mixes the phase rather than the amplitude, so that clean stripes arise that meet in dislocations; the picture shows stripes of the photo that bend cleanly round defects.  Complex wave packets (oriented by the photo) are added, and the stripes are the phase
 * of their sum, so every stripe has the same width and meets the others at forks.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> the density of the dislocations (how much the kernels' directions scatter)
 *   audioAdvance   -> the phase runs (the stripes glide) (integrated)
 *
 * Knobs: sizeP (the size of the kernels), hueP.
//@params sizeP
//@audio audioRoughness audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.08 + 0.07 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float f0 = 26.0;
    float re = 0.0;
    float im = 0.0;
    float scat = 0.2 + 1.2 * clamp(audioRoughness, 0.0, 1.0);
    float run = 6.2831853 * (0.03 * audioAdvance + 0.04 * sceneTime);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx)
            for (int k = 0; k < 2; ++k) {
                vec2 cj = gi + vec2(float(dx), float(dy));
                vec2 h = hash22(cj + float(k) * 7.0);
                vec2 pt = (cj + 0.5 + 0.4 * (h - 0.5) * 2.0) * S;
                vec2 uvq = pt * 0.85 + 0.5;
                float e = 0.012;
                float gx = luma(imgLod(uvq + vec2(e, 0.0), 3.2)) - luma(imgLod(uvq - vec2(e, 0.0), 3.2));
                float gy = luma(imgLod(uvq + vec2(0.0, e), 3.2)) - luma(imgLod(uvq - vec2(0.0, e), 3.2));
                float th = atan(gy, gx) + scat * (h.x - 0.5);
                vec2 d = p - pt;
                float w = exp(-dot(d, d) / (S * S * 1.3));
                float ph = f0 * 6.2831853 * 0.5 * dot(d, vec2(cos(th), sin(th))) - run;
                re += w * cos(ph);
                im += w * sin(ph);
            }
    float phase = atan(im, re);
    float st = 0.5 + 0.5 * cos(phase);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    c = mix(vec3(luma(c)), c, 1.3);
    float amp = clamp(length(vec2(re, im)) * 1.2, 0.0, 1.0);
    vec3 col = c * (0.2 + 1.1 * smoothstep(0.3, 0.7, st)) * (0.55 + 0.45 * amp);
    finish(col * 1.1);
}
