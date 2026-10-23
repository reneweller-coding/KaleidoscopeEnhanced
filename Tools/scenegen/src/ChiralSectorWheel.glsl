//@doc
 * @brief CHIRAL SECTOR WHEEL: a wheel of sectors that turn alternately clockwise and against the clock; the photo in each sector turns with it, so at the seams the photo runs together and slides past itself in opposite
 * directions, like the teeth of gears that do not mesh.  The speed of the turning follows the drive of the music and the number of sectors the key (crossing over from one count to the next).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the speed of the turning (integrated)
 *   audioHarmAdvance -> the number of sectors (crossing over)
 *
 * Knobs: zoomP (the zoom into the photo), hueP.
//@params zoomP
//@audio audioHarmAdvance
//@body
/**  The wheel with a given number of sectors.
 *
 * @param p  The pixel. (in)
 * @param n  The number of sectors (even). (in)
 *
 * @return
 *   The colour.
 **/
vec3 chiralWheel(vec2 p, float n)
{
    float a = atan(p.y, p.x);
    float k = floor(a / (6.2831853 / n));
    float dirr = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
    float ang = dirr * (0.02 * audioAdvance + 0.01 * sceneTime);
    float z = 0.7 + 0.9 * clamp(zoomP, 0.0, 1.0);
    vec3 c = imgLod(rot2(ang) * p * z * 0.8 + 0.5, 0.7);
    float seam = exp(-pow(abs(fract(a / (6.2831853 / n)) - 0.0) * length(p) * n / 0.15 * 0.2, 2.0));
    return c * (1.0 - 0.3 * seam);
}
void main()
{
    vec2 p = screenP();
    float n = 2.0 * (3.0 + 4.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance)));
    float n0 = 2.0 * floor(0.5 * n);
    finish(mix(chiralWheel(p, n0), chiralWheel(p, n0 + 2.0), smoothstep(0.0, 1.0, fract(0.5 * n))) * 1.05);
}
