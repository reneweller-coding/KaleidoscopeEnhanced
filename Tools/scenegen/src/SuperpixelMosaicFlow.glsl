//@doc
 * @brief SUPERPIXEL MOSAIC FLOW: the photo broken into superpixels as SLIC does -- seeds on a grid, every pixel joined
 * to the seed nearest to it in place and colour together, so the cells hug the picture's edges -- and set moving:
 * the seeds wander, cells crowd and give way, split where the picture is busy and merge where it is even.  Every
 * cell is filled with its own average colour, a mosaic that flows over the picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the cells' size: a broad spectrum makes them small
 *   audioAdvance    -> the seeds wander and the photo drifts (integrated)
 *
 * Knobs: sizeP (the base cell size), hugP (how closely the cells follow colour), photoP (how much of the photo's
 * detail shows in each cell), hueP.
//@params sizeP hugP photoP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.017 * sceneTime + 0.01 * audioAdvance), cos(0.014 * sceneTime));
    float S = (0.06 + 0.06 * clamp(sizeP, 0.0, 1.0)) * (1.25 - 0.5 * clamp(audioSpread, 0.0, 1.0));
    float hug = 2.0 + 10.0 * clamp(hugP, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5 + drift;
    vec3 c0 = imgLod(uv, 0.8);
    vec2 g = p / S;
    vec2 cell = floor(g);
    float T = 0.15 * sceneTime + 0.4 * audioAdvance;
    float best = 1e9;
    vec3 bestC = c0;
    float lod = log2(S * 1024.0 * 0.5) - 0.5;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 cc = cell + vec2(float(i), float(j));
        vec2 h = hash22(cc);
        vec2 seed = cc + 0.5 + 0.38 * vec2(sin(T + 6.2831853 * h.x), cos(0.8 * T + 6.2831853 * h.y));
        vec3 sc = imgLod(seed * S * 0.5 + 0.5 + drift, lod);
        vec3 dc = sc - c0;
        float d = dot(g - seed, g - seed) + hug * dot(dc, dc);  // place and colour together
        if (d < best) { best = d; bestC = sc; }
    }
    vec3 col = mix(bestC, bestC + (c0 - imgLod(uv, lod)) * 0.6, clamp(photoP, 0.0, 1.0));
    finish(max(col, 0.0) * 1.08);
}
