//@doc
 * @brief SOL SHEAR SHEET: the Sol geometry as a shear: the photo is stretched exponentially in one direction and squeezed in the other, the amount set by the third coordinate, a height that runs across the picture in waves --
 * the sheet tilts like a sheet of corrugated iron, its ridges long and thin, its troughs wide and short; the photo's colour is shaded by the height.  The stretch grows with the swell and the axes turn with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the rate of the stretch
 *   audioPhase      -> the axes turn (integrated)
 *
 * Knobs: waveP (the number of corrugations), hueP.
//@params waveP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float ang = 0.3 * audioPhase + 0.02 * sceneTime;
    vec2 q = rot2(ang) * p;
    float k = 2.5 + 4.0 * clamp(waveP, 0.0, 1.0);
    float h = 0.55 * sin(k * q.x + 0.3 * audioAdvance) + 0.3 * sin(0.7 * k * q.y - 0.2 * audioAdvance + 1.0);
    float s = 0.7 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    vec2 w = vec2(q.x * exp(s * h), q.y * exp(-s * h));
    vec3 c = imgLod(rot2(-ang) * w * 0.8 + 0.5, 0.7 + max(0.0, s * abs(h)));
    finish(c * (0.75 + 0.4 * h) * 1.08);
}
