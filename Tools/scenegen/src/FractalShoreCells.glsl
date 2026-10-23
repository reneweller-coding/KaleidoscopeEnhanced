//@doc
 * @brief FRACTAL SHORE CELLS: cells whose shores are fractal: a Voronoi division warped by noise at several scales so that every coast is ragged
 * down to the pixel, each cell an island showing the photo in a window of its own; the shores keep growing finer as the spectrum widens, and
 * the islands drift.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> how many scales of raggedness the shores have (the finer ones fade in)
 *   audioAdvance    -> the islands drift and the shores shift (integrated)
 *   audioSwell      -> the windows' zoom
 *
 * Knobs: cellsP (how many islands), shoreP (how ragged), hueP.
//@params cellsP shoreP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.1 + 0.8 * audioAdvance;
    float N = 2.5 + 3.5 * clamp(cellsP, 0.0, 1.0);
    float A = 0.5 + 0.9 * clamp(shoreP, 0.0, 1.0);
    float sp = clamp(audioSpread, 0.0, 1.0);
    vec2 w = vec2(0.0);
    float amp = 0.11 * A;
    float fq = 2.0;
    for (int o = 0; o < 4; ++o) {
        float wt = o < 2 ? 1.0 : (o == 2 ? 0.3 + 0.7 * sp : sp);
        w += wt * amp * (vec2(noise2(p * fq + vec2(0.05 * t, 3.0 * float(o))), noise2(p * fq + vec2(7.0, 0.04 * t + 5.0 * float(o)))) - 0.5);
        amp *= 0.5;
        fq *= 2.1;
    }
    vec2 q = (p + w * 2.0) * N + 0.1 * t * vec2(0.6, 0.8);
    vec2 g = floor(q);
    float best = 9.0;
    vec2 cg0 = vec2(0.0), pt0 = vec2(0.0);
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 cg = g + vec2(float(i), float(j));
            vec2 pt = cg + 0.15 + 0.7 * hash22(cg);
            float d = dot(q - pt, q - pt);
            if (d < best) { best = d; cg0 = cg; pt0 = pt; }
        }
    }
    float z = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec2 uv = (q - pt0) * 0.3 * z + 0.5 + 0.2 * (hash22(cg0 + 3.0) - 0.5);
    vec3 col = imgLod(uv, 0.5) * (0.8 + 0.3 * hash21(cg0));
    finish(col * 1.05);
}
