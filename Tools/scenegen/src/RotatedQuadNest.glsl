//@doc
 * @brief ROTATED QUAD NEST: a nest of squares: the plane cut into a grid, every cell holding a smaller grid turned by the angle arctan one half (the
 * pinwheel angle, an irrational part of the full turn), which holds a smaller one again, down to six levels; the nests turn slowly, every
 * level at its own rate, and the photo stands in the innermost cells, turned by the sum of all the turns above it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the levels' turns, each at its own rate (integrated)
 *   audioSpread     -> the size of the cells (the spectrum's width)
 *
 * Knobs: levelsP (how many levels), hueP.
//@params levelsP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.08 + 0.6 * audioPhase;
    float N = 0.8 + 0.3 * clamp(audioSpread, 0.0, 1.0);
    vec2 q = p * N;
    float acc = 0.0;
    float path = 0.0;
    int levels = 1 + int(2.0 * clamp(levelsP, 0.0, 1.0));
    for (int i = 0; i < 6; ++i) {
        if (i >= levels) break;
        vec2 cell = floor(q + 0.5);
        vec2 f = q - cell;
        float a = 0.4636476 + 0.15 * sin(t * (0.6 + 0.2 * float(i)) + hash21(cell));
        acc += a;
        path = path * 3.1 + hash21(cell + float(i));
        q = rot2(a) * f * 2.1 + 0.0;
    }
    vec2 uv = rot2(-acc) * q * 0.6 + 0.5 + 0.1 * (hash22(vec2(mod(path, 53.0), 1.0)) - 0.5);
    vec3 col = imgLod(uv, 1.1 * float(levels) + 0.3) * (0.8 + 0.3 * hash21(vec2(mod(path, 97.0), 4.0)));
    finish(col * 1.05);
}
