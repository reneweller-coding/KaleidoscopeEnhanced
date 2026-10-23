//@doc
 * @brief MACH BAND RAMPS: Mach bands: the photo's brightness turned into ramps that rise and fall in straight lines, and where a ramp ends in a kink a bright or a dark line appears that is not in the picture; the ramps wander as the
 * brightness offset creeps with the music.  The ramps carry the photo's colour.  The sharpness of the kinks follows the spectral spread (sharp kinks give strong bands, round ones none).
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the sharpness of the kinks
 *   audioAdvance    -> the ramps wander (integrated)
 *
 * Knobs: rampP (how many ramps), hueP.
//@params rampP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec3 c = imgLod(uv, 2.0);
    float K = 2.0 + 3.0 * clamp(rampP, 0.0, 1.0);
    float v = luma(c) * K + 0.04 * audioAdvance + 0.01 * sceneTime;
    float tri = abs(fract(v) - 0.5) * 2.0;
    float sharp = clamp(0.2 + 0.8 * clamp(audioSpread, 0.0, 1.0), 0.0, 1.0);
    float rounded = tri * tri * (3.0 - 2.0 * tri);
    float ramp = mix(rounded, tri, sharp);
    vec3 hue = c / max(luma(c), 0.08);
    finish(hue * (0.12 + 0.95 * ramp) * 1.1);
}
