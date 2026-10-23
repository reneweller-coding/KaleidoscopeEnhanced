//@doc
 * @brief CIRCLE SQUARING COLLAGE: circles whose areas equal the squares beside them: a checkerboard of cells in which the shape of the photo window glides
 * from round to square in one cell while it glides from square to round in the next, the area staying the same; outside the shape the photo lies dimmed.
 * The glide follows the swell, the windows drift slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the glide from round to square (and back in the neighbour)
 *   audioAdvance    -> the windows' drift (integrated)
 *
 * Knobs: cellsP (how many cells), hueP.
//@params cellsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv0 = p * 0.8 + 0.5;
    float t = sceneTime * 0.1 + 0.8 * audioAdvance;
    float N = 3.0 + 4.0 * clamp(cellsP, 0.0, 1.0);
    vec2 q = p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float par = mod(cell.x + cell.y, 2.0);
    float s = 0.5 + 0.5 * sin(0.3 * t + 3.0 * clamp(audioSwell, 0.0, 1.0));
    float g = par < 0.5 ? s : 1.0 - s;
    float nexp = 2.0 / max(1.0 - g * 0.97, 0.03);
    float r = mix(0.399, 0.354, g);
    float sh = pow(pow(abs(f.x), nexp) + pow(abs(f.y), nexp), 1.0 / nexp);
    float m = smoothstep(r, r * 0.9, sh);
    vec2 win = (hash22(cell) - 0.5) * 0.15;
    vec2 uv = f * 0.5 + 0.5 + win + 0.05 * vec2(sin(t + cell.x), cos(t + cell.y));
    vec3 inner = imgLod(uv, 0.5) * 1.1;
    vec3 outer = imgLod(uv0, 0.8) * 0.4;
    finish(mix(outer, inner, m));
}
