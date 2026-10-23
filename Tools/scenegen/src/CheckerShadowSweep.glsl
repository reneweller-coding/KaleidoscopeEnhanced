//@doc
 * @brief CHECKER SHADOW SWEEP: the checker shadow puzzle: a chessboard of flat photo tiles over which a soft shadow sweeps; a light tile in the shadow and a dark tile in the light have exactly the same brightness, yet one looks
 * light and the other dark.  The tiles are the photo's colours, flat, light and dark by turns.  The shadow wanders with the drive of the music, its edge grows sharp and soft with the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the shadow wanders (integrated)
 *   audioSwell      -> the sharpness of the shadow's edge
 *
 * Knobs: gridP (how many tiles), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float N = 6.0 + 7.0 * clamp(gridP, 0.0, 1.0);
    vec2 g = p * N;
    vec2 cell = floor(g);
    float tone = mod(cell.x + cell.y, 2.0);
    vec3 c = imgLod((cell + 0.5) / N * 0.8 + 0.5, 2.5);
    vec2 f = abs(fract(g) - 0.5);
    float edge = smoothstep(0.5, 0.44, max(f.x, f.y));
    float t = 0.03 * audioAdvance + 0.02 * sceneTime;
    vec2 sc = vec2(0.6 * sin(t), 0.15 * cos(0.7 * t));
    float d = length((p - sc) * vec2(1.0, 1.6)) - 0.3;
    float soft = 0.25 - 0.2 * clamp(audioSwell, 0.0, 1.0);
    float sh = smoothstep(-soft, soft, d);
    float shade = mix(0.55, 1.0, sh);
    vec3 col = c * mix(0.55, 1.0, tone) * shade * (0.85 + 0.15 * edge) * 1.2;
    finish(col);
}
