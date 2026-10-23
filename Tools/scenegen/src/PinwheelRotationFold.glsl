//@doc
 * @brief PINWHEEL ROTATION FOLD: rotation symmetry only, no mirrors: the photo is folded into n sectors that are all turned the same way but never mirrored; the result is a pinwheel whose arms all show the photo in the same
 * direction, as in the wheel of a windmill; n glides with the key (crossing over from one count to the next) and the whole turns with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of arms (crossing over)
 *   audioPhase      -> the pinwheel turns (integrated)
 *
 * Knobs: zoomP (the zoom into the photo), hueP.
//@params zoomP
//@audio audioHarmAdvance
//@body
/**  The pinwheel with a given number of arms.
 *
 * @param p  The pixel. (in)
 * @param n  The number of arms. (in)
 *
 * @return
 *   The colour.
 **/
vec3 pinwheel(vec2 p, float n)
{
    float r = length(p), a = atan(p.y, p.x) - 0.1 * audioPhase - 0.01 * sceneTime;
    float w = 6.2831853 / n;
    float fa = a - floor(a / w) * w;
    vec2 q = r * vec2(cos(fa), sin(fa)) * (0.8 + 0.9 * clamp(zoomP, 0.0, 1.0));
    return imgLod(q * 0.8 + 0.5 + vec2(0.0, 0.15), 0.7);
}
void main()
{
    vec2 p = screenP();
    float n = 3.0 + 6.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float n0 = floor(n);
    finish(mix(pinwheel(p, n0), pinwheel(p, n0 + 1.0), smoothstep(0.0, 1.0, fract(n))) * 1.05);
}
