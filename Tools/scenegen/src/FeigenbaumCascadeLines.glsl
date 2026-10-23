//@doc
 * @brief FEIGENBAUM CASCADE LINES: the Feigenbaum diagram: the logistic map shows doublings as the parameter grows, all the way to chaos; the surface is filled with vertical strips of photo and the attractor of each strip as a density of points, and the parameter range wanders through the cascade.  The strips
 * take the photo's colours; the dots are the attractor's values for that strip's parameter.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the parameter range moves over seconds (the picture sweeps through the cascade)
 *   audioAdvance -> the range wanders slowly (integrated)
 *
 * Knobs: sizeP (the width of the range), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float w = 0.5 + 0.9 * clamp(sizeP, 0.0, 1.0);
    float cen = 3.2 + 0.4 * (0.5 + 0.5 * sin(0.02 * audioAdvance + 0.015 * sceneTime)) + 0.25 * clamp(audioSwell, 0.0, 1.0);
    float r = clamp(cen - 0.5 * w + w * q.x, 2.9, 3.999);
    float acc = 0.0;
    float sig = 0.006 + 0.01 * (1.0 - clamp(sizeP, 0.0, 1.0));
    for (int o = 0; o < 3; ++o) {
        float x = 0.21 + 0.3 * float(o);
        for (int i = 0; i < 60; ++i) x = r * x * (1.0 - x);
        for (int i = 0; i < 14; ++i) {
            x = r * x * (1.0 - x);
            float d = (q.y * 1.0 - (0.08 + 0.84 * x)) / sig;
            acc += exp(-d * d);
        }
    }
    vec2 p = vec2((q.x - 0.5) * resolution.x / resolution.y, q.y - 0.5);
    vec3 c = imgLod(vec2(q.x, q.y) * 0.85 + 0.075, 0.8);
    float strip = 0.5 + 0.5 * sin(80.0 * q.x);
    vec3 bg = c * 0.22;
    vec3 col = bg + c * (1.0 - exp(-acc * 0.5)) * 1.0 + vec3(1.0, 0.95, 0.8) * (1.0 - exp(-acc * 1.0)) * 0.06;
    finish(col);
}
