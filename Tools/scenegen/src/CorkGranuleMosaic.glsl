//@doc
 * @brief CORK GRANULE MOSAIC: cork: grains of pressed bark with light and dark veins; the photo sets the colour of every grain, and the light moves across them.  Small Voronoi grains of very different size, each with a brown tone drawn from the photo, dark veins between, a slightly raised, pitted surface lit from a
 * light that wanders.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the size of the grains (smoothed)
 *   audioAdvance -> the light moves across (integrated)
 *
 * Knobs: sizeP (the grain size), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.03 + 0.03 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    vec2 bid = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.42 * (h - 0.5) * 2.0;
            float sc = 0.7 + 0.9 * hash21(cj + 3.0);
            float d = length(g - pt) * sc;
            if (d < d1) { d2 = d1; d1 = d; best = pt; bid = cj; } else if (d < d2) d2 = d;
        }
    vec3 c = imgLod(best * S * 0.85 + 0.5, 1.5);
    float tone = 0.55 + 0.9 * hash21(bid + 7.0);
    vec3 cork = mix(vec3(0.62, 0.42, 0.22), c * 1.1, 0.35) * tone;
    float la = 0.03 * audioAdvance + 0.05 * sceneTime;
    vec2 ld = vec2(cos(la), sin(la));
    vec2 toc = normalize(g - best + 1e-4);
    float side = dot(toc, ld);
    float pit = noise2(p * 150.0);
    float shade = 0.75 + 0.3 * side * smoothstep(0.0, 0.5, d1) * 0.7 + 0.15 * (pit - 0.5);
    float vein = 1.0 - smoothstep(0.0, 0.07, d2 - d1);
    vec3 col = cork * shade * (1.0 - 0.6 * vein);
    finish(col * 1.2);
}
