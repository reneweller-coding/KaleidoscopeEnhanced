//@doc
 * @brief HYPERBOLIC VORONOI PHOTO: a Voronoi diagram in the Poincare disc: the cells shrink without end toward the rim, every cell shows a piece of the photo as seen from its seed (the hyperbolic translation that brings the seed to the
 * middle), with bright thin walls between them.  The whole disc is moved by a hyperbolic translation that wanders, so the seeds stream past; the number of cells follows the spectral spread (a new cell grows in from nothing).
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the translation of the disc wanders (integrated)
 *   audioSpread     -> the number of cells (growing in smoothly)
 *
 * Knobs: sizeP (the size of the disc), hueP.
//@params sizeP
//@audio audioSpread
//@body
/**  A Moebius translation of the unit disc taking a point to the origin.
 *
 * @param z  The point. (in)
 * @param a  The point taken to the origin (inside the unit disc). (in)
 *
 * @return
 *   The translated point.
 **/
vec2 mobiusTo0(vec2 z, vec2 a)
{
    vec2 num = z - a;
    vec2 den = vec2(1.0 - (a.x * z.x + a.y * z.y), a.x * z.y - a.y * z.x);
    return vec2(num.x * den.x + num.y * den.y, num.y * den.x - num.x * den.y) / dot(den, den);
}
/**  The hyperbolic distance of two points in the Poincare disc.
 *
 * @param z  The first point. (in)
 * @param w  The second point. (in)
 *
 * @return
 *   The distance.
 **/
float hypDist(vec2 z, vec2 w)
{
    float dd = dot(z - w, z - w) / max((1.0 - dot(z, z)) * (1.0 - dot(w, w)), 1e-4);
    return acosh(1.0 + 2.0 * dd);
}
void main()
{
    vec2 p = screenP();
    float R = 0.4 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec2 z = p / R;
    float t = 0.02 * sceneTime + 0.1 * audioPhase;
    vec2 a = 0.45 * vec2(sin(t), sin(1.3 * t + 1.0));
    float nSeed = 6.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    vec3 col = imgLod(p * 0.8 + 0.5, 3.0) * 0.25;
    if (dot(z, z) < 0.995) {
        vec2 u = mobiusTo0(z, -a);
        float d1 = 99.0, d2 = 99.0;
        vec2 best = vec2(0.0);
        float hb = 0.0;
        for (int k = 0; k < 12; ++k) {
            float fk = float(k);
            vec2 h = hash22(vec2(fk, 3.0));
            vec2 sd = 0.85 * sqrt(h.x) * vec2(cos(6.2831853 * h.y), sin(6.2831853 * h.y));
            float d = hypDist(u, sd) + 3.0 * (1.0 - clamp(nSeed - fk, 0.0, 1.0));
            if (d < d1) { d2 = d1; d1 = d; best = sd; hb = h.x; } else if (d < d2) d2 = d;
        }
        vec2 loc = mobiusTo0(u, best);
        vec3 c = imgLod(loc * 0.9 * 0.8 + 0.5 + 0.2 * vec2(hb, fract(hb * 7.0)), 0.7);
        float wall = smoothstep(0.0, 0.18, d2 - d1);
        col = (c * (0.55 + 0.5 * wall) + 0.35 * (1.0 - wall)) * smoothstep(1.0, 0.93, length(z)) * 1.1;
    }
    finish(col);
}
