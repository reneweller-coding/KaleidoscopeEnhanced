//@doc
 * @brief CROSS STITCH SWELL: the photo in cross stitches, every cross in its colour, glossy threads and canvas behind them; the stitches
 * breathe, swelling till they touch and shrinking back so the weave shows, and the gloss travels across the threads.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the stitches' size (the grid's scale breathes slightly) and the threads' weight
 *   audioPhase      -> the gloss travels (integrated)
 *
 * Knobs: gridP (how many stitches), threadP (the thread's thickness), hueP.
//@params gridP threadP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 2.0 * audioPhase;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float N = (30.0 + 40.0 * clamp(gridP, 0.0, 1.0)) * (1.0 - 0.06 * sw);
    vec2 q = p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    vec3 c = imgLod((cell + 0.5) / N * 0.8 + 0.5, 1.5);
    float w = 0.11 + 0.1 * clamp(threadP, 0.0, 1.0) + 0.05 * sw;
    float d1 = abs(f.x - f.y) * 0.7071, d2 = abs(f.x + f.y) * 0.7071;
    float a = smoothstep(w, w - 0.05, d1) * smoothstep(0.55, 0.4, max(abs(f.x), abs(f.y)));
    float b = smoothstep(w, w - 0.05, d2) * smoothstep(0.55, 0.4, max(abs(f.x), abs(f.y)));
    float top = a;
    float under = b * (1.0 - a);
    float gloss = 0.5 + 0.5 * sin(6.2831853 * (p.x * 0.7 + p.y * 0.4) + t);
    vec3 thread = c * (0.7 + 0.35 * cos(6.2831853 * min(d1, d2) / (2.0 * w)));
    vec3 canvas = vec3(0.16, 0.14, 0.11) * (0.8 + 0.5 * hash21(cell)) + 0.05 * imgLod(p * 0.8 + 0.5, 4.0);
    vec3 col = canvas;
    col = mix(col, thread * 0.8, under);
    col = mix(col, thread * (1.0 + 0.2 * gloss), top);
    finish(col * 1.1);
}
