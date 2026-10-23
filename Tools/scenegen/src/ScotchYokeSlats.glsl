//@doc
 * @brief SCOTCH YOKE SLATS: a row of Scotch-yoke pistons (crank slides) each with its crank phase moved on a step: the heads are strips of the photo that slide up and down in pure sine motion and run as a wave along the row, a little
 * guide slot drawn in each.  The crank turns with the phase of the music, the stroke follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the crank turns (integrated)
 *   audioSwell      -> the stroke
 *
 * Knobs: slatP (the number of slats), hueP.
//@params slatP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 16.0 + 26.0 * clamp(slatP, 0.0, 1.0);
    float xs = (p.x / asp + 0.5) * N;
    float k = floor(xs);
    float f = fract(xs);
    float stroke = 0.08 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float ph = 0.4 * audioPhase + 0.15 * sceneTime + 0.35 * k;
    float y = stroke * sin(ph);
    vec3 c = imgLod(vec2(p.x * 0.8 + 0.5, (p.y - y) * 0.8 + 0.5), 0.8);
    float slot = smoothstep(0.0, 0.1, f) * smoothstep(1.0, 0.9, f);
    finish(c * (0.55 + 0.45 * slot) * 1.1);
}
