//@doc
 * @brief FIBER ORIENTATION PHOTO: a fibre plate in which every fibre has its own inclination: the photo is seen only where the fibres point at the eye; a field of inclination runs over the plate
 * as a slow wave, so a region of sight sweeps across the picture and the rest lies dark, faintly lit.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the field's direction follows the melody (smoothed)
 *   audioAdvance    -> the field runs (integrated)
 *   audioSwell      -> the region of sight's width
 *
 * Knobs: fibresP (how many fibres), hueP.
//@params fibresP
//@audio audioSwell audioMelodyPitch
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.1 * sceneTime + 0.8 * audioAdvance;
    float N = 20.0 + 30.0 * clamp(fibresP, 0.0, 1.0);
    vec2 cell = floor(p * N);
    vec2 tilt = hash22(cell) * 2.0 - 1.0;
    vec2 fld = vec2(sin(1.7 * p.x + 0.4 * t + 1.5 * clamp(audioMelodyPitch, 0.0, 1.0)), cos(2.1 * p.y - 0.3 * t));
    float sig = 0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float w = exp(-dot(tilt - fld, tilt - fld) / (sig * sig * 0.6));
    vec3 col = imgLod(uv, 0.8) * (0.22 + 1.0 * w);
    finish(col);
}
