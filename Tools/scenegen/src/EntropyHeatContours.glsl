//@doc
 * @brief ENTROPY HEAT CONTOURS: the local information density of the photo as a height map with contour lines: where the picture is rich in detail the surface is high, where it is smooth it is low; the photo lies underneath in subdued colours, and the contour lines
 * glide with the width of the window through the picture, cool where it is low and hot where it is high.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the window's width breathes once a phrase (periodic)
 *   audioSwell     -> the density of the contour lines
 *
 * Knobs: sizeP (the base width of the window), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5 + 0.02 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    float rho = (0.008 + 0.02 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.35 * sin(6.2831853 * audioPhrasePos));
    float m = 0.0;
    float m2 = 0.0;
    for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            float l = luma(imgLod(uv + rho * vec2(float(i), float(j)), 0.6));
            m += l;
            m2 += l * l;
        }
    m /= 9.0;
    m2 /= 9.0;
    float h = sqrt(max(m2 - m * m, 0.0)) * 5.0;
    float K = 6.0 + 8.0 * clamp(audioSwell, 0.0, 1.0);
    float x = h * K;
    float aa = fwidth(x) + 1e-4;
    float line = 1.0 - smoothstep(0.0, aa * 1.8 + 0.06, abs(fract(x - 0.5) - 0.5));
    vec3 hot = hsv2rgb(vec3(fract(0.6 - 0.5 * clamp(h, 0.0, 1.0)), 0.8, 1.0));
    vec3 ph = imgLod(uv, 0.5);
    vec3 base = mix(vec3(luma(ph)), ph, 0.5) * 0.55;
    vec3 col = mix(base, hot, line * 0.85);
    finish(col * 1.2);
}
