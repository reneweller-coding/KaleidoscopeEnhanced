//@doc
 * @brief HYPERBOLIC DODECAHEDRON FLIGHT: a flight through hyperbolic space tiled by regular dodecahedra, five round
 * every edge -- the {5,3,5} honeycomb, whose cells glued in pairs make the Seifert-Weber space.  Seen in the
 * Poincare ball from its centre: the edges are glowing tubes of the same hyperbolic thickness everywhere, the cells
 * shrinking toward the ball's rim without end.  The eye flies straight through face after face; after two cells
 * the honeycomb is itself again, so the flight never ends.  The photo colours the edges.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated: the music's drive)
 *   audioSwell      -> the edges thicken
 *   audioKick       -> the edges flash (light)
 *
 * Knobs: tubeP (the edges' base thickness), turnP (how the view turns), photoP (photo share), hueP.
//@params tubeP turnP photoP
//@audio audioSwell audioKick
//@body
float gN = 0.0;            // how many faces the point was folded through (its cell's distance in steps)
vec3 gF = vec3(0.0);       // the folded point

/**  The {5,3,5} honeycomb's distance in the Poincare ball: fold by the icosahedral mirrors, invert in the face
 * sphere while outside the central dodecahedron, then measure to the edge circle.
 *
 * @param y    The point in the ball. (in)
 * @param rad  The tubes' hyperbolic radius. (in)
 *
 * @return
 *   The distance estimate in the ball's coordinates (sets gN, gF).
 **/
float honeyD(vec3 y, float rad)
{
    const vec3 r2 = vec3(-0.809017, -0.5, 0.309017);
    const vec3 C = vec3(0.0, 0.6916863, 1.1191720);            // the face sphere's centre (D times the 5-fold axis)
    const float R2 = 0.7309760;                                 // its radius squared
    float scale = 1.0, n = 0.0;
    for (int it = 0; it < 24; ++it) {
        for (int k = 0; k < 6; ++k) {
            y.xy = abs(y.xy);
            y -= 2.0 * min(dot(y, r2), 0.0) * r2;
        }
        vec3 v = y - C;
        float vv = dot(v, v);
        if (vv >= R2) break;
        y = C + v * (R2 / vv);                                  // through the face into the next cell
        scale *= R2 / vv;
        n += 1.0;
    }
    gN = n;
    gF = y;
    // the edge: the circle where the face sphere meets the mirror y = 0
    vec2 q = vec2(length(y.xz - vec2(0.0, 1.119172)) - 0.5025395, y.y);
    float de = length(q) - rad * 0.5 * (1.0 - dot(y, y));
    return de / scale;
}

void main()
{
    vec2 p = screenP();
    float rad = (0.035 + 0.035 * clamp(tubeP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    // the flight: a hyperbolic translation along a 5-fold axis, wrapped after 4 inradii (two cells)
    const float RHO4 = 3.9855380;
    float s = RHO4 * fract(0.03 * sceneTime + 0.09 * audioAdvance);
    vec3 ax = vec3(0.0, 0.5257311, 0.8506508);
    vec3 a = tanh(0.5 * s) * ax;
    // the view: looking along the flight, turning slowly about it
    float tw = (0.02 + 0.06 * clamp(turnP, 0.0, 1.0)) * sceneTime;
    vec3 rt0 = normalize(cross(ax, vec3(1.0, 0.0, 0.0))), up0 = cross(rt0, ax);
    vec3 rt = cos(tw) * rt0 + sin(tw) * up0, up = -sin(tw) * rt0 + cos(tw) * up0;
    float sw = 0.35 * sin(0.04 * sceneTime);
    vec3 fw = normalize(ax + sw * rt);
    vec3 rd = normalize(fw * 1.2 + rt * p.x + up * p.y);
    float t = 0.0, glow = 0.0;
    bool hit = false;
    float aa = dot(a, a);
    for (int i = 0; i < 90; ++i) {
        vec3 x = rd * t;
        // the world point seen there: T_a(x), the translation carrying the centre to a
        float ax2 = 2.0 * dot(a, x), xx = dot(x, x);
        vec3 y = ((1.0 + ax2 + xx) * a + (1.0 - aa) * x) / (1.0 + ax2 + aa * xx);
        float sc = (1.0 - dot(y, y)) / max(1.0 - xx, 1e-5);     // the translation's local stretch
        float d = honeyD(y, rad) / max(sc, 1e-5);
        glow += 0.006 * exp(-60.0 * max(d, 0.0) / max(1.0 - xx, 0.02));
        if (d < 0.0004 * (1.0 - xx)) { hit = true; break; }
        t += d * 0.8;
        if (t > 0.995) break;
    }
    vec3 tone = imgPalette(0.45 + 0.03 * audioPhase);
    vec3 col = tone * 0.03;
    if (hit) {
        vec3 x = rd * t;
        float hd = 2.0 * atanh(min(t, 0.999));                  // the hyperbolic distance travelled
        vec3 photo = imgLod(gF.xz * 0.6 + 0.5, 0.5);
        vec3 tn = imgPalette(0.15 + 0.11 * gN + 0.03 * audioPhase);
        vec3 c = mix(tn * 1.3, photo * 1.4, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * (0.8 + 0.8 * clamp(audioKick, 0.0, 1.0));
        col = mix(col, c, exp(-0.28 * hd));
    }
    col += tone * glow;
    finish(col);
}
