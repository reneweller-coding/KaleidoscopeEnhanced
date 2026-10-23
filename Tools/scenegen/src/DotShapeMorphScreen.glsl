//@doc
 * @brief DOT SHAPE MORPH SCREEN: a dot screen whose dot glides from circle through square to line while the whole screen turns: the photo in a changing hand, every dot's size and
 * colour the photo's at its centre.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the shape (round to square to line)
 *   audioPhase      -> the screen turns (integrated)
 *
 * Knobs: gridP (the screen's fineness), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.05 * sceneTime + 0.4 * audioPhase;
    float N = 32.0 + 40.0 * clamp(gridP, 0.0, 1.0);
    mat2 R = rot2(0.35 + 0.3 * sin(t));
    vec2 q = R * p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    vec3 c = imgLod(transpose(R) * ((cell + 0.5) / N) * 0.8 + 0.5, 1.5);
    float L = clamp(luma(c), 0.05, 1.0);
    float sh = 0.5 + 0.5 * sin(0.4 * t * 10.0 + 2.0 * clamp(audioSwell, 0.0, 1.0));
    float ex = 2.0 + 6.0 * clamp(sh * 2.0, 0.0, 1.0);
    float asp = 1.0 + 3.0 * clamp(sh * 2.0 - 1.0, 0.0, 1.0);
    vec2 g = vec2(f.x / asp, f.y * 1.0);
    float r = pow(pow(abs(g.x), ex) + pow(abs(g.y), ex), 1.0 / ex);
    float m = smoothstep(0.05, -0.05, r - 0.52 * sqrt(L));
    vec3 col = vec3(0.05) + c * 1.2 * m;
    finish(col);
}
