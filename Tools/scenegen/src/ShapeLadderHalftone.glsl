//@doc
 * @brief SHAPE LADDER HALFTONE: every brightness step has a shape of its own -- dot, ring, cross, star, diamond, solid -- and the shapes flow into one another at the thresholds, which wander:
 * the photo as a ladder of ornaments, its colours from the photo at each place, grown or shrunk with the brightness.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the thresholds shift (the tones climb the ladder)
 *   audioPhase      -> the grid turns (integrated)
 *
 * Knobs: gridP (the grid's fineness), hueP.
//@params gridP
//@audio audioSwell
//@body
/**  A shape's mask in a cell: dot, ring, cross, star, diamond or solid.
 *
 * @param f    The place in the cell, -0.5..0.5. (in)
 * @param s    The shape, 0..5. (in)
 * @param sz   The size, 0..1. (in)
 *
 * @return
 *   The mask, 0..1.
 **/
float ladderShape(vec2 f, int s, float sz)
{
    float r = length(f), a = atan(f.y, f.x);
    float h = 0.5 * sz;
    if (s == 0) return smoothstep(h * 0.85, h * 0.65, r);
    if (s == 1) return smoothstep(0.06, 0.0, abs(r - h * 0.85) - 0.06 * sz);
    if (s == 2) return smoothstep(0.1 * sz + 0.04, 0.1 * sz, min(abs(f.x), abs(f.y))) * smoothstep(h + 0.04, h, max(abs(f.x), abs(f.y)));
    if (s == 3) return smoothstep(0.04, 0.0, r - h * (0.55 + 0.45 * cos(5.0 * a)));
    if (s == 4) return smoothstep(0.04, 0.0, abs(f.x) + abs(f.y) - h * 1.15);
    return smoothstep(0.04, 0.0, max(abs(f.x), abs(f.y)) - h);
}
void main()
{
    vec2 p = screenP();
    float t = 0.05 * sceneTime + 0.4 * audioPhase;
    float N = 24.0 + 34.0 * clamp(gridP, 0.0, 1.0);
    vec2 q = rot2(0.2 * sin(t)) * p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    vec3 c = imgLod(rot2(-0.2 * sin(t)) * ((cell + 0.5) / N) * 0.8 + 0.5, 1.5);
    float L = clamp(luma(c) + 0.2 * (clamp(audioSwell, 0.0, 1.0) - 0.5), 0.0, 0.999);
    float s = L * 5.0;
    float s0 = floor(s);
    float fr = smoothstep(0.35, 0.65, fract(s));
    float sz = 0.4 + 0.6 * fract(s * 1.0);
    float m = mix(ladderShape(f, int(s0), 0.5 + 0.5 * L), ladderShape(f, int(min(s0 + 1.0, 5.0)), 0.5 + 0.5 * L), fr);
    vec3 col = mix(vec3(0.06, 0.06, 0.07) + c * 0.12, c * 1.15, m);
    finish(col);
}
