//@doc
 * @brief DRAGONFLY WING VEIN CELLS: a dragonfly wing: a net of dark veins with cells of all sizes through which one can see; the photo shines through the cells, and the veins move slightly with the wing beat (slowly).  The net is a Voronoi net whose cells are of very different size (the seeds
 * crowd along the lines of a coarse grid), the veins are dark brown with a pale joint, and the cells carry a faint tint.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the size of the cells (smoothed)
 *   audioAdvance -> the net flutters a little (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.09 + 0.07 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.15 * clamp(audioSpread, 0.0, 1.0));
    vec2 fl = 0.012 * vec2(sin(0.02 * audioAdvance + 3.0 * p.y + 0.05 * sceneTime), cos(0.017 * audioAdvance + 3.0 * p.x));
    vec2 g = (p + fl) / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    for (int dy = -2; dy <= 2; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            float skip = hash21(cj + 9.0);
            vec2 pt = cj + 0.5 + 0.45 * (h - 0.5) * 2.0;
            float sc = 0.6 + 0.9 * skip;
            float d = length(g - pt) * sc;
            if (d < d1) { d2 = d1; d1 = d; best = pt; } else if (d < d2) d2 = d;
        }
    float vein = 1.0 - smoothstep(0.015, 0.05, d2 - d1);
    vec3 ph = imgLod(p * 0.85 + 0.5, 0.6);
    vec3 tint = imgLod(best * S * 0.85 + 0.5, 2.0);
    vec3 col = ph * (0.85 + 0.2 * smoothstep(0.0, 0.5, d1)) * mix(vec3(1.0), tint * 1.4, 0.25);
    vec3 vc = vec3(0.12, 0.07, 0.04) + 0.15 * tint;
    col = mix(col, vc, vein * 0.92);
    col += vec3(1.0, 0.95, 0.85) * (1.0 - smoothstep(0.0, 0.03, d2 - d1 - 0.0)) * smoothstep(0.1, 0.0, d1) * 0.0;
    finish(col * 1.1);
}
