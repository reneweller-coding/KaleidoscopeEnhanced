//@doc
 * @brief LUMA FREQUENCY BEAT: two gratings whose spatial frequency is the brightness of the two photos: where a photo is bright its grating is fine, where dark coarse, and the product of the two gratings shows beats -- the places where the
 * two photos differ come out as slow waves, where they agree as flat grey -- so both photos can be read as maps of frequency.  The base frequency follows the key (gliding), the beat pattern runs with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the base frequency (a slow swing with the chords)
 *   audioAdvance    -> the gratings run (integrated)
 *
 * Knobs: gridP (the base frequency), hueP.
//@params gridP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec3 a = imgLod(uv, 1.5), b = imgB(uv, 1.5);
    float la = luma(a), lb = luma(b);
    float f0 = (20.0 + 30.0 * clamp(gridP, 0.0, 1.0)) * (0.85 + 0.3 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance)));
    float t = 0.05 * audioAdvance + 0.02 * sceneTime;
    float g1 = sin(6.2831853 * (f0 * (0.6 + 0.8 * la)) * (p.x * 0.8 + p.y * 0.6) + t);
    float g2 = sin(6.2831853 * (f0 * (0.6 + 0.8 * lb)) * (p.x * 0.8 + p.y * 0.6) - t);
    float beat = 0.5 + 0.5 * g1 * g2;
    finish(mix(vec3(0.05), 0.5 * (a + b) * 1.4, beat));
}
