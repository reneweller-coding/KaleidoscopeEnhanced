//@doc
 * @brief THREE-TORUS FLIGHT: a flight through a flat crystal space -- a cube whose faces are mirrors, so its frame of
 * bars, the ball in its middle and the beads at its corners repeat without end in every direction, mirrored cell by
 * cell into a lattice that fills all space.  The eye glides along an endless lane through the cells, past the
 * balls, under and over the bars; the photo colours the crystal by where it stands.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated: the music's drive)
 *   audioSwell      -> the balls swell a little
 *   audioKick       -> the bars' sheen flashes (light)
 *
 * Knobs: barP (the bars' thickness), ballP (the balls' size), photoP (photo share), hueP.
//@params barP ballP photoP
//@audio audioSwell audioKick
//@body
float gMat = 0.0;          // 0 the bars, 1 the balls, 2 the corner beads

/**  The crystal's distance: a cube of side 2 with mirrors for faces, holding bars on its edges, a ball in its middle
 * and beads at its corners.
 *
 * @param x    The point. (in)
 * @param rb   The bars' radius. (in)
 * @param rs   The middle ball's radius. (in)
 *
 * @return
 *   The distance (sets gMat).
 **/
float crystalD(vec3 x, float rb, float rs)
{
    vec3 q = abs(mod(x, 4.0) - 2.0);                            // mirrored cells of side 2
    vec3 e = min(q, 2.0 - q);                                   // the distance to each pair of faces
    float bars = min(min(length(e.xy), length(e.yz)), length(e.xz)) - rb;
    float ball = length(q - 1.0) - rs;
    float bead = length(e) - 2.4 * rb;
    float d = bars;
    gMat = 0.0;
    if (ball < d) { d = ball; gMat = 1.0; }
    if (bead < d) { d = bead; gMat = 2.0; }
    return d;
}

void main()
{
    vec2 p = screenP();
    float rb = 0.05 + 0.05 * clamp(barP, 0.0, 1.0);
    float rs = (0.16 + 0.1 * clamp(ballP, 0.0, 1.0)) * (0.9 + 0.2 * clamp(audioSwell, 0.0, 1.0));
    float s = 0.5 * sceneTime + 1.8 * audioAdvance;
    // the lane: along x, clear of the bars and of the balls
    vec3 ro = vec3(s, 1.0 + 0.25 * sin(0.13 * s), 0.55 + 0.15 * sin(0.09 * s));
    float ya = 0.5 * sin(0.04 * sceneTime), pa = 0.3 * sin(0.031 * sceneTime + 1.0);
    vec3 fw = normalize(vec3(cos(ya) * cos(pa), sin(pa), sin(ya) * cos(pa)));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.2 + rt * p.x + up * p.y);
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 120; ++i) {
        float d = crystalD(ro + rd * t, rb, rs);
        if (d < 0.0008 * (1.0 + t)) { hit = true; break; }
        t += d;
        if (t > 30.0) break;
    }
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 fog = imgLod(p * 0.3 + 0.5, 4.0) * 0.2 + tone * 0.06;
    vec3 col = fog;
    if (hit) {
        vec3 x = ro + rd * t;
        float mat = gMat;
        vec2 e = vec2(0.002, 0.0);
        vec3 n = normalize(vec3(crystalD(x + e.xyy, rb, rs) - crystalD(x - e.xyy, rb, rs),
                                crystalD(x + e.yxy, rb, rs) - crystalD(x - e.yxy, rb, rs),
                                crystalD(x + e.yyx, rb, rs) - crystalD(x - e.yyx, rb, rs)));
        vec3 photo = imgLod(mirrorUV(x.xy * 0.07 + x.zx * 0.05), 0.5);
        vec3 tm = imgPalette(0.15 + 0.3 * mat + 0.03 * audioPhase);
        float head = max(dot(n, -rd), 0.0);
        float spec = pow(max(dot(reflect(rd, n), normalize(vec3(0.4, 0.8, 0.2))), 0.0), 24.0);
        vec3 c = mix(tm * 1.2, photo * 1.35, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.3 + 0.7 * head)
                 + spec * (0.2 + 0.6 * clamp(audioKick, 0.0, 1.0)) * (mat < 0.5 ? 1.0 : 0.5);
        col = mix(fog, c, exp(-0.07 * t));
    }
    finish(col);
}
