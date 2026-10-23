//@doc
 * @brief CYCLIC TRAFFIC JAM DIAGONALS: the Biham-Middleton-Levin model: red cars drive to the right, blue ones upwards, and jams become diagonal bands or a total blockade; the photo colours the cars and sets the density.  The cars carry the place of the photo they started at, so the picture is the photo
 * at first and then smears into the diagonal bands of the traffic.  Red cars move in the even steps, blue ones in the odd.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the pace: quiet music skips steps
 *   audioAdvance -> the colours of the cars drift through the photo (integrated)
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioAdvance
//@state 320 180 30 32
//@body
vec3 phAt(vec2 c, float lod) { return imgLod((c - 0.5 * stateRes) / stateRes.y * 0.8 + 0.5, lod); }
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        float l = luma(phAt(vec2(ip) + 0.5, 1.2));
        float rho = 0.22 + 0.22 * l;
        float r = stRand(0);
        float t = r < rho ? (stRand(1) < 0.5 ? 1.0 : 2.0) : 0.0;
        return vec4(t, float(ip.x), float(ip.y), 1.0);
    }
    if (stRandStep(0) > 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0)) return stAt(ip);
    vec4 c = stAt(ip);
    bool redPhase = (int(stateFrame) & 1) == 0;
    if (redPhase) {
        vec4 left = stAt(ip - ivec2(1, 0));
        vec4 right = stAt(ip + ivec2(1, 0));
        if (abs(c.r - 1.0) < 0.5 && right.r < 0.5) return vec4(0.0, c.gb, 1.0);
        if (c.r < 0.5 && abs(left.r - 1.0) < 0.5) return left;
        return c;
    }
    vec4 below = stAt(ip - ivec2(0, 1));
    vec4 above = stAt(ip + ivec2(0, 1));
    if (abs(c.r - 2.0) < 0.5 && above.r < 0.5) return vec4(0.0, c.gb, 1.0);
    if (c.r < 0.5 && abs(below.r - 2.0) < 0.5) return below;
    return c;
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = texelFetch(texState, stWrap(ivec2(floor(cc))), 0);
    vec3 ph = phAt(cc, 1.0);
    vec3 car = phAt(s.gb + 6.0 * vec2(sin(0.02 * audioAdvance), cos(0.017 * audioAdvance)), 1.5);
    car = mix(vec3(luma(car)), car, 1.3);
    vec3 red = car * vec3(1.35, 0.85, 0.7);
    vec3 blue = car * vec3(0.75, 0.95, 1.4);
    vec3 col = ph * 0.14;
    if (abs(s.r - 1.0) < 0.5) col = red;
    else if (abs(s.r - 2.0) < 0.5) col = blue;
    finish(col * 1.1);
}
