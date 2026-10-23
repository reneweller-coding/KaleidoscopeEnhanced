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
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param hd   The harmonic advance. (in)
 * @param R0   The room's size. (in)
 * @param sk   How far from a perfect room. (in)
 *
 * @return
 *   The colour.
 **/
vec3 billLook(ivec4 k, ivec4 kv, vec2 p, float t, float hd, float R0, float sk)
{
    float R = R0 * lv(kv.x, 3.0, 0.8, 1.2);
    float tilt = lv(kv.x, 2.0, -0.5, 0.5);
    float al = k.x == 0 ? 3.14159265 / (5.0 + float(lk(kv.x, 1.0, 3))) : 0.0;
    vec2 off = vec2(0.0);
    if (k.y == 0) al += lv(kv.y, 1.0, 0.06, 0.18) * sk * sin(lv(kv.y, 2.0, 0.1, 0.3) * t);
    else if (k.y == 1) tilt += lv(kv.y, 3.0, 0.02, 0.08) * t;
    else off = lv(kv.y, 4.0, 0.08, 0.22) * R * vec2(sin(lv(kv.y, 5.0, 0.07, 0.19) * t), cos(lv(kv.y, 6.0, 0.06, 0.16) * t));
    al += 0.15 * sk;
    vec2 q = p;
    if (k.z == 1) q += lv(kv.z, 1.0, 0.15, 0.45) * R * vec2(cos(lv(kv.z, 2.0, 0.1, 0.3) * t), sin(lv(kv.z, 3.0, 0.15, 0.39) * t));
    else if (k.z == 2) q += vec2(lv(kv.z, 4.0, 0.02, 0.06) * t, lv(kv.z, 5.0, 0.0125, 0.0375) * t);
    q = rot2(tilt) * (q - off);
    vec2 u = billUnfold(k.x, q, k.x == 0 ? al : tilt, R);
    if (k.x == 2 || k.x == 3) u -= vec2(lv(kv.x, 4.0, 0.4, 0.8) * R, lv(kv.x, 5.0, 0.1, 0.3) * R);
    float sc = (k.w == 0 ? 0.6 : (k.w == 1 ? 0.95 : 1.5)) * lv(kv.w, 1.0, 0.7, 1.3);
    return imgLod(u * sc * 0.5 / R * 0.8 + 0.5, lv(kv.w, 2.0, 0.3, 0.7));
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
            col += gLabW[i] * billLook(gLabK[i], gLabV[i], p, t, audioHarmAdvance, R, sk);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
