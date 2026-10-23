//@doc
 * @brief SHACK HARTMANN SPOT GRID: the Shack-Hartmann wavefront sensor: a grid of small lenses makes spots of light that move with the tilt of the wavefront; the picture shows a grid of dots whose shift shows the hidden deformation, with the photo as the source.  A smooth wavefront (a few Zernike-like terms and noise)
 * is tilted in every cell; each lens throws a soft spot in the photo's colour at its focal point, shifted by the local slope.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the strength of the deformation
 *   audioAdvance -> the deformation changes (integrated)
 *
 * Knobs: sizeP (the size of the lenses), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
float wf(vec2 p, float t, float A)
{
    return A * (0.4 * sin(3.0 * p.x + 0.7 * t) * cos(2.0 * p.y - 0.5 * t) + 0.6 * (fbm(p * 1.5 + vec2(0.0, 0.05 * t)) - 0.5) + 0.3 * (p.x * p.x + p.y * p.y) * sin(0.3 * t));
}
void main()
{
    vec2 p = screenP();
    float S = 0.06 + 0.05 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    vec2 f = fract(g) - 0.5;
    float A = 0.4 + 1.4 * clamp(audioSwell, 0.0, 1.0);
    float t = 0.1 * audioAdvance + 0.2 * sceneTime;
    vec2 cen = (gi + 0.5) * S;
    float e = 0.01;
    float w0 = wf(cen, t, A);
    vec2 slope = vec2(wf(cen + vec2(e, 0.0), t, A) - w0, wf(cen + vec2(0.0, e), t, A) - w0) / e;
    vec2 shift = clamp(slope * 0.5, vec2(-0.4), vec2(0.4));
    float d = length(f - shift);
    float spot = exp(-d * d / 0.012);
    vec3 c = imgLod(cen * 0.85 + 0.5, 1.5);
    c = mix(vec3(luma(c)), c, 1.45);
    float grid = smoothstep(0.0, 0.03, min(min(f.x + 0.5, 0.5 - f.x), min(f.y + 0.5, 0.5 - f.y)));
    vec3 col = c * spot * 1.7 + vec3(0.05, 0.06, 0.08) * (0.4 + 0.6 * grid) + imgLod(p * 0.85 + 0.5, 2.5) * 0.08;
    finish(col);
}
