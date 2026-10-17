//@doc
 * @brief CIRCLE MAP DEVIL STAIRS: the devil's staircase of the circle map -- the winding number as a function of the
 * driving frequency is constant on every rational step and rises only on a Cantor set: a staircase with infinitely
 * many steps, the big ones at 1/2, 1/3, 2/3, ever smaller ones between.  Six staircases are stacked across the
 * frame, each at its own coupling, mirrored about the middle, and they scroll sideways; the ground under each
 * staircase shows the photo, the step edges are lit like terraces.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the coupling: near K = 1 the stairs are complete (loud), at small K they melt into a slope
 *   audioAdvance    -> the stairs scroll (integrated)
 *   audioKick       -> the step edges flash (light)
 *
 * Knobs: rowsP (how many staircases), windowP (how much of the frequency range each shows), photoP (photo share),
 * hueP.
//@params rowsP windowP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float rows = 1.0 + floor(2.0 * clamp(rowsP, 0.0, 0.999));
    float yy = abs(p.y) * 2.0 * rows;                           // mirrored about the middle
    float ri = floor(yy), ry = fract(yy);
    float K = clamp((0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0)) * (0.7 + 0.3 * (ri + 1.0) / rows), 0.0, 1.0);
    float win = 0.2 + 0.8 * clamp(windowP, 0.0, 1.0);
    float om = fract(0.003 * sceneTime + 0.001 * audioAdvance + 0.17 * ri) + (p.x / 1.7777778 + 0.5) * win;
    float th = 0.0, tot = 0.0;
    for (int i = 0; i < 120; ++i) {
        float d = om - K / 6.2831853 * sin(6.2831853 * th);
        th += d;
        tot += d;
    }
    float W = tot / 120.0;                                      // the winding number, the staircase's height
    float h = fract(W - floor(om));                             // the stairs repeat with every whole turn
    // the staircase drawn in its row: the ground below the stair line, the sky above
    float line = 0.1 + 0.8 * h;
    float below = smoothstep(line + 0.004, line - 0.004, ry);
    vec2 uv = vec2(p.x * 0.7 + 0.5, (ri + ry) / rows * 0.5 + 0.25);
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(W * 2.0 + 0.1 * ri + 0.03 * audioPhase);
    vec3 ground = mix(tone * 1.1, photo, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * (0.6 + 0.6 * h);
    vec3 sky = imgLod(uv + vec2(0.0, 0.3), 1.5) * 0.35 + tone * 0.08;
    vec3 col = mix(sky, ground, below);
    // the step edges (where W jumps) and the stair line lit like terraces
    float edge = abs(dFdx(W)) * 60.0;
    col += mix(tone, vec3(1.0), 0.5) * (exp(-pow((ry - line) * 150.0, 2.0)) * 0.8 + min(edge, 1.0) * 0.6 * below)
           * (0.5 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
