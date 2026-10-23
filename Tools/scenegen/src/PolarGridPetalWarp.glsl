//@doc
 * @brief POLAR GRID PETAL WARP: a polar net whose rings turn against one another and draw petals into the photo: every ring is rotated a little differently, and the radius of the photo swells and shrinks by turns round the
 * ring, so that the picture is a flower of petals with the rings sliding past each other.  The number of petals follows the key (crossing over from one count to the next), the turning of the rings the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of petals (crossing over)
 *   audioPhase      -> the rings turn against each other (integrated)
 *
 * Knobs: ringP (the number of rings), hueP.
//@params ringP
//@audio audioHarmAdvance
//@body
/**  The picture with a given number of petals.
 *
 * @param p  The pixel. (in)
 * @param n  The petals. (in)
 *
 * @return
 *   The colour.
 **/
vec3 petalWarp(vec2 p, float n)
{
    float r = length(p) + 0.0005, a = atan(p.y, p.x);
    float K = 3.0 + 5.0 * clamp(ringP, 0.0, 1.0);
    float rho = 0.4 * sin(6.2831853 * r * K * 0.5 + 0.3 * audioPhase) * smoothstep(0.0, 0.25, r);
    float pet = 1.0 + 0.2 * sin(n * (a + rho));
    vec2 q = r * pet * vec2(cos(a + 0.5 * rho), sin(a + 0.5 * rho));
    return imgLod(q * 0.8 + 0.5, 0.7);
}
void main()
{
    vec2 p = screenP();
    float n = 5.0 + 5.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float n0 = floor(n);
    finish(mix(petalWarp(p, n0), petalWarp(p, n0 + 1.0), smoothstep(0.0, 1.0, fract(n))) * 1.08);
}
