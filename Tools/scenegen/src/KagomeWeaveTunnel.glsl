//@doc
 * @brief KAGOME WEAVE TUNNEL: a tunnel woven of glowing ribbons in three directions -- the triaxial kagome weave of
 * baskets, with its hexagonal holes and little triangles -- turning as the flight runs through it; the mesh grows finer
 * or coarser as the harmony moves.  The wall is unrolled in true lengths, and three families of ribbons cross it at
 * sixty degrees: the rings and two helices, each with a whole number of ribbons around so the weave closes on itself.
 * Every ribbon passes over one family and under the other (1 over 2, 2 over 3, 3 over 1), which is the weave; no three
 * ribbons meet in one point, which leaves the hexagons open.  The mesh count steps with the harmony's advance and is
 * cross-faded as light.  Three shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mesh: a chord change weaves the tunnel finer or coarser (cross-faded)
 *   audioPhase       -> the weave turns (integrated)
 *   audioAdvance     -> the flight (integrated)
 *   audioSwell       -> the ribbons' glow
 *
 * Knobs: meshP (how fine the mesh is), bandP (the ribbons' width), hueP.
//@params meshP bandP
//@audio audioHarmAdvance audioPhase audioSwell
//@body
/**  The weave at a place on the unrolled wall.
 *
 * @param X    Around the wall (arc length). (in)
 * @param Y    Along the wall. (in)
 * @param M    The number of ribbons of each helix around. (in)
 * @param bw   The ribbons' half width (in their spacing). (in)
 * @param dX   A pixel's length around. (in)
 * @param dY   A pixel's length along. (in)
 * @param fh   The family's hue. (in)
 *
 * @return
 *   The ribbons' light here.
 **/
vec3 weave(float X, float Y, float M, float bw, float dX, float dY, float fh)
{
    const float R0 = 0.4;
    float L = 6.2831853 * R0 * 0.8660254 / M;                          // whole ribbons around for the helices
    float c1 = (X * 0.8660254 + Y * 0.5) / L, c2 = (-X * 0.8660254 + Y * 0.5) / L, c3 = Y / L;
    float g1 = length(vec2(0.8660254 * dX, 0.5 * dY)) / L, g3 = dY / L;
    float e1 = abs(fract(c1) - 0.5), e2 = abs(fract(c2) - 0.5), e3 = abs(fract(c3) - 0.5);
    float b1 = 1.0 - smoothstep(bw - g1, bw + g1, e1), b2 = 1.0 - smoothstep(bw - g1, bw + g1, e2);
    float b3 = 1.0 - smoothstep(bw - g3, bw + g3, e3);
    // over and under: 1 over 2, 2 over 3, 3 over 1
    float v1 = b1 * (1.0 - b3), v2 = b2 * (1.0 - b1), v3 = b3 * (1.0 - b2);
    float detail = 1.0 - smoothstep(0.08, 0.25, max(g1, g3));
    vec3 col = vec3(0.0);
    col += famLight(fh, 0.3, 0.4) * v1 * (0.6 + 0.4 * (1.0 - pow(e1 / bw, 2.0)));
    col += famLight(fh, 0.5, 0.4) * v2 * (0.6 + 0.4 * (1.0 - pow(e2 / bw, 2.0)));
    col += famLight(fh, 0.7, 0.4) * v3 * (0.6 + 0.4 * (1.0 - pow(e3 / bw, 2.0)));
    return mix(famLight(fh, 0.5, 0.4) * (1.0 - pow(1.0 - 2.0 * bw, 2.0)) * 0.7, col, detail);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.3 * sceneTime + 1.0 * audioAdvance;
    float X = (a + 0.015 * sceneTime + 0.2 * audioPhase) * R0, Y = z + fly;
    float dX = R0 / (r * resolution.y), dY = R0 / (r * r * resolution.y);
    float bw = 0.14 + 0.1 * clamp(bandP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    float base = 6.0 + 2.0 * floor(1.99 * clamp(meshP, 0.0, 1.0));
    vec3 gA = weave(X, Y, base + 2.0 * mod(hk, 3.0), bw, dX, dY, fh);
    vec3 gB = weave(X, Y, base + 2.0 * mod(hk + 1.0, 3.0), bw, dX, dY, fh);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.03 + mix(gA, gB, m) * glow;
    col = mix(col, famCol(fh, 0.5) * 0.3, smoothstep(5.0, 18.0, z));
    col += famLight(fh, 0.5, 0.7) * exp(-r * 10.0) * 0.4;
    finish(col);
}
