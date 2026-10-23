//@doc
 * @brief CENTROIDAL TREEMAP RELAX: a Voronoi treemap: cells whose area corresponds to a weight, with relaxation of the centroids; the photo sets the weights of the colour groups.  A weighted Voronoi net (power diagram) whose cell size follows the brightness at its seed; the seeds move slowly towards the middle of their
 * cells and back, as in the relaxation, and each cell shows the photo's mean colour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of groups (the size of the net) (smoothed)
 *   audioAdvance -> the seeds relax and wander (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.14 + 0.1 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.25 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 gi = floor(g);
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    for (int dy = -2; dy <= 2; ++dy)
        for (int dx = -2; dx <= 2; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.38 * (h - 0.5) * 2.0;
            pt += 0.12 * vec2(sin(t * (1.0 + h.x) + 6.28 * h.y), cos(t * (1.0 + h.y) + 6.28 * h.x));
            vec3 c = imgLod(pt * S * 0.85 + 0.5, 2.5);
            float w = 0.45 * (luma(c) - 0.4);
            float d = length(g - pt) - w;
            if (d < d1) { d2 = d1; d1 = d; best = pt; } else if (d < d2) d2 = d;
        }
    vec3 c = imgLod(best * S * 0.85 + 0.5, 2.0);
    c = mix(vec3(luma(c)), c, 1.4);
    float wall = smoothstep(0.0, 0.03, d2 - d1);
    vec3 col = c * (0.85 + 0.2 * smoothstep(0.0, 0.5, d1 + 0.5)) * (0.25 + 0.75 * wall);
    finish(col * 1.2);
}
