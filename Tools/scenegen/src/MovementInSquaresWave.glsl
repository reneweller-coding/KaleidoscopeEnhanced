//@doc
 * @brief MOVEMENT IN SQUARES WAVE: Riley's "Movement in Squares": a chessboard whose squares are squeezed together toward a line that runs, bent, through the picture, so that the squares seem to turn from a flat field into a folded
 * sheet.  Every square shows a piece of the photo, light and dark by turns.  The line wanders with the phase of the music and the squeeze grows with the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the squeeze line wanders (integrated)
 *   audioSwell      -> how hard the squares are squeezed
 *
 * Knobs: gridP (how many squares), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * sceneTime + 0.12 * audioPhase;
    vec2 dir = vec2(cos(0.4 * sin(t)), sin(0.4 * sin(t)));
    vec2 nrm = vec2(-dir.y, dir.x);
    float along = dot(p, dir);
    float off = 0.2 * sin(t * 2.0 + 3.0 * along);
    float tt = dot(p, nrm) - off;
    float w = 0.16;
    float k = 1.6 + 2.0 * clamp(audioSwell, 0.0, 1.0);
    float q = tt + k * w * tanh(tt / w);
    float N = 8.0 + 10.0 * clamp(gridP, 0.0, 1.0);
    vec2 g = vec2(along * N, q * N * 0.6);
    float tone = mod(floor(g.x) + floor(g.y), 2.0);
    vec3 c = imgLod(p * 0.8 + 0.5, 1.0);
    vec2 f = abs(fract(g) - 0.5);
    finish(c * mix(0.15, 1.2, tone) * (0.88 + 0.12 * smoothstep(0.5, 0.45, max(f.x, f.y))));
}
