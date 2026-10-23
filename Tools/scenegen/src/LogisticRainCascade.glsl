//@doc
 * @brief LOGISTIC RAIN CASCADE: the logistic map as rain: every column of the photo iterates with its own parameter that rises from left to right; the photo shows where it becomes a limit cycle and where chaos, as stripes from calm to flickering.  The photo's brightness is the start value, the number of
 * iterations runs on slowly (the neighbouring counts are cross-faded), and the picture is the colour of the photo scaled by the iterate.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the parameter range slides up (over seconds)
 *   audioAdvance -> the number of iterations runs on (integrated)
 *
 * Knobs: sizeP (the width of the parameter range), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  The logistic map iterated n times.
 *
 * @param x  The argument. (in)
 * @param r  The parameter r. (in)
 * @param n  The number of iterations. (in)
 *
 * @return
 *   The iterate.
 **/
float iter(float x, float r, float n)
{
    for (int i = 0; i < 64; ++i) {
        if (float(i) >= n) break;
        x = r * x * (1.0 - x);
    }
    return x;
}
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    vec2 p = vec2((q.x - 0.5) * resolution.x / resolution.y, q.y - 0.5);
    float w = 0.4 + 0.7 * clamp(sizeP, 0.0, 1.0);
    float cen = 3.3 + 0.3 * clamp(audioSwell, 0.0, 1.0) + 0.1 * sin(0.02 * sceneTime);
    float r = clamp(cen - 0.5 * w + w * q.x, 2.8, 4.0);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    float x0 = clamp(luma(c) * 0.9 + 0.05, 0.02, 0.98);
    float nn = 6.0 + 40.0 * fract(0.01 * audioAdvance + 0.015 * sceneTime);
    float n0 = floor(nn);
    float f = smoothstep(0.0, 1.0, fract(nn));
    float a = iter(x0, r, n0);
    float b = iter(x0, r, n0 + 1.0);
    float v = mix(a, b, f);
    vec3 col = c * (0.25 + 1.2 * v) * (0.9 + 0.2 * sin(40.0 * v));
    finish(col * 1.1);
}
