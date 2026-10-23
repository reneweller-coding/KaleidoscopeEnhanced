//@doc
 * @brief FRASER SPIRAL PHOTO: Fraser's spiral: concentric circles made of short slanting cord pieces, each ring of pieces slanting one way and the next the other, on a chequered ground: the eye sees one spiral, though the rings are
 * all circles.  The pieces and the ground are the photo's own tones, light and dark.  The slant of the pieces grows with the swell of the music and the number of rings follows the key (crossing over from one count to the next).
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the slant of the pieces
 *   audioHarmAdvance -> the number of rings, with the chords (crossing over)
 *
 * Knobs: ringP (how many rings), hueP.
//@params ringP
//@audio audioSwell audioHarmAdvance
//@body
/**  The picture with a given number of rings.
 *
 * @param p  The pixel. (in)
 * @param N  The number of rings to the radius 0.5. (in)
 *
 * @return
 *   The colour.
 **/
vec3 fraserRings(vec2 p, float N)
{
    float r = length(p) + 0.001, a = atan(p.y, p.x);
    float rr = r * N * 2.0;
    float j = floor(rr);
    float fr = fract(rr);
    float nb = 30.0;
    float u = (a / 6.2831853 + 0.5) * nb;
    float fa = fract(u);
    float par = mod(floor(u) + j, 2.0);
    float asp = clamp(6.2831853 * r * 2.0 * N / nb, 0.4, 3.5);
    vec2 lc = vec2((fa - 0.5) * asp, fr - 0.5);
    float al = (0.45 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * (mod(j, 2.0) < 0.5 ? 1.0 : -1.0);
    vec2 q = rot2(al) * lc;
    float el = smoothstep(0.06, 0.0, abs(q.x) - 0.6 * asp * 0.5) * smoothstep(0.06, 0.0, abs(q.y) - 0.17);
    vec3 c = imgLod(p * 0.8 + 0.5, 1.2);
    vec3 light = c * 1.2, dark = c * 0.14;
    float bgT = mod(floor(a / 6.2831853 * 10.0 + 5.0) + j, 2.0);
    vec3 bg = mix(c * 0.5, c * 0.8, bgT);
    return mix(bg, par < 0.5 ? dark : light, el);
}
void main()
{
    vec2 p = screenP();
    float N = 5.0 + 5.0 * clamp(ringP, 0.0, 1.0) + 3.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float n0 = floor(N);
    vec3 col = mix(fraserRings(p, n0), fraserRings(p, n0 + 1.0), smoothstep(0.0, 1.0, fract(N)));
    finish(col);
}
