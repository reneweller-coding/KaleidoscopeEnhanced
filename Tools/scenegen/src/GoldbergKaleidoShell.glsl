//@doc
 * @brief GOLDBERG KALEIDO SHELL: a shell of facets round the eye -- mostly six-sided, a few with five or seven, like a
 * Goldberg polyhedron grown from the sunflower's spiral lattice -- every facet a little kaleidoscope of the photo; the
 * eye circles inside the shell.  The facets are the cells round the points of a spherical Fibonacci lattice: the
 * nearest point to a view direction is found directly (Keinert's inverse mapping), the second nearest by checking
 * its neighbours, and the cell's edge lies where the two are equally near.  In each cell the direction is folded
 * six ways about the cell's point and read from the photo.  The photo's own colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the shell's subdivision refines (more and smaller facets, cross-faded between two counts)
 *   audioAdvance -> the eye circles (integrated)
 *
 * Knobs: facetP (the base number of facets), pieceP (how much of the photo a facet shows), hueP.
//@params facetP pieceP
//@audio audioSwell
//@body
/**  The fractional part of a product.
 *
 * @param a  One factor. (in)
 * @param b  The other. (in)
 *
 * @return
 *   fract(a b).
 **/
float madfrac(float a, float b)
{
    return a * b - floor(a * b);
}

/**  The nearest point of the spherical Fibonacci lattice of n points and the gap to the second nearest (Keinert).
 *
 * @param p    The unit direction. (in)
 * @param n    The number of points. (in)
 * @param q    Returns the nearest point. (out)
 * @param gap  Returns how much nearer the nearest is than the second (0 on a cell's edge). (out)
 *
 * @return
 *   The nearest point's index.
 **/
float inverseSF(vec3 p, float n, out vec3 q, out float gap)
{
    const float PHI = 1.6180339887, PI = 3.14159265;
    float m = 1.0 - 1.0 / n;
    float phi = min(atan(p.y, p.x), PI), cosTheta = p.z;
    float k = max(2.0, floor(log(n * PI * sqrt(5.0) * (1.0 - cosTheta * cosTheta)) / log(PHI * PHI)));
    float Fk = pow(PHI, k) / sqrt(5.0);
    vec2 F = vec2(floor(Fk + 0.5), floor(Fk * PHI + 0.5));
    vec2 ka = 2.0 * F / n;
    vec2 kb = 2.0 * PI * (fract((F + 1.0) * PHI) - (PHI - 1.0));
    mat2 iB = mat2(ka.y, -ka.x, kb.y, -kb.x) / (ka.y * kb.x - ka.x * kb.y);
    vec2 c = floor(iB * vec2(phi, cosTheta - m));
    float b1 = 8.0, b2 = 8.0, j = 0.0;
    q = vec3(0.0, 0.0, 1.0);
    for (int s = 0; s < 9; ++s) {
        vec2 uv = vec2(float(s % 3) - 1.0, float(s / 3) - 1.0);    // the lattice cells -1..1 round c
        float i = clamp(dot(F, uv + c), 0.0, n - 1.0);
        float ph = 2.0 * PI * madfrac(i, PHI - 1.0);
        float ct = m - 2.0 * i / n;
        float st = sqrt(max(1.0 - ct * ct, 0.0));
        vec3 cand = vec3(cos(ph) * st, sin(ph) * st, ct);
        float dd = length(cand - p);
        if (dd < b1) { b2 = b1; b1 = dd; q = cand; j = i; }
        else if (dd < b2 && dd > b1 + 1e-5) { b2 = dd; }
    }
    gap = b2 - b1;
    return j;
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  A facet's kaleidoscope for a direction.
 *
 * @param d    The direction. (in)
 * @param n    The number of facets. (in)
 * @param sz   The photo's piece per facet. (in)
 * @param fh   The colour family. (in)
 * @param gap  Returns the gap to the facet's edge. (out)
 *
 * @return
 *   The light.
 **/
vec3 facet(vec3 d, float n, float sz, float fh, out float gap)
{
    vec3 q;
    float j = inverseSF(d, n, q, gap);
    vec3 u1 = normalize(cross(q, vec3(0.0, 0.0, 1.0) + vec3(0.3, 0.0, 0.0))), u2 = cross(q, u1);
    vec2 w = vec2(dot(d, u1), dot(d, u2)) * sqrt(n) * 0.6;
    float sec = 6.2831853 / 6.0;
    float a = abs(mod(atan(w.y, w.x) + j, sec) - 0.5 * sec);
    vec2 k = length(w) * vec2(cos(a), sin(a));
    float hj = fract(j * 0.618034);
    return tone(imgLod(k * sz + vec2(0.2 + 0.6 * hj, 0.3 + 0.4 * fract(hj * 7.0)), 0.7), fh);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float base = 60.0 + 120.0 * clamp(facetP, 0.0, 1.0);
    float nf = base * (1.0 + 1.2 * clamp(audioSwell, 0.0, 1.0));
    float n0 = floor(nf / 20.0) * 20.0, n1 = n0 + 20.0, m = smoothstep(0.2, 0.8, (nf - n0) / 20.0);
    float sz = 0.3 + 0.4 * clamp(pieceP, 0.0, 1.0);
    float orbit = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec3 fw = normalize(vec3(cos(orbit), 0.3 * sin(0.7 * orbit), sin(orbit)));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 d = normalize(fw * 0.8 + rt * p.x + up * p.y);
    float g0, g1;
    vec3 c0 = facet(d, n0, sz, fh, g0), c1 = facet(d, n1, sz, fh, g1);
    vec3 col = mix(c0, c1, m);
    float gap = mix(g0, g1, m);
    col *= smoothstep(0.0, 0.012, gap);
    col += famLight(fh, 0.6, 0.5) * exp(-gap / 0.006) * 0.12;
    finish(col);
}
