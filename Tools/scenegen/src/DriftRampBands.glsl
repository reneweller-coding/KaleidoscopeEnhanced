//@doc
 * @brief DRIFT RAMP BANDS: rows of tone ramps -- the photo's colour fading from bright to dark and then flipping back at once -- which make the picture drift in the corner of the eye, as in the "peripheral drift" illusions; the
 * rows run alternately one way and the other.  The ramps are the photo's own colours.  Their length follows the spectral spread and their direction turns slowly with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the length of the ramps
 *   audioPhase      -> the direction of the ramps turns (integrated)
 *
 * Knobs: rowsP (how many rows), hueP.
//@params rowsP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float N = 6.0 + 8.0 * clamp(rowsP, 0.0, 1.0);
    float row = floor((0.5 - p.y) * N);
    float dirr = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
    float ang = 0.15 * audioPhase * 0.2 + 0.1 * sin(0.03 * sceneTime);
    vec2 u = rot2(ang) * p;
    float L = 0.06 + 0.1 * clamp(audioSpread, 0.0, 1.0);
    float saw = fract(dirr * u.x / L);
    vec3 c = imgLod(p * 0.8 + 0.5, 1.2);
    float fy = fract((0.5 - p.y) * N);
    float gapl = smoothstep(0.0, 0.05, fy) * smoothstep(1.0, 0.95, fy);
    finish(c * mix(0.14, 1.25, saw) * (0.6 + 0.4 * gapl));
}
