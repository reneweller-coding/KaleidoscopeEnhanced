//@doc
 * @brief MIRROR BILLIARD LAB: a mirror room with any number of walls -- two mirrors at an angle that need not divide a
 * half turn, a triangle, a right isosceles triangle, a 30-60-90 triangle, a square, a regular pentagon, a regular
 * heptagon -- and the photo unfolded through a limited number of reflections.  Where the walls' angles are divisors of
 * pi the picture closes into a kaleidoscope; where they are not it splinters: the reflections do not meet again and the photo
 * breaks into shards along the lines of the last reflection.  The second stage moves the room (angle breathing,
 * slowly turning, the room sliding off centre), the third the standpoint (still, circling inside the room, drifting),
 * the fourth the photo's scale in the unfolded room.  The walk changes one stage at a time and cross-fades; a new
 * section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the wedge's angle glides toward the next divisor of pi (and past it) with each harmonic change (integrated)
 *   audioPhase      -> the room's turn and the standpoint's travel (integrated)
 *   audioSwell      -> how far the walls tilt away from a perfect room: the splinters open as the music swells
 *   audioSectionId/Age -> a new section re-rolls every stage (a new room)
 *
 * Knobs: seedP (the walk's seed), sizeP (the room's size), skewP (how far from a perfect room), hueP.
//@params seedP sizeP skewP
//@audio audioSwell audioHarmAdvance
//@body
/**  One mirror wall of a room as a half plane, dot(q, n) <= c.
 *
 * @param kind  The room, 0..6: wedge, triangle, right isosceles, 30-60-90, square, pentagon, heptagon. (in)
 * @param s     The wall's number. (in)
 * @param al    The wedge's angle (room 0) or the polygon's tilt. (in)
 * @param R     The room's size. (in)
 * @param n     The wall's outward normal. (out)
 *
 * @return
 *   The wall's offset c.
 **/
float billPlane(int kind, int s, float al, float R, out vec2 n)
{
    n = vec2(1.0, 0.0);
    if (kind == 0) { n = s == 0 ? vec2(0.0, -1.0) : vec2(-sin(al), cos(al)); return 0.0; }
    if (kind == 2) { n = s == 0 ? vec2(0.0, -1.0) : (s == 1 ? vec2(-0.7071068, 0.7071068) : vec2(1.0, 0.0)); return s == 2 ? R : 0.0; }
    if (kind == 3) { n = s == 0 ? vec2(0.0, -1.0) : (s == 1 ? vec2(-0.5, 0.8660254) : vec2(1.0, 0.0)); return s == 2 ? R : 0.0; }
    float N = kind == 1 ? 3.0 : (kind == 4 ? 4.0 : (kind == 5 ? 5.0 : 7.0));
    float a = al + 6.2831853 * float(s) / N;
    n = vec2(cos(a), sin(a));
    return R;
}

/**  Unfolds a point into the room by repeated reflection across its most violated wall.
 *
 * @param kind  The room, 0..6. (in)
 * @param q     The point. (in)
 * @param al    The wedge's angle (room 0) or the polygon's tilt. (in)
 * @param R     The room's size. (in)
 *
 * @return
 *   The point inside the room (or as near as the limited reflections bring it).
 **/
vec2 billUnfold(int kind, vec2 q, float al, float R)
{
    int nW = kind == 0 ? 2 : (kind == 1 ? 3 : (kind == 2 || kind == 3 ? 3 : (kind == 4 ? 4 : (kind == 5 ? 5 : 7))));
    for (int i = 0; i < 14; ++i) {
        float best = 0.0;
        vec2 bn = vec2(1.0, 0.0);
        for (int s = 0; s < 7; ++s) {
            if (s >= nW) break;
            vec2 n;
            float c = billPlane(kind, s, al, R, n);
            float d = dot(q, n) - c;
            if (d > best) { best = d; bn = n; }
        }
        q -= 2.0 * best * bn;
    }
    return q;
}

/**  One look of the lab.
 *
 * @param k    The classes: x the room, y the room's motion, z the standpoint, w the photo's scale. (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param hd   The harmonic advance. (in)
 * @param R    The room's size. (in)
 * @param sk   How far from a perfect room. (in)
 *
 * @return
 *   The colour.
 **/
vec3 billLook(ivec4 k, vec2 p, float t, float hd, float R, float sk)
{
    float tilt = 0.0;
    float al = k.x == 0 ? 3.14159265 / 5.0 : 0.0;
    vec2 off = vec2(0.0);
    if (k.y == 0) al += 0.12 * sk * sin(0.2 * t) + 0.5 * sk * sin(0.4 * hd) * 0.0;
    else if (k.y == 1) tilt = 0.05 * t;
    else off = 0.15 * R * vec2(sin(0.13 * t), cos(0.11 * t));
    al += 0.15 * sk;
    vec2 q = p;
    if (k.z == 1) q += 0.3 * R * vec2(cos(0.2 * t), sin(0.27 * t));
    else if (k.z == 2) q += vec2(0.04 * t, 0.025 * t);
    q = rot2(tilt) * (q - off);
    vec2 u = billUnfold(k.x, q, k.x == 0 ? al : tilt, R);
    if (k.x == 2 || k.x == 3) u -= vec2(0.6 * R, 0.2 * R);
    float sc = k.w == 0 ? 0.6 : (k.w == 1 ? 0.95 : 1.5);
    return imgLod(u * sc * 0.5 / R * 0.8 + 0.5, 0.5);
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(7, 3, 3, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float R = 0.35 + 0.35 * clamp(sizeP, 0.0, 1.0);
    float sk = clamp(0.2 + 0.7 * clamp(skewP, 0.0, 1.0) + 0.3 * sw, 0.0, 1.0);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * billLook(gLabK[i], p, t, audioHarmAdvance, R, sk);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
