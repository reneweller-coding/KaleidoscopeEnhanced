//@doc
 * @brief CUBE RING TUNNEL: a flight through rings of tumbling cubes with glowing edges: every ring a circle of cubes
 * round the flight path, every cube turning about its own tilted axis, each a little later than its neighbour and each
 * ring later than the one before, so the turning runs round the rings and along the tunnel with the music's phase.  A
 * place on the screen tries the nearest cubes of the nearest rings: each cube's eight corners are turned and projected,
 * and its twelve edges glow by their distance on the screen.  The edges are shades of one colour family from the
 * photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase   -> the cubes turn, one after another round the rings and along the tunnel (integrated)
 *   audioAdvance -> the flight through the rings (integrated)
 *   audioSwell   -> the edges' glow
 *
 * Knobs: countP (cubes per ring), sizeP (the cubes' size), hueP.
//@params countP sizeP
//@audio audioPhase audioSwell
//@body
/**  Turns a point about an axis.
 *
 * @param v   The point. (in)
 * @param ax  The axis (unit length). (in)
 * @param an  The angle. (in)
 *
 * @return
 *   The turned point.
 **/
vec3 turnAbout(vec3 v, vec3 ax, float an)
{
    float c = cos(an), s = sin(an);
    return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c);
}

/**  The distance on the screen to a projected segment.
 *
 * @param p  The place. (in)
 * @param a  The segment's start. (in)
 * @param b  The segment's end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec2 p, vec2 a, vec2 b)
{
    vec2 ab = b - a, ap = p - a;
    return length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
}

/**  A cube's glowing edges.
 *
 * @param p    The place on the screen. (in)
 * @param c    The cube's centre (view space). (in)
 * @param h    Its half size. (in)
 * @param ax   Its axis. (in)
 * @param an   Its turn. (in)
 *
 * @return
 *   The nearest edge's distance on the screen, scaled by depth.
 **/
float cubeEdges(vec2 p, vec3 c, float h, vec3 ax, float an)
{
    vec2 v[8];
    for (int i = 0; i < 8; ++i) {
        vec3 o = vec3(i % 2 == 0 ? -h : h, (i / 2) % 2 == 0 ? -h : h, i / 4 == 0 ? -h : h);
        vec3 q = c + turnAbout(o, ax, an);
        v[i] = q.xy / max(q.z, 0.05);
    }
    float d = 9.0;
    d = min(d, segD(p, v[0], v[1])); d = min(d, segD(p, v[2], v[3])); d = min(d, segD(p, v[4], v[5]));
    d = min(d, segD(p, v[6], v[7])); d = min(d, segD(p, v[0], v[2])); d = min(d, segD(p, v[1], v[3]));
    d = min(d, segD(p, v[4], v[6])); d = min(d, segD(p, v[5], v[7])); d = min(d, segD(p, v[0], v[4]));
    d = min(d, segD(p, v[1], v[5])); d = min(d, segD(p, v[2], v[6])); d = min(d, segD(p, v[3], v[7]));
    return d;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float RR = 0.62, D = 0.9;
    float fly = 0.3 * sceneTime + 1.0 * audioAdvance;
    float N = floor(8.0 + 6.0 * clamp(countP, 0.0, 1.0));
    float h = (0.06 + 0.04 * clamp(sizeP, 0.0, 1.0)) * (12.0 / N);
    float ph = 0.1 * sceneTime + 0.8 * audioPhase;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.02;
    float k0 = floor(fly / D) + 1.0;
    float a = atan(p.y, p.x);
    for (int j = 0; j < 9; ++j) {
        float k = k0 + float(j);
        float dz = k * D - fly;
        if (dz < 0.15) continue;
        float ib = floor(a / 6.2831853 * N + 0.5);
        float fade = exp(-0.12 * dz) * smoothstep(0.15, 0.6, dz);
        for (int di = -1; di <= 1; ++di) {
            float i = ib + float(di);
            float ang = i * 6.2831853 / N;
            vec3 c = vec3(RR * cos(ang), RR * sin(ang), dz);
            vec3 ax = normalize(vec3(cos(ang + 1.0), sin(ang + 1.0), 0.8));
            float an = ph + 0.4 * mod(i, N) + 0.6 * k;
            float d = cubeEdges(p, c, h, ax, an);
            float w = 0.003 / dz + 1.0 / resolution.y;
            col += famLight(fh, 0.3 + 0.4 * fract(mod(i, N) / N + k * 0.17), 0.5) * (exp(-pow(d / w, 2.0)) + 0.2 * exp(-d / (4.0 * w))) * fade * glow;
        }
    }
    col += famLight(fh, 0.5, 0.6) * exp(-length(p) * 8.0) * 0.25;
    finish(col);
}
