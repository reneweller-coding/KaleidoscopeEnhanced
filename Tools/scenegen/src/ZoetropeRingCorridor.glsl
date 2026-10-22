//@doc
 * @brief ZOETROPE RING CORRIDOR: open rings of neon stand on the line of flight, close behind each other, each
 * turned a little further than the one before; their gaps line up into spirals that run as the eye flies through,
 * like the slits of a zoetrope.  Three nested corridors of rings, each with its own gap count, fill the frame.  One
 * colour family from the photo, a shade per ring.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each chord change glides the number of gaps per ring (3, 4, 5, 6): the spirals split and join
 *   audioAdvance     -> the flight and the spirals' run (integrated): faster music, faster run
 *   audioBeatPhase   -> a brightness wave down the corridor, one ring per beat
 *   audioSwell       -> how wide the gaps open
 *
 * Knobs: twistP (how far each ring is turned against the last), gapP (the gaps' base width), hueP.  Distinct from
 * NeonRingTunnel, whose rings are closed.
//@params twistP gapP
//@audio audioHarmAdvance audioBeatPhase audioSwell
//@body
/**  The gap count of a step in the cycle 3, 4, 5, 6.
 *
 * @param k  The step. (in)
 *
 * @return
 *   The number of gaps.
 **/
float gapCount(float k)
{
    float m = mod(k, 4.0);
    return m < 0.5 ? 3.0 : m < 1.5 ? 4.0 : m < 2.5 ? 5.0 : 6.0;
}

/**  The distance to an open ring: a circle of radius R in the plane z = 0 with n gaps, the arcs filling the share
 * duty of the circle.
 *
 * @param q     The point in the ring's frame. (in)
 * @param R     The ring's radius. (in)
 * @param n     The number of gaps. (in)
 * @param duty  The arcs' share of the circle. (in)
 * @param rot   The ring's turn. (in)
 *
 * @return
 *   The distance to the arcs' centre line.
 **/
float openRing(vec3 q, float R, float n, float duty, float rot)
{
    float a = atan(q.y, q.x) - rot;
    float u = fract(a * n / 6.2831853);                          // place within one arc + gap
    float out_ = max(abs(u - 0.5 * duty) - 0.5 * duty, 0.0);    // beyond the arc's ends, as a share
    float arc = out_ * 6.2831853 / n * R;
    return length(vec3(length(q.xy) - R, q.z, arc));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float nA = gapCount(hk), nB = gapCount(hk + 1.0);
    float twist = 0.18 + 0.2 * clamp(twistP, 0.0, 1.0);
    float duty = clamp(0.78 - 0.18 * clamp(gapP, 0.0, 1.0) - 0.12 * clamp(audioSwell, 0.0, 1.0), 0.4, 0.9);
    float fly = 0.45 * sceneTime + 2.2 * audioAdvance;
    float run = 0.6 * audioAdvance + 0.03 * sceneTime;
    const float GAP = 0.55;                                      // the rings' spacing along the corridor
    vec3 rd = normalize(vec3(p, 1.0));
    rd.xz = rot2(0.1 * sin(0.03 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.08 * sin(0.025 * sceneTime + 1.0)) * rd.yz;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 110; ++i) {
        vec3 x = rd * t;
        float zw = x.z + fly;
        float k = floor(zw / GAP + 0.5);
        vec3 q = vec3(x.xy, zw - k * GAP);
        float best = 1e9;
        float beat = 0.6 + 0.6 * pow(0.5 + 0.5 * cos(6.2831853 * (k * 0.25 - audioBeatPhase)), 6.0);
        float fade = exp(-0.12 * t) * smoothstep(0.05, 0.4, t);
        for (int j = 0; j < 3; ++j) {
            float R = 1.2 * (1.0 + 0.9 * float(j));
            float rot = twist * k * (1.0 - 0.35 * float(j)) + run * (j == 1 ? -1.0 : 1.0) + 1.3 * float(j);
            float tube = 0.03 * (1.0 + 0.6 * float(j));
            float da = openRing(q, R, nA + float(j), duty, rot) - tube;
            float db = openRing(q, R, nB + float(j), duty, rot) - tube;
            // the two gap counts cross-fade in light (a blend of their distances would show neither)
            float g = (1.0 - hm) / (1.0 + pow(max(da, 0.0) * 30.0, 2.0)) + hm / (1.0 + pow(max(db, 0.0) * 30.0, 2.0));
            float shade = fract(k * 0.137 + float(j) * 0.31);
            col += famLight(fh, 0.15 + 0.7 * shade, 0.1 + 0.25 * g) * g * beat * fade * 0.075;
            best = min(best, min(da, db));
        }
        t += clamp(0.6 * best, 0.02, 0.3);
        if (t > 22.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
