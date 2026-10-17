//@doc
 * @brief POINCARE DODECAHEDRAL SPACE: inside Poincare's dodecahedral space -- one dodecahedron whose every face is
 * glued to the opposite face with a tenth of a turn.  Whatever leaves through a face comes in through the opposite
 * one, turned; so the eye looks through the faces into the same room again and again, each time turned a little
 * further, a corridor of dodecahedra in every direction.  The edges glow; the faces are thin veils of the photo; a
 * ball floats in the middle of the room and of every copy.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the eye turns and drifts in the room (integrated)
 *   audioSwell      -> the veils thicken
 *   audioKick       -> the edges flash (light)
 *
 * Knobs: veilP (the faces' veils), ballP (the ball's size), photoP (photo share), hueP.
//@params veilP ballP photoP
//@audio audioSwell audioKick
//@body
/**  The outward normal of one of the dodecahedron's twelve faces (the icosahedron's corners).
 *
 * @param i  The face, 0..11. (in)
 *
 * @return
 *   The unit normal.
 **/
vec3 faceN(int i)
{
    float s1 = (i & 1) == 0 ? 1.0 : -1.0, s2 = (i & 2) == 0 ? 1.0 : -1.0;
    vec3 v = vec3(0.0, s1, 1.618034 * s2);
    int g = i / 4;
    if (g == 1) v = v.zxy;
    else if (g == 2) v = v.yzx;
    return v * 0.5257311;
}

/**  Turns a vector about a unit axis (Rodrigues).
 *
 * @param v  The vector. (in)
 * @param k  The unit axis. (in)
 * @param a  The angle. (in)
 *
 * @return
 *   The turned vector.
 **/
vec3 turnAbout(vec3 v, vec3 k, float a)
{
    return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a));
}

void main()
{
    vec2 p = screenP();
    float veil = (0.08 + 0.18 * clamp(veilP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float rb = 0.12 + 0.18 * clamp(ballP, 0.0, 1.0);
    // the eye: inside the room, drifting and turning slowly
    vec3 o = 0.38 * vec3(sin(0.07 * sceneTime), cos(0.053 * sceneTime + 1.0), sin(0.041 * sceneTime + 2.0));
    float ya = 0.06 * sceneTime + 0.01 * audioPhase, pa = 0.4 * sin(0.03 * sceneTime + 0.004 * audioPhase);
    vec3 fw = vec3(cos(pa) * sin(ya), sin(pa), cos(pa) * cos(ya));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 d = normalize(fw * 1.3 + rt * p.x + up * p.y);
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 col = vec3(0.0);
    float T = 1.0, dist = 0.0;
    for (int b = 0; b < 12; ++b) {
        // the exit face
        float tE = 1e9;
        int fi = 0;
        for (int i = 0; i < 12; ++i) {
            vec3 n = faceN(i);
            float dn = dot(d, n);
            if (dn > 1e-4) {
                float ti = (1.0 - dot(o, n)) / dn;
                if (ti < tE) { tE = ti; fi = i; }
            }
        }
        // the ball in the middle of the room
        float bo = dot(o, d), cc = dot(o, o) - rb * rb, disc = bo * bo - cc;
        if (disc > 0.0) {
            float tb = -bo - sqrt(disc);
            if (tb > 0.0 && tb < tE) {
                vec3 x = o + d * tb, n = normalize(x);
                vec3 photo = imgLod(n.xy * 0.4 + 0.5, 0.4);
                vec3 c = mix(tone * 1.2, photo * 1.3, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * (0.35 + 0.65 * max(dot(n, -d), 0.0));
                col += T * c * exp(-0.12 * (dist + tb));
                T = 0.0;
                break;
            }
        }
        vec3 e = o + d * tE;
        vec3 nF = faceN(fi);
        dist += tE;
        // the edges: the distance within the face to its five neighbours' planes
        float ed = 1e9;
        for (int j = 0; j < 12; ++j) {
            vec3 nj = faceN(j);
            float cj = dot(nF, nj);
            if (cj > 0.3 && cj < 0.9) ed = min(ed, (1.0 - dot(e, nj)) / sqrt(1.0 - cj * cj));
        }
        float fog = exp(-0.12 * dist);
        vec3 ax = normalize(cross(nF, vec3(0.31, 0.83, 0.47))), ay = cross(nF, ax);
        vec3 photo = imgLod(vec2(dot(e, ax), dot(e, ay)) * 0.6 + 0.5, 0.6);
        vec3 tf = imgPalette(0.15 + 0.06 * float(b) + 0.03 * audioPhase);
        float edge = exp(-ed * 40.0) + 0.4 * exp(-ed * 8.0);
        col += T * fog * (mix(tf, photo, 0.6 + 0.3 * clamp(photoP, 0.0, 1.0)) * veil
                          + mix(tf, vec3(1.0), 0.5) * edge * (0.5 + 0.8 * clamp(audioKick, 0.0, 1.0)));
        T *= 1.0 - veil;
        // through the face: in at the opposite one, a tenth of a turn on
        o = turnAbout(e - 2.0 * nF, nF, 0.6283185);
        d = turnAbout(d, nF, 0.6283185);
        o += nF * 1e-4;                                         // just inside the room again
        if (T < 0.02) break;
    }
    col += T * tone * 0.03;
    finish(col);
}
