//@doc
 * @brief HENON-HEILES ESCAPE: a particle in the Henon-Heiles potential, the triangle-shaped well of a star in a
 * galaxy, with energy above the threshold so it can leave through one of three exits.  Which exit, from each start
 * point, forms Wada basins: three colours interleaved so finely that every boundary point touches all three.  The
 * exits turn slowly; each basin is one of three cuts of the photo, shaded by how long the escape took.
 *
 * Audio Reactivity (structure, not only light):
 *   audioLevel      -> the energy (louder: the exits open wider, the basins coarsen)
 *   audioPhase      -> the exits turn round the well (integrated)
 *   audioKick       -> the Wada boundaries flash (light)
 *
 * Knobs: spanP (how much of the well the frame shows), launchP (the launch direction), photoP (photo share), hueP.
//@params spanP launchP photoP
//@audio audioKick
//@body
/**  The Henon-Heiles force at a point.
 *
 * @param q  The position. (in)
 *
 * @return
 *   The force -grad V, V = (x^2 + y^2) / 2 + x^2 y - y^3 / 3.
 **/
vec2 force(vec2 q) { return -vec2(q.x + 2.0 * q.x * q.y, q.y + q.x * q.x - q.y * q.y); }

void main()
{
    vec2 p = screenP();
    float span = 0.6 + 0.4 * clamp(spanP, 0.0, 1.0);
    float turn = 0.05 * audioPhase + 0.01 * sceneTime;
    vec2 q = rot2(turn) * p * span;
    float E = 0.19 + 0.08 * clamp(audioLevel, 0.0, 1.0);        // escape needs E > 1/6
    float V = 0.5 * dot(q, q) + q.x * q.x * q.y - q.y * q.y * q.y / 3.0;
    vec3 col;
    float idf = -2.0;                                           // which exit (-2: the wall, -1: still trapped)
    if (V >= E) {
        col = imgLod(p * 0.7 + 0.5, 2.5) * 0.12;               // energetically forbidden: the well's wall
    } else {
        float sp = sqrt(2.0 * (E - V));
        float la = 6.2831853 * clamp(launchP, 0.0, 1.0) + turn;
        vec2 v = sp * vec2(cos(la), sin(la));
        float dt = 0.06;
        int exitId = -1;
        float t = 0.0;
        for (int i = 0; i < 260; ++i) {
            v += 0.5 * dt * force(q);
            q += dt * v;
            v += 0.5 * dt * force(q);
            if (dot(q, q) > 1.6) {
                float ang = atan(q.y, q.x);
                exitId = int(mod(floor((ang + 3.14159265 / 2.0) / 2.0943951 + 0.5), 3.0));
                t = float(i) / 260.0;
                break;
            }
        }
        idf = float(exitId);
        if (exitId < 0) {
            col = imgLod(p * 0.7 + 0.5, 1.5) * 0.3;            // still trapped: the chaotic saddle
        } else {
            float e = float(exitId);
            vec2 uv = p * 0.7 + 0.5 + vec2(0.33, 0.61) * e;
            vec3 photo = imgLod(uv, 0.5);
            vec3 tone = imgPalette(e / 3.0 + 0.03 * audioPhase);
            col = mix(tone * 1.2, photo, 0.35 + 0.55 * clamp(photoP, 0.0, 1.0)) * (1.2 - 0.9 * sqrt(t));
        }
    }
    // the boundaries (derivatives taken outside the branches, where every pixel of a quad runs them)
    float edge = abs(dFdx(idf)) + abs(dFdy(idf));
    col += imgPalette(0.5 + 0.03 * audioPhase) * min(edge, 1.0) * 0.2 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
