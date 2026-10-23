//@doc
 * @brief RIVALRY WAVES DUET: binocular rivalry: two photos compete for the eye and the dominance runs as a wave through the picture, the front between them soft where one is winning; each photo is shifted slightly the other way so that
 * the two do not agree even where they cross.  The wavelength follows the spectral spread, the wave's direction turns with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the wavelength of the dominance wave
 *   audioAdvance    -> the front runs and turns (integrated)
 *
 * Knobs: softP (how soft the fronts are), hueP.
//@params softP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float ang = 0.02 * audioAdvance + 0.5 * sin(0.03 * sceneTime);
    float k = 3.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    float s = dot(p, vec2(cos(ang), sin(ang))) * k - 0.04 * audioAdvance - 0.05 * sceneTime;
    float m = 0.5 + 0.5 * sin(6.2831853 * s);
    float sf = 0.05 + 0.4 * clamp(softP, 0.0, 1.0);
    float mm = smoothstep(0.5 - sf, 0.5 + sf, m);
    vec3 a = imgLod(uv + vec2(0.01, 0.0), 0.7), b = imgB(uv - vec2(0.01, 0.0), 0.7);
    finish(mix(a, b, mm) * 1.05);
}
