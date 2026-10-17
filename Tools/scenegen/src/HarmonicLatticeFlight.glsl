//@doc
 * @brief HARMONIC LATTICE FLIGHT: a flight through the lattice of just intonation -- every node a pitch reached by
 * steps of pure fifths (3/2) along one axis, pure major thirds (5/4) along the second and harmonic sevenths (7/4) along
 * the third, the nodes joined by rods.  Every node knows its pitch class; the ones the music is playing glow, so
 * chords light up as little shapes in the lattice -- a major triad a triangle, a seventh chord a tetrahedron -- and
 * the eye flies through the endless crystal of harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma     -> the nodes of the sounding pitch classes glow
 *   audioAdvance    -> the flight (integrated: the music's drive)
 *   audioKick       -> the glowing nodes flash (light)
 *
 * Knobs: rodP (the rods' thickness), nodeP (the nodes' size), photoP (photo share), hueP.
//@params rodP nodeP photoP
//@audio audioChroma[12] audioKick
//@body
float gPc = 0.0;           // the pitch class of the node hit (-1: a rod)

/**  The lattice's distance: nodes at the integer points, rods along the three axes.
 *
 * @param x    The point. (in)
 * @param rn   The nodes' radius. (in)
 * @param rr   The rods' radius. (in)
 *
 * @return
 *   The distance (sets gPc).
 **/
float latticeD(vec3 x, float rn, float rr)
{
    vec3 c = floor(x + 0.5);
    vec3 q = x - c;
    float node = length(q) - rn;
    float rod = min(min(length(q.xy), length(q.yz)), length(q.xz)) - rr;
    // the node's pitch class: a fifth is 7 semitones, a major third 4, a harmonic seventh about 10
    gPc = node < rod ? mod(7.0 * c.x + 4.0 * c.y + 10.0 * c.z, 12.0) : -1.0;
    return min(node, rod);
}

void main()
{
    vec2 p = screenP();
    float rn = 0.13 + 0.08 * clamp(nodeP, 0.0, 1.0);
    float rr = 0.02 + 0.03 * clamp(rodP, 0.0, 1.0);
    float s = 0.25 * sceneTime + 0.9 * audioAdvance;
    vec3 dirF = normalize(vec3(1.0, 0.618, 0.382));
    vec3 ro = dirF * s + vec3(0.5, 0.31, 0.17);
    float ya = 0.5 * sin(0.03 * sceneTime), pa = 0.3 * sin(0.023 * sceneTime);
    vec3 fw = normalize(dirF + vec3(sin(ya), sin(pa), 0.0) * 0.6);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.3 + rt * p.x + up * p.y);
    float side = latticeD(ro, rn, rr) < 0.0 ? -1.0 : 1.0;
    float t = 0.0, glow = 0.0;
    bool hit = false;
    vec3 glowC = vec3(0.0);
    for (int i = 0; i < 100; ++i) {
        vec3 x = ro + rd * t;
        float d = side * latticeD(x, rn, rr);
        if (gPc >= 0.0) {
            float lit = clamp(audioChroma[int(gPc)], 0.0, 1.0);
            glowC += imgPalette(gPc / 12.0 + 0.03 * audioPhase) * exp(-max(d, 0.0) * 12.0) * lit * 0.03 * exp(-0.1 * t);
        }
        if (d < 0.001 * (1.0 + t)) { hit = true; break; }
        t += d;
        if (t > 20.0) break;
    }
    vec3 tone = imgPalette(0.45 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1 + tone * 0.03;
    if (hit) {
        vec3 x = ro + rd * t;
        float pc = gPc;
        vec2 e = vec2(0.002, 0.0);
        vec3 n = normalize(vec3(latticeD(x + e.xyy, rn, rr) - latticeD(x - e.xyy, rn, rr), latticeD(x + e.yxy, rn, rr) - latticeD(x - e.yxy, rn, rr),
                                latticeD(x + e.yyx, rn, rr) - latticeD(x - e.yyx, rn, rr)));
        float diff = 0.35 + 0.65 * max(-side * dot(n, rd), 0.0);
        vec3 c;
        if (pc >= 0.0) {
            float lit = clamp(audioChroma[int(pc)], 0.0, 1.0);
            vec3 tn = imgPalette(pc / 12.0 + 0.03 * audioPhase);
            vec3 photo = imgLod(vec2(pc / 12.0, 0.5) + n.xy * 0.25, 1.0);
            c = mix(tn * 1.2, photo * 1.4, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff * (0.3 + 1.3 * lit)
                + mix(tn, vec3(1.0), 0.5) * lit * lit * 0.4 * (0.5 + clamp(audioKick, 0.0, 1.0));
        } else {
            c = imgLod(x.xy * 0.05 + x.z * 0.03, 1.5) * diff * 0.5;
        }
        col = mix(col, c, exp(-0.09 * max(t - 1.5, 0.0)));
    }
    col += glowC;
    finish(col);
}
