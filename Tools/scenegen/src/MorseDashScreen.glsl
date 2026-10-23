//@doc
 * @brief MORSE DASH SCREEN: lines in which the length of the dash is the brightness: the photo is assembled from short dots and long dashes as in Morse code, the lines running against
 * one another, in the photo's own colours on a dark ground.  The dash length follows the swell and the lines' direction turns with the phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the dashes' length
 *   audioPhase      -> the lines run (alternating directions, integrated)
 *
 * Knobs: rowsP (how many lines), hueP.
//@params rowsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.1 * sceneTime + 0.8 * audioPhase;
    float R = 40.0 + 50.0 * clamp(rowsP, 0.0, 1.0);
    float row = floor(p.y * R);
    float fy = fract(p.y * R) - 0.5;
    float dirr = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
    float W = 14.0;
    float x = p.x * W + dirr * t * 0.8;
    float cx = floor(x);
    float fx = fract(x);
    vec2 cp = vec2((cx - dirr * t * 0.8 + 0.5) / W, (row + 0.5) / R);
    vec3 c = imgLod(cp * 0.8 + 0.5, 1.5);
    float len = clamp(luma(c) * (0.7 + 0.4 * clamp(audioSwell, 0.0, 1.0)), 0.06, 0.95);
    float dash = smoothstep(0.0, 0.05, fx - (1.0 - len) * 0.5) * smoothstep(0.0, 0.05, (1.0 + len) * 0.5 - fx);
    float body = smoothstep(0.42, 0.28, abs(fy));
    vec3 col = vec3(0.05, 0.05, 0.06) + c * 1.25 * dash * body;
    finish(col);
}
