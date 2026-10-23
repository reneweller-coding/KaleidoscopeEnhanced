//@doc
 * @brief IMAGE QUILTING SEAM DRIFT: image quilting: the photo is put together from overlapping patches of itself, and at every overlap a cut seeks the cheapest path through the differences; the picture shows the photo as a patchwork with visible seams that wander slowly as the patches shift.  The patches are cells of
 * a jittered net whose borders are bent by noise (the cut), each cell shows the photo from a place of its own near by, and a thin seam lies on the borders.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the size of the patches glides (smoothed)
 *   audioAdvance -> the patches shift (the source places drift) (integrated)
 *
 * Knobs: sizeP (the size of the patches), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.12 + 0.12 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    vec2 q = p + 0.025 * vec2(fbm(p * 6.0 + vec2(t, 0.0)) - 0.5, fbm(p * 6.0 + vec2(5.0, -t)) - 0.5) * 2.0;
    vec2 g = q / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    vec2 best = vec2(0.0);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.35 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; best = cj; } else if (d < d2) d2 = d;
        }
    vec2 h = hash22(best + 3.0);
    vec2 off = 0.2 * (h - 0.5) * 2.0 + 0.06 * vec2(sin(t * 3.0 + 6.28 * h.x), cos(t * 2.5 + 6.28 * h.y));
    vec3 c = imgLod((p + off) * 0.85 + 0.5, 0.6);
    float seam = 1.0 - smoothstep(0.0, 0.035, d2 - d1);
    vec3 col = c * (1.0 - 0.45 * seam);
    finish(col * 1.1);
}
