//@doc
 * @brief VENUS Y SHAPED CLOUD BANDS: the cloud bands of Venus in ultraviolet: a Y-shaped pattern of bands that turns round the planet in four days; the photo lies as the cloud deck, and the bands are stripes of absorption.  Chevron bands (a V where they meet the equator) lie over a stem of straight bands, and the
 * whole pattern runs to the side with the planet's turn.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the turn (the bands run) (integrated)
 *   audioSpread  -> the width of the bands (smoothed)
 *
 * Knobs: sizeP (the number of bands), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float N = 5.0 + 6.0 * clamp(sizeP, 0.0, 1.0);
    float run = 0.03 * audioAdvance + 0.04 * sceneTime;
    float ax = abs(p.x - 0.3 * sin(0.1 * run));
    float v = (p.y + 0.55 * ax) * N;
    float stem = p.x * N * 0.7;
    float w = smoothstep(-0.1, 0.25, p.y);
    float s = mix(stem, v, w) + run * 2.0 + 0.8 * fbm(p * 2.0 + vec2(run * 0.3, 0.0));
    float ab = 0.5 + 0.5 * sin(6.2831853 * s);
    float wd = 0.35 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float band = smoothstep(wd, wd + 0.3, ab);
    vec3 c = imgLod(vec2(p.x + 0.04 * sin(0.2 * run + 2.0 * p.y), p.y) * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 0.8);
    vec3 cloud = mix(vec3(0.85, 0.82, 0.7), c * 1.2, 0.5);
    vec3 absr = mix(vec3(0.25, 0.22, 0.3), c * 0.4, 0.5);
    vec3 col = mix(absr, cloud, band) * (0.85 + 0.25 * fbm(p * 12.0));
    float lim = 1.0 - smoothstep(0.78, 1.0, length(p * vec2(0.8, 1.0)) * 1.6);
    vec3 bg = imgLod(p * 0.85 + 0.5, 3.0) * 0.1;
    finish(mix(bg, col * 1.15, smoothstep(1.0, 0.85, length(p) * 1.5)));
}
