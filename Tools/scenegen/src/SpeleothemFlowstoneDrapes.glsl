//@doc
 * @brief SPELEOTHEM FLOWSTONE DRAPES: flowstone and dripstone: curtains of lime that run down walls, with bands of colour; the photo colours the bands, and the curtain grows slowly.  Vertical folds (a sum of waves with a growing amplitude) bend horizontal bands of lime, a translucent edge hangs at the lower end of
 * every fold, and a few drips of light run down.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the curtain grows (the bands run down) (integrated)
 *   audioSpread  -> the number of folds (smoothed)
 *
 * Knobs: sizeP (the width of the folds), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float nf = 5.0 + 7.0 * (1.0 - clamp(sizeP, 0.0, 1.0)) + 3.0 * clamp(audioSpread, 0.0, 1.0);
    float g = 0.02 * audioAdvance + 0.03 * sceneTime;
    float fold = sin(nf * p.x + 0.8 * sin(2.3 * nf * p.x + 1.0) + 0.5 * p.y) * 0.5 + 0.5;
    float fold2 = sin(2.7 * nf * p.x - 0.7) * 0.5 + 0.5;
    float depth = fold * (0.7 + 0.3 * fold2);
    float yb = p.y * 8.0 + 2.5 * depth - g * 4.0;
    float band = 0.5 + 0.5 * sin(6.2831853 * yb * 0.6 + 2.0 * fbm(vec2(p.x * 3.0, yb * 0.3)));
    vec3 c = imgLod(vec2(p.x * 0.85 + 0.5, floor(yb) * 0.05 + 0.5 + 0.1 * depth), 1.2);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 lime = mix(vec3(0.9, 0.86, 0.78), c, 0.55);
    vec3 col = mix(lime * 0.55, lime * 1.1, band);
    float lit = 0.55 + 0.7 * depth;
    float hang = smoothstep(0.82, 0.95, depth) * (1.0 - smoothstep(0.0, 0.12, abs(fract(p.y * 8.0 - g * 4.0 + 2.5 * depth) - 0.5)));
    float drip = exp(-pow((p.x * nf - floor(p.x * nf + 0.5)) * 10.0, 2.0)) * smoothstep(0.55, 0.9, hash21(vec2(floor(p.x * nf + 0.5), 3.0)));
    col = col * lit + vec3(1.0, 0.95, 0.8) * hang * 0.25 + vec3(1.0, 0.95, 0.8) * drip * 0.18 * (0.5 + 0.5 * sin(6.0 * p.y - 6.0 * g));
    finish(col * 1.1);
}
