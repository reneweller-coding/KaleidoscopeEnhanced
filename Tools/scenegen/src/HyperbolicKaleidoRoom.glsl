//@doc
 * @brief HYPERBOLIC KALEIDO ROOM: a room in hyperbolic space -- the Poincare ball tiled by dodecahedra, five round
 * every edge ({5,3,5}) -- whose walls are photo kaleidoscopes: every face shows the photo folded five ways, and the
 * rooms beyond the faces shrink toward the ball's rim without end.  The eye floats inside, drifting from room to
 * room.  A point is folded by the icosahedral mirrors and inverted through the face sphere while it lies outside the
 * central dodecahedron (the {5,3,5} distance of HyperbolicDodecahedronFlight); the face hit is coloured by the folded
 * point, shaded by how many faces lie between it and the eye.  The photo's own colours, calmed toward one colour
 * family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the drift through the rooms (integrated, wrapping after two cells)
 *   audioSwell   -> the faces' kaleidoscope rims glow
 *
 * Knobs: foldP (how much of the photo a face shows), turnP (how the view turns), hueP.  Distinct from the hyperbolic
 * scenes, which are flat discs.
//@params foldP turnP
//@audio audioSwell
//@body
float gN = 0.0;            // how many faces the point was folded through
vec3 gF = vec3(0.0);       // the folded point

/**  The {5,3,5} honeycomb's faces in the Poincare ball: fold by the icosahedral mirrors, invert in the face sphere
 * while outside the central dodecahedron, then measure to the face sphere.
 *
 * @param y  The point in the ball. (in)
 *
 * @return
 *   The distance estimate to the nearest face (sets gN, gF).
 **/
float roomD(vec3 y)
{
    const vec3 r2 = vec3(-0.809017, -0.5, 0.309017);
    const vec3 C = vec3(0.0, 0.6916863, 1.1191720);
    const float R2 = 0.7309760;
    float scale = 1.0, n = 0.0;
    for (int it = 0; it < 24; ++it) {
        for (int k = 0; k < 6; ++k) {
            y.xy = abs(y.xy);
            y -= 2.0 * min(dot(y, r2), 0.0) * r2;
        }
        vec3 v = y - C;
        float vv = dot(v, v);
        if (vv >= R2) break;
        y = C + v * (R2 / vv);
        scale *= R2 / vv;
        n += 1.0;
    }
    gN = n;
    gF = y;
    return (length(y - C) - sqrt(R2)) / scale;
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float fold = 0.5 + 0.7 * clamp(foldP, 0.0, 1.0);
    float rims = 0.15 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    // the drift: a hyperbolic translation along a 5-fold axis, wrapped after two cells (4 inradii)
    const float RHO4 = 3.9855380;
    float s = RHO4 * fract(0.012 * sceneTime + 0.05 * audioAdvance);
    vec3 ax = vec3(0.0, 0.5257311, 0.8506508);
    vec3 a = tanh(0.5 * s) * ax;
    float tw = (0.02 + 0.05 * clamp(turnP, 0.0, 1.0)) * sceneTime;
    vec3 rt0 = normalize(cross(ax, vec3(1.0, 0.0, 0.0))), up0 = cross(rt0, ax);
    vec3 rt = cos(tw) * rt0 + sin(tw) * up0, up = -sin(tw) * rt0 + cos(tw) * up0;
    vec3 fw = normalize(ax + 0.3 * rt * sin(0.04 * sceneTime) + 0.25 * up * cos(0.03 * sceneTime));
    vec3 rd = normalize(fw * 1.0 + rt * p.x + up * p.y);
    float t = 0.0;
    bool hit = false;
    float aa = dot(a, a);
    for (int i = 0; i < 80; ++i) {
        vec3 x = rd * t;
        float ax2 = 2.0 * dot(a, x), xx = dot(x, x);
        vec3 y = ((1.0 + ax2 + xx) * a + (1.0 - aa) * x) / (1.0 + ax2 + aa * xx);
        float sc = (1.0 - dot(y, y)) / max(1.0 - xx, 1e-5);
        float d = roomD(y) / max(sc, 1e-5);
        if (abs(d) < 0.0006 * (1.0 - xx)) { hit = true; break; }
        t += abs(d) * 0.8;
        if (t > 0.995) break;
    }
    vec3 col = famCol(fh, 0.45) * 0.05;
    if (hit) {
        // the face's kaleidoscope: the folded point seen from the face's centre, folded five ways
        const vec3 C = vec3(0.0, 0.6916863, 1.1191720);
        vec3 nrm = normalize(C);                                 // the face's axis (fixed: one frame per face)
        vec3 u1 = normalize(cross(nrm, vec3(1.0, 0.0, 0.0))), u2 = cross(nrm, u1);
        vec2 q = vec2(dot(gF, u1), dot(gF, u2)) * 2.0 / fold;
        float ang = atan(q.y, q.x), sec = 6.2831853 / 5.0;
        ang = abs(mod(ang, sec) - 0.5 * sec);
        vec2 k = length(q) * vec2(cos(ang), sin(ang));
        vec3 c = tone(imgLod(k * 0.5 + vec2(0.45, 0.4), 0.6 + 0.3 * gN), fh);
        float hd = 2.0 * atanh(min(t, 0.999));
        float rim = exp(-pow(length(q) * fold - 0.95, 2.0) / 0.004);
        col = mix(col, c + famLight(fh, 0.6, 0.5) * rim * rims, exp(-0.3 * hd));
    }
    finish(col);
}
