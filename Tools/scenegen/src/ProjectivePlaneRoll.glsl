//@doc
 * @brief PROJECTIVE PLANE ROLL: a field of projective planes rolling past -- Steiner's Roman surface, the sphere
 * squeezed through itself so that opposite points meet, a closed surface with only one side, its three
 * self-crossings meeting in the middle.  Row on row of them roll across the view like wheels without slipping,
 * each tipped its own way, the photo on their faces.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the field rolls (integrated: the music's drive)
 *   audioSwell      -> the surfaces' sheen grows
 *   audioKick       -> the self-crossings flash (light)
 *
 * Knobs: tipP (how far each surface is tipped), sizeP (the surfaces' size), photoP (photo share), hueP.
//@params tipP sizeP photoP
//@audio audioSwell audioKick
//@body
vec3 gL = vec3(0.0);       // the hit in the surface's own frame

/**  Steiner's Roman surface, x^2 y^2 + y^2 z^2 + z^2 x^2 - x y z = 0, as a thin shell: the implicit value over its
 * gradient's length.
 *
 * @param q  The point in the surface's frame. (in)
 *
 * @return
 *   The distance estimate.
 **/
float romanD(vec3 q)
{
    vec3 s = q * q;
    float f = s.x * s.y + s.y * s.z + s.z * s.x - q.x * q.y * q.z;
    vec3 g = vec3(2.0 * q.x * (s.y + s.z) - q.y * q.z, 2.0 * q.y * (s.x + s.z) - q.x * q.z, 2.0 * q.z * (s.x + s.y) - q.x * q.y);
    return abs(f) / (length(g) + 0.03) - 0.004;
}

/**  The rolling field's distance.
 *
 * @param x     The point. (in)
 * @param roll  How far the field has rolled. (in)
 * @param tip   How far each surface is tipped. (in)
 * @param sc    The surfaces' scale. (in)
 *
 * @return
 *   The distance estimate (sets gL).
 **/
float rollD(vec3 x, float roll, float tip, float sc)
{
    const float P = 2.4;
    vec3 y = x - vec3(roll, 0.0, 0.0);
    vec2 cell = floor(y.xz / P + 0.5);
    vec3 q = y - vec3(cell.x * P, 0.0, cell.y * P);
    float h = hash21(cell);
    q.xy = rot2(roll / (0.58 * sc)) * q.xy;                     // rolling without slipping
    q.yz = rot2(tip * (h - 0.5) * 2.0) * q.yz;
    q.xz = rot2(6.2831853 * h) * q.xz;
    q /= sc;
    gL = q;
    float bound = length(q) - 0.62;
    return (bound > 0.05 ? bound : romanD(q)) * sc;
}

void main()
{
    vec2 p = screenP();
    float roll = 0.3 * sceneTime + 1.0 * audioAdvance;
    float tip = 0.3 + 1.2 * clamp(tipP, 0.0, 1.0);
    float sc = 1.4 + 0.5 * clamp(sizeP, 0.0, 1.0);
    vec3 ro = vec3(0.0, 3.4, -3.0 + 0.1 * sceneTime);
    vec3 ta = ro + vec3(0.2, -2.6, 2.2);
    vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.4 + rt * p.x + up * p.y);
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 140; ++i) {
        float d = rollD(ro + rd * t, roll, tip, sc);
        if (d < 0.0008 * (1.0 + t)) { hit = true; break; }
        t += clamp(d * 0.6, 0.002, 0.3);
        if (t > 16.0) break;
    }
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 fog = imgLod(p * 0.3 + 0.5, 4.0) * 0.18 + tone * 0.05;
    vec3 col = fog;
    if (hit) {
        vec3 x = ro + rd * t;
        vec3 q = gL;
        vec2 e = vec2(0.002, 0.0);
        vec3 n = normalize(vec3(rollD(x + e.xyy, roll, tip, sc) - rollD(x - e.xyy, roll, tip, sc),
                                rollD(x + e.yxy, roll, tip, sc) - rollD(x - e.yxy, roll, tip, sc),
                                rollD(x + e.yyx, roll, tip, sc) - rollD(x - e.yyx, roll, tip, sc)));
        vec3 photo = imgLod(normalize(q).xy * 0.45 + 0.5, 0.4);
        float diff = 0.3 + 0.7 * abs(dot(n, normalize(vec3(0.3, 0.9, -0.3))));
        float spec = pow(abs(dot(reflect(rd, n), normalize(vec3(0.3, 0.9, -0.3)))), 20.0) * (0.2 + 0.6 * clamp(audioSwell, 0.0, 1.0));
        // the self-crossings lie on the three axes
        float axis = min(min(length(q.xy), length(q.yz)), length(q.xz));
        float cross3 = 1.0 - smoothstep(0.0, 0.03, axis);
        vec3 c = mix(tone * 1.2, photo * 1.35, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff + spec * 0.5;
        c += mix(tone, vec3(1.0), 0.5) * cross3 * 0.5 * (0.3 + clamp(audioKick, 0.0, 1.0));
        col = mix(fog, c, exp(-0.08 * t));
    }
    finish(col);
}
