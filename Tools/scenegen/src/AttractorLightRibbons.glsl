//@doc
 * @brief ATTRACTOR LIGHT RIBBONS: hundreds of particles riding a strange attractor -- Thomas', Halvorsen's or Dadras'
 * -- each drawing a fading ribbon of light behind it, so that the attractor's sheets and loops are spun out in
 * glowing threads round the eye, which circles slowly inside the figure.  The particles live in the state field's
 * two bottom rows (where they are now, where they were a step ago); every other cell gathers the light of the
 * segments between those two places, and lets the old light fade, so the ribbons are continuous.  One colour family
 * from the photo, each particle a shade of its own.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section hands the particles to the next attractor; they drift over into its shape
 *   audioSwell         -> the particles' speed along their paths
 *   audioAdvance       -> the eye's slow circling (integrated)
 *   audioOnset         -> the ribbons' heads flare
 *
 * Knobs: trailP (how long the ribbons last), widthP (the ribbons' width), hueP.  Distinct from the attractor scenes,
 * which each show one curve.
//@params trailP widthP
//@audio audioSectionId audioSwell audioOnset
//@state 384 218 60 32
//@body
/**  The flow of the attractor of a kind: Thomas (0), Halvorsen (1), Dadras (2).
 *
 * @param x     The point. (in)
 * @param kind  The attractor. (in)
 *
 * @return
 *   The velocity.
 **/
vec3 flow(vec3 x, float kind)
{
    if (kind < 0.5) return vec3(sin(x.y) - 0.19 * x.x, sin(x.z) - 0.19 * x.y, sin(x.x) - 0.19 * x.z);
    if (kind < 1.5) return vec3(-1.89 * x.x - 4.0 * x.y - 4.0 * x.z - x.y * x.y,
                                -1.89 * x.y - 4.0 * x.z - 4.0 * x.x - x.z * x.z,
                                -1.89 * x.z - 4.0 * x.x - 4.0 * x.y - x.x * x.x);
    return vec3(x.y - 3.0 * x.x + 2.7 * x.y * x.z, 1.7 * x.y - x.x * x.z + x.z, 2.0 * x.x * x.y - 9.0 * x.z);
}

/**  The attractor's size, to bring every kind to the same scale on screen.
 *
 * @param kind  The attractor. (in)
 *
 * @return
 *   One over its rough radius.
 **/
float kindScale(float kind)
{
    return kind < 0.5 ? 0.3 : kind < 1.5 ? 0.14 : 0.11;
}

/**  The eye: a slow circle round the figure's centre, looking a little past it.
 *
 * @param eye  Returns the eye's place. (out)
 * @param fw   Returns the view direction. (out)
 * @param rt   Returns the screen's right. (out)
 * @param up   Returns the screen's up. (out)
 **/
void camera(out vec3 eye, out vec3 fw, out vec3 rt, out vec3 up)
{
    float orbit = 0.03 * sceneTime + 0.12 * audioAdvance;
    eye = 1.5 * vec3(cos(orbit), 0.35 * sin(0.7 * orbit), sin(orbit));
    fw = normalize(vec3(0.15 * sin(0.05 * sceneTime), 0.0, 0.15 * cos(0.04 * sceneTime)) - eye);
    rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    up = cross(rt, fw);
}

/**  One step of the state field: the particle rows move their particles, the other cells gather the ribbons' light.
 *
 * @return
 *   Particle rows: the place (row 0: now, row 1: a step ago) and the kind it last moved under; light cells: the
 *   light (r) and its shade (g, weighted).
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    float kind = mod(max(audioSectionId, 0.0), 3.0);
    if (ip.y < 2) {
        vec4 now = texelFetch(texState, ivec2(ip.x, 0), 0);
        if (stateFrame < 0.5 || dot(now.xyz, now.xyz) > 1e6 || now != now) {
            // seed near the figure, the particle's own random place
            vec3 seed = vec3(stRand(0), stRand(1), stRand(2)) * 2.0 - 1.0;
            now = vec4(seed * (kind < 0.5 ? 3.0 : 1.5), kindScale(kind));
        }
        if (ip.y == 1) return now;                               // the place a step ago
        float dt = (0.006 + 0.014 * clamp(audioSwell, 0.0, 1.0)) * (kind < 0.5 ? 2.5 : 1.0);
        vec3 x = now.xyz;
        for (int i = 0; i < 3; ++i) {
            vec3 k1 = flow(x, kind);
            vec3 k2 = flow(x + 0.5 * dt * k1, kind);
            x += dt * k2;
        }
        // the display scale eases toward the new attractor's, so a change of attractor never jumps
        return vec4(x, mix(now.w, kindScale(kind), 0.02));
    }
    // a light cell: gather the segments every particle drew this step
    vec2 here = vec2(ip) + 0.5;
    vec3 eye, fw, rt, up;
    camera(eye, fw, rt, up);
    vec2 toCell = vec2(stateRes.x, stateRes.y - 2.0);
    float aspect = stateRes.x / (stateRes.y - 2.0);
    float sig = 0.7 + 1.3 * clamp(widthP, 0.0, 1.0);
    float light = 0.0, shade = 0.0;
    float flare = 1.0 + 1.5 * clamp(audioOnset, 0.0, 1.0);
    for (int i = 0; i < 384; ++i) {
        vec4 a = texelFetch(texState, ivec2(i, 0), 0), b = texelFetch(texState, ivec2(i, 1), 0);
        vec3 va = a.xyz * a.w - eye, vb = b.xyz * b.w - eye;
        float za = max(dot(va, fw), 0.05), zb = max(dot(vb, fw), 0.05);
        vec2 pa = (vec2(dot(va, rt), dot(va, up)) / za * 0.9 / vec2(aspect, 1.0) + 0.5) * toCell + vec2(0.0, 2.0);
        vec2 pb = (vec2(dot(vb, rt), dot(vb, up)) / zb * 0.9 / vec2(aspect, 1.0) + 0.5) * toCell + vec2(0.0, 2.0);
        vec2 ab = pb - pa;
        float t = clamp(dot(here - pa, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
        vec2 d = here - pa - ab * t;
        float w = sig * (1.2 / za);
        float g = exp(-dot(d, d) / (w * w)) / za;
        light += g;
        shade += g * fract(float(i) * 0.618034);
    }
    vec4 old = stateFrame < 0.5 ? vec4(0.0) : texelFetch(texState, ip, 0);
    float keep = exp(-1.0 / (60.0 * (0.8 + 3.0 * clamp(trailP, 0.0, 1.0))));
    return vec4(old.r * keep + light * flare * 0.15, old.g * keep + shade * flare * 0.15, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec2 cc = (p / vec2(stateRes.x / (stateRes.y - 2.0), 1.0) + 0.5) * vec2(stateRes.x, stateRes.y - 2.0) + vec2(0.0, 2.0);
    cc.y = max(cc.y, 2.5);                                       // never show the particle rows
    vec4 s = stLin(cc);
    float lit = 1.0 - exp(-s.r * 1.2);
    float shade = s.g / max(s.r, 1e-4);
    vec3 col = famLight(fh, shade, 0.5 * lit * lit) * lit;
    col += famCol(fh, 0.5) * 0.012;
    finish(famExpose(col, 2.10, 1.00, 0.03, fh));
}
