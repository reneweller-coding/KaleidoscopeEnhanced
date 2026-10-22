//@doc
 * @brief DIHEDRAL IFS FLOWER: an endless wallpaper of fractal flowers with dihedral symmetry -- petals within petals,
 * lacy rims, a glowing heart -- all changing together as their maps glide, their symmetry changing with the sections.
 * Each flower is a kaleidoscopic iterated function system: fold the place into a mirrored sector, turn it, stretch it
 * and shift it, six times over; the closest approach to a small circle and to the sector's axis over the iterations
 * (scaled back down) draws the petals and their veins.  The flowers sit on a hexagonal lattice.  The light is shades
 * of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section changes the flowers' symmetry (cross-faded over six seconds)
 *   audioAdvance       -> the maps glide (integrated): every flower reshapes
 *   audioSwell         -> the flowers' glow
 *
 * Knobs: cellP (the flowers' size), detailP (how lacy they are), hueP.
//@params cellP detailP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A place folded into one mirror sector of the dihedral group with n rotations.
 *
 * @param q  The place. (in)
 * @param n  The order of the rotations. (in)
 *
 * @return
 *   The folded place.
 **/
vec2 foldD(vec2 q, float n)
{
    float sec = 6.2831853 / n;
    float a = abs(mod(atan(q.y, q.x), sec) - 0.5 * sec);
    return length(q) * vec2(cos(a), sin(a));
}

/**  A fractal flower.
 *
 * @param q     The place, the flower's centre at 0 (radius about 1). (in)
 * @param n     The symmetry. (in)
 * @param run   The maps' glide. (in)
 * @param sc    The stretch per iteration. (in)
 *
 * @return
 *   x the petals' rims, y the veins.
 **/
vec2 flower(vec2 q, float n, float run, float sc)
{
    float s = 1.0, dr = 9.0, dv = 9.0;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        q = foldD(q, n);
        q = rot2(0.25 * sin(run + 1.3 * fi) + 0.1) * q;
        q = q * sc - vec2(0.62 + 0.08 * sin(0.7 * run + fi), 0.0);
        s *= sc;
        dr = min(dr, abs(length(q) - 0.3) / s);
        dv = min(dv, abs(q.y) / s + 0.002 * fi);
    }
    return vec2(dr, dv);
}

/**  The symmetry for a section.
 *
 * @param k  The section's number. (in)
 *
 * @return
 *   The order.
 **/
float symN(float k)
{
    float j = mod(k, 4.0);
    return j < 0.5 ? 5.0 : j < 1.5 ? 6.0 : j < 2.5 ? 8.0 : 7.0;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.42 + 0.2 * clamp(cellP, 0.0, 1.0);
    float sc = 1.55 + 0.25 * clamp(detailP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float nA = symN(max(audioSectionPrev, 0.0)), nB = symN(max(audioSectionId, 0.0));
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 g = p / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, R) - 0.5 * R, qb = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q = (dot(qa, qa) < dot(qb, qb) ? qa : qb) * 2.0;
    vec2 a = flower(q, nA, run, sc), b = flower(q, nB, run, sc);
    float px = 2.0 / (S * resolution.y);
    float rims = (1.0 - m) * exp(-pow(a.x / px, 2.0)) + m * exp(-pow(b.x / px, 2.0));
    float veins = (1.0 - m) * exp(-pow(a.y / px, 2.0)) + m * exp(-pow(b.y / px, 2.0));
    float r = length(q);
    vec3 col = famCol(fh, 0.45) * 0.02 + famCol(fh, 0.3) * 0.08 * smoothstep(1.0, 0.2, r);
    col += famLight(fh, 0.3 + 0.4 * r, 0.5) * (0.7 * rims + 0.25 * veins) * glow;
    col += famLight(fh, 0.6, 0.8) * exp(-r * r / 0.01) * 0.6;
    finish(col);
}
