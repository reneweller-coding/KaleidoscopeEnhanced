//@doc
 * @brief CAFE WALL PHOTO: the cafe wall illusion: rows of photo tiles, light and dark by turns like a checkerboard, with narrow grey joints between the rows, each row pushed sideways by a fraction of a tile, so that the straight joints seem
 * to lean, now one way, now the other.  The tiles are the photo itself, lightened and darkened.  The push of the rows breathes with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the push of the rows breathes (integrated)
 *   audioSwell      -> the contrast of the tiles
 *
 * Knobs: rowsP (how many rows), hueP.
//@params rowsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float N = 7.0 + 8.0 * clamp(rowsP, 0.0, 1.0);
    float ry = (0.5 - p.y) * N;
    float row = floor(ry);
    float fy = fract(ry);
    float tw = 1.7 / N;
    float push = 0.25 + 0.16 * sin(0.35 * audioPhase + 0.02 * sceneTime);
    float xx = p.x / tw + mod(row, 2.0) * push * 2.0;
    float tile = mod(floor(xx) + row, 2.0);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.8);
    float sw = clamp(audioSwell, 0.0, 1.0);
    vec3 col = c * mix(0.18 - 0.08 * sw, 1.2, tile);
    float mortar = 1.0 - smoothstep(0.0, 0.05, fy) * smoothstep(1.0, 0.95, fy);
    col = mix(col, vec3(0.48) * (0.6 + 0.8 * imgLod(p * 0.8 + 0.5, 5.0)), mortar * 0.9);
    finish(col);
}
