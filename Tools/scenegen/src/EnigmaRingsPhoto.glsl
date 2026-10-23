//@doc
 * @brief ENIGMA RINGS PHOTO: Leviant's Enigma: rays of black and bright run out from the middle and across them lie a few rings painted in the photo's colour at the same brightness as the grey of the rays: in the rings the eye
 * sees a shimmer circling round.  The rays are the photo's own dark and light tones; the number of rays follows the key (crossing over from a count to the next), the width of the rings the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of rays, with the chords (crossing over)
 *   audioSwell      -> the width of the rings
 *
 * Knobs: ringP (the number of rings), hueP.
//@params ringP
//@audio audioSwell audioHarmAdvance
//@body
/**  The picture with a given number of rays.
 *
 * @param p  The pixel. (in)
 * @param n  The number of rays (even). (in)
 * @param w  The width of the rings, 0..1 of the ring spacing. (in)
 *
 * @return
 *   The colour.
 **/
vec3 enigmaRays(vec2 p, float n, float w)
{
    float r = length(p), a = atan(p.y, p.x);
    float ray = smoothstep(-0.06, 0.06, sin(n * a));
    vec3 c = imgLod(p * 0.8 + 0.5, 1.2);
    vec3 col = mix(c * 0.12, c * 1.2, ray);
    float N = 3.0 + 5.0 * clamp(ringP, 0.0, 1.0);
    float fr = fract(r * N * 1.6);
    float band = smoothstep(0.0, 0.08, fr) * smoothstep(w, w - 0.08, fr);
    vec3 ringc = imgLod(vec2(0.5), 7.0);
    ringc = mix(vec3(luma(ringc)), ringc, 2.0);
    ringc *= 0.55 / max(luma(ringc), 0.05);
    return mix(col, mix(ringc, col, 0.25), band * 0.8);
}
void main()
{
    vec2 p = screenP();
    float n = 2.0 * (14.0 + 14.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance)));
    float n0 = 2.0 * floor(0.5 * n);
    float w = 0.3 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    finish(mix(enigmaRays(p, n0, w), enigmaRays(p, n0 + 2.0, w), smoothstep(0.0, 1.0, fract(0.5 * n))));
}
