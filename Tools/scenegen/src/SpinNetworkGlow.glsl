//@doc
 * @brief SPIN NETWORK GLOW: a three-dimensional network of nodes and edges -- the diamond lattice, every node joined
 * to four others in a tetrahedron -- and packets of light travelling along the edges, splitting three ways at every
 * node; the eye flies down one of the lattice's open hexagonal channels.  The nearest node of each of the two
 * interleaved face-centred lattices is found by rounding, and the edges hanging from them are measured.  One colour
 * family from the photo, the packets paler than the edges.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> the packets flare up
 *   audioAdvance -> the packets' speed along the edges and the flight (integrated: livelier music, faster traffic)
 *   audioSwell   -> the edges' glow widens
 *
 * Knobs: packetP (how many packets per edge), edgeP (the edges' brightness), hueP.
//@params packetP edgeP
//@audio audioOnset audioSwell
//@body
/**  The nearest point of the face-centred cubic lattice (cube edge 1).
 *
 * @param x  The point. (in)
 *
 * @return
 *   The nearest lattice point.
 **/
vec3 fccNearest(vec3 x)
{
    vec3 q = 2.0 * x;
    vec3 f = floor(q + 0.5);
    if (mod(f.x + f.y + f.z, 2.0) > 0.5) {
        vec3 e = q - f;
        vec3 a = abs(e);
        if (a.x >= a.y && a.x >= a.z) f.x += e.x >= 0.0 ? 1.0 : -1.0;
        else if (a.y >= a.z) f.y += e.y >= 0.0 ? 1.0 : -1.0;
        else f.z += e.z >= 0.0 ? 1.0 : -1.0;
    }
    return 0.5 * f;
}

/**  The edges hanging from one node: their distance and, on the nearest, how far along it the point is.
 *
 * @param x     The point. (in)
 * @param a     The node. (in)
 * @param sgn   +1 for the first lattice's nodes, -1 for the second's. (in)
 * @param s     Returns the place along the nearest edge (0 at this node, 1 at the other end). (out)
 * @param mid   Returns the nearest edge's middle (its identity). (out)
 *
 * @return
 *   The distance to the nearest edge.
 **/
float nodeEdges(vec3 x, vec3 a, float sgn, out float s, out vec3 mid)
{
    float best = 1e9;
    s = 0.0;
    mid = a;
    for (int k = 0; k < 4; ++k) {
        vec3 v = k == 0 ? vec3(1.0, 1.0, 1.0) : k == 1 ? vec3(1.0, -1.0, -1.0) : k == 2 ? vec3(-1.0, 1.0, -1.0)
               : vec3(-1.0, -1.0, 1.0);
        vec3 b = a + sgn * 0.25 * v;
        vec3 ab = b - a;
        float u = clamp(dot(x - a, ab) / dot(ab, ab), 0.0, 1.0);
        float d = length(x - a - ab * u);
        if (d < best) { best = d; s = u; mid = 0.5 * (a + b); }
    }
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float S = 3.0;
    float packets = floor(1.0 + 2.0 * clamp(packetP, 0.0, 1.0));
    float edgeL = 0.35 + 0.5 * clamp(edgeP, 0.0, 1.0);
    float flare = 0.4 + 1.8 * clamp(audioOnset, 0.0, 1.0);
    float width = 0.02 + 0.015 * clamp(audioSwell, 0.0, 1.0);
    float run = 0.8 * audioAdvance + 0.06 * sceneTime;
    float glide = 0.28 * sceneTime + 1.2 * audioAdvance;
    vec3 ro = S * vec3(0.5, 0.0, 0.125) + glide * vec3(0.7071, 0.7071, 0.0)
              + 0.25 * vec3(-0.7071, 0.7071, 0.0) * sin(0.05 * glide);
    vec3 fw = normalize(vec3(0.7071, 0.7071, 0.0) + 0.15 * vec3(sin(0.03 * sceneTime), -sin(0.03 * sceneTime), 0.6 * sin(0.022 * sceneTime)));
    vec3 rt = normalize(cross(fw, vec3(0.0, 0.0, 1.0)));
    vec3 up = cross(rt, fw);
    vec2 pr = rot2(0.015 * sceneTime) * p;
    vec3 rd = normalize(fw * 1.1 + rt * pr.x + up * pr.y);
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 100; ++i) {
        vec3 x = (ro + rd * t) / S;
        vec3 A = fccNearest(x);
        vec3 B = fccNearest(x - 0.25) + 0.25;
        float sa, sb;
        vec3 ma, mb;
        float da = nodeEdges(x, A, 1.0, sa, ma);
        float db = nodeEdges(x, B, -1.0, sb, mb);
        // the packets run from the first lattice's nodes to the second's
        float s = da < db ? sa : 1.0 - sb;
        vec3 mid = da < db ? ma : mb;
        float d = min(da, db) * S;
        float hm = fract(sin(dot(mid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float pk = pow(0.5 + 0.5 * cos(6.2831853 * (packets * s - run + hm * 5.0)), 24.0);
        float g = 1.0 / (1.0 + pow(max(d - width, 0.0) * 50.0, 2.0));
        float core = exp(-pow(d / (2.5 * width), 2.0));
        float fade = exp(-0.12 * t) * smoothstep(0.05, 0.5, t);
        col += (famLight(fh, 0.2 + 0.6 * hm, 0.1) * g * edgeL + famLight(fh, 0.6, 0.6) * core * pk * flare * 2.0) * fade * 0.08;
        t += clamp(0.6 * (d - width), 0.02, 0.4);
        if (t > 36.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
