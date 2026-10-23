//@doc
 * @brief PINNA TWIST RINGS: the Pinna-Brelstaff illusion: rings of black and bright parallelograms, the slant of every ring opposite to its neighbours'; as the picture is carried toward the eye the rings seem to turn.  The picture
 * flies on: the rings are laid out on a logarithmic scale, so the drive of the music zooms it endlessly inward without a seam.  The parallelograms are the photo's dark and light tones; the number of elements round a ring follows the key,
 * crossing over from one count to the next.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom (integrated; the pattern repeats from ring to ring, so it never jumps)
 *   audioHarmAdvance -> the number of elements in a ring (crossing over)
 *
 * Knobs: ringP (how dense the rings are), hueP.
//@params ringP
//@audio audioHarmAdvance
//@body
/**  The picture with a given number of elements round the rings.
 *
 * @param p   The pixel. (in)
 * @param nb  The elements in a ring. (in)
 * @param K   The rings to the e-fold of the radius. (in)
 *
 * @return
 *   The colour.
 **/
vec3 pinnaRings(vec2 p, float nb, float K)
{
    float r = length(p) + 0.001, a = atan(p.y, p.x);
    float lr = (log(r) - 0.01 * audioAdvance - 0.004 * sceneTime) * K;
    float j = floor(lr);
    float fr = fract(lr);
    float u = (a / 6.2831853 + 0.5) * nb;
    float fa = fract(u);
    float par = mod(floor(u) + j, 2.0);
    float sg = mod(j, 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 lc = vec2(fa - 0.5 + sg * 0.55 * (fr - 0.5), fr - 0.5);
    float inside = smoothstep(0.5, 0.42, abs(lc.x) * 1.0) * smoothstep(0.5, 0.42, abs(lc.y));
    vec3 c = imgLod(p * 0.8 + 0.5, 1.2);
    return mix(c * 0.5, par < 0.5 ? c * 0.1 : c * 1.25, inside);
}
void main()
{
    vec2 p = screenP();
    float K = 3.0 + 3.5 * clamp(ringP, 0.0, 1.0);
    float nb = 18.0 + 10.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float n0 = floor(nb);
    finish(mix(pinnaRings(p, n0, K), pinnaRings(p, n0 + 1.0, K), smoothstep(0.0, 1.0, fract(nb))));
}
