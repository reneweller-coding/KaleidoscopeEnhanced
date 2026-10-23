//@doc
 * @brief TWISTED BILAYER PHOTO: two layers of the photo as hexagonal lattices of dots in its own colours, turned slightly against each other: a
 * superlattice of large moire cells appears in which the dots of the two layers coincide, and the picture swims in them as under a
 * magnifying glass.  The twist creeps through the magic angle of 1.1 degrees and beyond.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the twist angle breathes with it, through the magic angle and past it
 *   audioPhase      -> the lattices drift (integrated)
 *
 * Knobs: cellP (the dots' spacing), dotP (the dots' size), hueP.
//@params cellP dotP
//@audio audioSwell
//@body
/**  The colour of the hexagonal lattice dot nearest to a place, and the dot's coverage.
 *
 * @param q    The place, in lattice units. (in)
 * @param rad  The dot's radius, in lattice units. (in)
 * @param cov  The dot's coverage at the place, 0..1. (out)
 *
 * @return
 *   The lattice point (in lattice units).
 **/
vec2 hexDot(vec2 q, float rad, out float cov)
{
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    cov = smoothstep(rad, rad * 0.7, length(gv));
    return q - gv;
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.1 + 0.5 * audioPhase;
    float N = 14.0 + 22.0 * (1.0 - clamp(cellP, 0.0, 1.0));
    float th = 0.0192 * (0.4 + 2.2 * (0.5 + 0.5 * sin(0.5 * (sceneTime * 0.3 + 3.0 * audioSwell))));
    float dotR = 0.28 + 0.2 * clamp(dotP, 0.0, 1.0);
    vec2 qa = p * N + 0.2 * t;
    vec2 qb = rot2(th * 3.0) * p * N - 0.2 * t;
    float ca, cb;
    vec2 pa = hexDot(qa, dotR, ca);
    vec2 pb = hexDot(qb, dotR, cb);
    vec3 colA = imgLod(pa / N * 0.8 + 0.5, 2.5);
    vec3 colB = imgLod(rot2(-th * 3.0) * ((pb + 0.0) / N) * 0.8 + 0.5, 2.5);
    vec3 base = imgLod(p * 0.8 + 0.5, 0.8);
    vec3 col = base * 0.28 + colA * ca * 0.85 + colB * cb * 0.85;
    finish(col * 1.05);
}
