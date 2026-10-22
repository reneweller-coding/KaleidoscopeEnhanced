//@doc
 * @brief TETRAHELIX STRANDS: Boerdijk-Coxeter helices -- tetrahedra stacked face to face into a twisted column --
 * drawn only by their edges of light, many of them side by side, the whole bundle winding about itself; the eye
 * flies along between them.  A helix's vertices sit at n times the angle arccos(-2/3) round its axis and n times
 * 1/sqrt(10) along it, each joined to the next three, every edge of length one.  One colour family from the photo,
 * a shade per strand.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the bundle's winding swells and eases with the chord changes (a bounded wave of twist), and
 *                       every strand turns on its own axis
 *   audioAdvance     -> the flight (integrated)
 *   audioSwell       -> the edges' glow widens
 *   audioKick        -> the vertices flash (light)
 *
 * Knobs: spacingP (how far apart the strands stand), edgeP (the edges' thickness), hueP.
//@params spacingP edgeP
//@audio audioHarmAdvance audioSwell audioKick
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

/**  A vertex of the Boerdijk-Coxeter helix.
 *
 * @param n     The vertex number. (in)
 * @param hand  +1 or -1: the helix' hand. (in)
 *
 * @return
 *   The vertex.
 **/
vec3 bcVertex(float n, float hand)
{
    const float TH = 2.3005240, R = 0.5196152, H = 0.3162278;
    return vec3(R * cos(hand * n * TH), R * sin(hand * n * TH), n * H);
}

/**  The distance to the helix' edges and to its vertices.
 *
 * @param q     The point in the strand's frame (axis z). (in)
 * @param hand  The hand. (in)
 *
 * @return
 *   x: the nearest edge, y: the nearest vertex.
 **/
vec2 tetrahelix(vec3 q, float hand)
{
    const float H = 0.3162278;
    float n0 = floor(q.z / H);
    float de = 1e9, dv = 1e9;
    for (int k = -3; k <= 1; ++k) {
        float n = n0 + float(k);
        vec3 a = bcVertex(n, hand);
        dv = min(dv, length(q - a));
        de = min(de, min(segD(q, a, bcVertex(n + 1.0, hand)),
                         min(segD(q, a, bcVertex(n + 2.0, hand)), segD(q, a, bcVertex(n + 3.0, hand)))));
    }
    return vec2(de, dv);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float SP = 2.6 + 1.2 * clamp(spacingP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float wave = 0.35 * sin(0.8 * h) + 0.2 * sin(0.33 * h + 1.0);
    float edge = (0.018 + 0.016 * clamp(edgeP, 0.0, 1.0)) * (0.85 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float kick = clamp(audioKick, 0.0, 1.0);
    float fly = 0.35 * sceneTime + 1.5 * audioAdvance;
    vec3 ro = vec3(0.3 * sin(0.05 * fly), 0.25 * cos(0.04 * fly), fly);              // between four strands
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.3 * sin(0.023 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.22 * sin(0.019 * sceneTime + 2.0)) * rd.yz;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 96; ++i) {
        vec3 x = ro + rd * t;
        // the bundle winds about the line of flight's mean axis
        vec2 xy = rot2(0.03 * x.z + wave * sin(0.12 * x.z)) * x.xy;
        vec2 cid = floor(xy / SP);
        vec2 qc = xy - (cid + 0.5) * SP;
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
        float hand = hc < 0.5 ? 1.0 : -1.0;
        vec3 q = vec3(rot2(6.2831853 * hc + 0.6 * wave * (hc - 0.5) * 4.0) * qc, x.z + 7.0 * hc);
        vec2 d = tetrahelix(q, hand);
        float de = d.x - edge;
        float ge = 1.0 / (1.0 + pow(max(de, 0.0) * 32.0, 2.0));
        float gv = exp(-pow(d.y / (3.0 * edge), 2.0)) * (0.4 + 2.0 * kick);
        float fade = exp(-0.08 * t) * smoothstep(0.05, 0.5, t);
        col += (famLight(fh, 0.15 + 0.7 * hc, 0.15) * ge + famLight(fh, 0.5, 0.6) * gv) * fade * 0.075;
        float wall = (0.5 * SP - max(abs(qc.x), abs(qc.y))) / max(length(rd.xy), 1e-3);
        t += clamp(0.6 * min(de, d.y), 0.02, max(wall, 0.0) + 0.03);
        if (t > 36.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
