//@doc
 * @brief VEGA BULGE GRID: Vasarely's Vega: a chessboard drawn over a bulge that wanders through the picture: the squares grow toward the bulge's middle and shrink to its edge, and the surface seems to rise out of the plane.
 * The squares are cut from the photo (the photo bulges with the grid) and alternate light and dark.  The bulge wanders with the phase of the music, its height follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the bulge wanders (integrated)
 *   audioSwell      -> the bulge's height
 *
 * Knobs: gridP (how many squares), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * sceneTime + 0.15 * audioPhase;
    vec2 ctr = vec2(0.4 * sin(t * 2.0), 0.18 * sin(t * 3.0 + 1.0));
    vec2 d = p - ctr;
    float h = 0.45 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float sig = 0.38;
    vec2 q = ctr + d / (1.0 + h * 1.6 * exp(-dot(d, d) / (sig * sig)));
    float N = 7.0 + 7.0 * clamp(gridP, 0.0, 1.0);
    vec2 g = q * N;
    float tone = mod(floor(g.x) + floor(g.y), 2.0);
    vec3 c = imgLod(q * 0.8 + 0.5, 0.8);
    vec2 f = abs(fract(g) - 0.5);
    float edge = smoothstep(0.5, 0.46, max(f.x, f.y));
    finish(c * mix(0.17, 1.2, tone) * (0.85 + 0.15 * edge));
}
