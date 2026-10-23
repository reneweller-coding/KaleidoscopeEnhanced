//@doc
 * @brief GABOR NOISE ORIENTATION FIELD: Gabor noise: noise made of many small wave packets with controllable direction and frequency; the picture shows stripe patterns whose direction follows the photo's gradient, like a fingerprint, but grown from wave packets.  Many Gabor kernels, scattered on a net, each oriented by
 * the photo at its own place, add up to a stripe field that flows round the photo's shapes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the frequency of the stripes (smoothed)
 *   audioAdvance -> the stripes turn and drift (integrated)
 *
 * Knobs: sizeP (the size of the kernels), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.05 + 0.05 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float f0 = (14.0 + 20.0 * clamp(audioSpread, 0.0, 1.0)) / (S * 6.2831853) * 0.0 + 24.0 + 24.0 * clamp(audioSpread, 0.0, 1.0);
    float re = 0.0;
    float im = 0.0;
    float rot = 0.02 * audioAdvance + 0.03 * sceneTime;
    for (int dy = -2; dy <= 2; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = (cj + 0.5 + 0.45 * (h - 0.5) * 2.0) * S;
            vec2 uvq = pt * 0.85 + 0.5;
            float e = 0.01;
            float gx = luma(imgLod(uvq + vec2(e, 0.0), 3.0)) - luma(imgLod(uvq - vec2(e, 0.0), 3.0));
            float gy = luma(imgLod(uvq + vec2(0.0, e), 3.0)) - luma(imgLod(uvq - vec2(0.0, e), 3.0));
            float th = atan(gy, gx) + 1.5708 * 0.0 + rot;
            vec2 d = p - pt;
            float w = exp(-dot(d, d) / (S * S * 1.1));
            float ph = f0 * 6.2831853 * dot(d, vec2(cos(th), sin(th)) * 1.0) * 0.5 + 6.2831853 * h.x;
            float sgn = h.y > 0.5 ? 1.0 : -1.0;
            re += w * cos(ph) * sgn;
            im += w * sin(ph) * sgn;
        }
    float v = 0.5 + 0.5 * re / (0.4 + 0.5 * abs(re) + 0.5 * abs(im));
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 col = c * (0.25 + 1.0 * smoothstep(0.25, 0.75, v));
    finish(col * 1.1);
}
