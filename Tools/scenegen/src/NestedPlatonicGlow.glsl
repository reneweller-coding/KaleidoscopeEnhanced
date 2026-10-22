//@doc
 * @brief NESTED PLATONIC GLOW: in every cell of a cubic lattice Platonic solids sit inside each other as edges of
 * light -- a tetrahedron on alternate corners of a cube, the cube on eight corners of a dodecahedron, and a small
 * solid at the heart -- each shell turning on its own axis at its own speed; the eye drifts down an aisle between
 * the cells.  The dodecahedron's edges are found by folding with the icosahedral mirrors, after which half of one
 * edge is left.  One colour family from the photo, a shade for each shell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the shells turn, each at its own rate (integrated), and the drift
 *   audioHarmAdvance -> each chord change morphs the innermost solid into the next: tetrahedron, octahedron, cube
 *   audioSwell       -> the edges' glow widens
 *
 * Knobs: edgeP (the edges' thickness), turnP (how fast the shells turn), hueP.
//@params edgeP turnP
//@audio audioHarmAdvance audioSwell
//@body
/**  The distance to a segment.
 *
 * @param x  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec3 x, vec3 a, vec3 b)
{
    vec3 ab = b - a;
    return length(x - a - ab * clamp(dot(x - a, ab) / dot(ab, ab), 0.0, 1.0));
}

/**  The cube's edges, half size 1.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float cubeEdges(vec3 x)
{
    vec3 a = abs(x);
    return min(length(vec3(max(a.x - 1.0, 0.0), a.y - 1.0, a.z - 1.0)),
               min(length(vec3(a.x - 1.0, max(a.y - 1.0, 0.0), a.z - 1.0)),
                   length(vec3(a.x - 1.0, a.y - 1.0, max(a.z - 1.0, 0.0)))));
}

/**  The tetrahedron's edges, on alternate corners of the cube of half size 1.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float tetraEdges(vec3 x)
{
    const vec3 v0 = vec3(1.0, 1.0, 1.0), v1 = vec3(1.0, -1.0, -1.0), v2 = vec3(-1.0, 1.0, -1.0), v3 = vec3(-1.0, -1.0, 1.0);
    return min(min(min(segD(x, v0, v1), segD(x, v0, v2)), min(segD(x, v0, v3), segD(x, v1, v2))),
               min(segD(x, v1, v3), segD(x, v2, v3)));
}

/**  The octahedron's edges, vertices at distance 1.4 on the axes.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float octaEdges(vec3 x)
{
    vec3 a = abs(x);
    const float R = 1.4;
    return min(segD(a, vec3(R, 0.0, 0.0), vec3(0.0, R, 0.0)),
               min(segD(a, vec3(0.0, R, 0.0), vec3(0.0, 0.0, R)), segD(a, vec3(0.0, 0.0, R), vec3(R, 0.0, 0.0))));
}

/**  The dodecahedron's edges through the cube's corners (vertices (+-1,+-1,+-1) and the cyclic
 * (0, +-phi, +-1/phi)): fold by the icosahedral mirrors, then measure to the half edge left in the corner.
 *
 * @param x  The point. (in)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float dodecaEdges(vec3 x)
{
    const vec3 r2 = vec3(-0.809017, -0.5, 0.309017);
    for (int k = 0; k < 6; ++k) {
        x.xy = abs(x.xy);
        x -= 2.0 * min(dot(x, r2), 0.0) * r2;
    }
    return segD(x, vec3(0.0, 0.0, 1.618034), vec3(0.618034, 0.0, 1.618034));
}

/**  The innermost solid of a step in the cycle tetrahedron, octahedron, cube.
 *
 * @param x  The point. (in)
 * @param k  The step. (in)
 *
 * @return
 *   The distance to its edges.
 **/
float innerSolid(vec3 x, float k)
{
    float m = mod(k, 3.0);
    return m < 0.5 ? tetraEdges(x) : m < 1.5 ? octaEdges(x) : cubeEdges(x);
}

/**  A rotation about an axis.
 *
 * @param ax  The unit axis. (in)
 * @param a   The angle. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat3 axisRot(vec3 ax, float a)
{
    float c = cos(a), s = sin(a);
    return mat3(c + ax.x * ax.x * (1.0 - c), ax.y * ax.x * (1.0 - c) + ax.z * s, ax.z * ax.x * (1.0 - c) - ax.y * s,
                ax.x * ax.y * (1.0 - c) - ax.z * s, c + ax.y * ax.y * (1.0 - c), ax.z * ax.y * (1.0 - c) + ax.x * s,
                ax.x * ax.z * (1.0 - c) + ax.y * s, ax.y * ax.z * (1.0 - c) - ax.x * s, c + ax.z * ax.z * (1.0 - c));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float CELL = 5.0;
    float turnRate = 0.4 + 0.8 * clamp(turnP, 0.0, 1.0);
    float ph = turnRate * (0.04 * sceneTime + 0.35 * audioAdvance);
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float edge = (0.012 + 0.014 * clamp(edgeP, 0.0, 1.0)) * (0.85 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    mat3 R0 = axisRot(normalize(vec3(0.3, 1.0, 0.2)), ph);
    mat3 R1 = axisRot(normalize(vec3(1.0, 0.2, -0.4)), -0.62 * ph);
    mat3 R2 = axisRot(normalize(vec3(-0.2, 0.5, 1.0)), 0.37 * ph);
    float drift = 0.3 * sceneTime + 1.3 * audioAdvance;
    vec3 ro = vec3(2.5 + 0.35 * sin(0.04 * drift), 2.5 + 0.3 * cos(0.033 * drift), drift);
    vec3 rd = normalize(vec3(p, 1.15));
    rd.xz = rot2(0.35 * sin(0.024 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.22 * sin(0.019 * sceneTime + 1.0)) * rd.yz;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 88; ++i) {
        vec3 x = ro + rd * t;
        vec3 cid = floor(x / CELL);
        vec3 q0 = x - (cid + 0.5) * CELL;
        vec3 q = q0;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        q = axisRot(normalize(vec3(hc - 0.5, 0.7, 0.3)), 6.2831853 * hc) * q;
        float dOut = dodecaEdges(R2 * q / 0.82) * 0.82;
        float dMid = cubeEdges(R1 * q / 0.82) * 0.82;
        float dTet = tetraEdges(R1 * q / 0.82) * 0.82;
        vec3 qi = R0 * q / 0.42;
        float dInA = innerSolid(qi, hk) * 0.42, dInB = innerSolid(qi, hk + 1.0) * 0.42;
        float dIn = min(dInA, dInB);
        float fade = exp(-0.05 * t) * smoothstep(0.05, 0.5, t);
        float gOut = 1.0 / (1.0 + pow(max(dOut - edge, 0.0) * 55.0, 2.0));
        float gMid = 1.0 / (1.0 + pow(max(dMid - edge, 0.0) * 55.0, 2.0));
        float gTet = 1.0 / (1.0 + pow(max(dTet - edge, 0.0) * 55.0, 2.0));
        // the innermost solids cross-fade in light (a blend of their distances would show neither)
        float gIn = (1.0 - hm) / (1.0 + pow(max(dInA - edge, 0.0) * 55.0, 2.0)) + hm / (1.0 + pow(max(dInB - edge, 0.0) * 55.0, 2.0));
        col += (famLight(fh, 0.15, 0.1 * gOut) * gOut + famLight(fh, 0.45, 0.15 * gMid) * gMid
                + famLight(fh, 0.65, 0.2 * gTet) * gTet + famLight(fh, 0.9, 0.5 * gIn) * gIn * 1.3) * fade * 0.05;
        float d = min(min(dOut, dMid), min(dTet, dIn)) - edge;
        // never step past the cell's wall
        vec3 qc = (CELL * 0.5 - abs(q0)) / max(abs(rd), 1e-3);
        t += clamp(0.7 * d, 0.02, max(min(qc.x, min(qc.y, qc.z)) + 0.02, 0.02));
        if (t > 40.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
