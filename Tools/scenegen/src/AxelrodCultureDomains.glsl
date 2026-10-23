//@doc
 * @brief AXELROD CULTURE DOMAINS: the Axelrod model: cells with feature vectors that grow alike when they are already similar; cultural domains form with sharp borders.  Each cell has three features (red, green and blue traits of four values each); the photo's channels set the first traits, and neighbours that
 * share some traits copy a further one, until the picture falls into domains of uniform colour mixed from the traits.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the rate of interaction
 *   audioSpread  -> the random drift of single traits (noise that keeps the borders moving)
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioSpread
//@state 320 180 24 32
//@body
/**  The photo at a field cell (the photo fitted to the field's height, 0.8 of it).
 *
 * @param c  The colour. (in)
 * @param lod  The lod. (in)
 *
 * @return
 *   The photo's colour.
 **/
vec3 phAt(vec2 c, float lod) { return imgLod((c - 0.5 * stateRes) / stateRes.y * 0.8 + 0.5, lod); }
/**  The state pass: the next state of this cell from the last one (the rule of the scene).
 *
 *
 * @return
 *   The cell's new state.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        vec3 c = phAt(vec2(ip) + 0.5, 1.2);
        return vec4(floor(clamp(c, 0.0, 0.999) * 4.0), 1.0);
    }
    vec4 c = stAt(ip);
    float rate = 0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    if (stRand(2) > rate) return c;
    int dir = int(stRand(0) * 4.0);
    ivec2 o = dir == 0 ? ivec2(1, 0) : (dir == 1 ? ivec2(-1, 0) : (dir == 2 ? ivec2(0, 1) : ivec2(0, -1)));
    vec4 n = stAt(ip + o);
    vec3 eq = vec3(abs(c.r - n.r) < 0.5 ? 1.0 : 0.0, abs(c.g - n.g) < 0.5 ? 1.0 : 0.0, abs(c.b - n.b) < 0.5 ? 1.0 : 0.0);
    float sim = (eq.x + eq.y + eq.z) / 3.0;
    vec4 o2 = c;
    if (sim > 0.0 && sim < 1.0 && stRand(1) < sim) {
        float pick = stRand(3) * (3.0 - (eq.x + eq.y + eq.z));
        float acc = 0.0;
        if (eq.x < 0.5) { acc += 1.0; if (pick < acc) o2.r = n.r; }
        if (eq.y < 0.5 && !(pick < acc)) { acc += 1.0; if (pick < acc) o2.g = n.g; }
        if (eq.z < 0.5 && !(pick < acc)) { acc += 1.0; if (pick < acc) o2.b = n.b; }
    }
    if (stRand(4) < 0.0004 * (0.2 + clamp(audioSpread, 0.0, 1.0))) o2.r = floor(stRand(5) * 4.0);
    return o2;
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    ivec2 ic = stWrap(ivec2(floor(cc)));
    vec4 s = texelFetch(texState, ic, 0);
    vec4 sr = texelFetch(texState, stWrap(ic + ivec2(1, 0)), 0);
    vec4 su = texelFetch(texState, stWrap(ic + ivec2(0, 1)), 0);
    float edge = (length(sr.rgb - s.rgb) > 0.5 || length(su.rgb - s.rgb) > 0.5) ? 1.0 : 0.0;
    vec3 tr = (s.rgb + 0.5) / 4.0;
    vec3 ph = phAt(cc, 1.0);
    vec3 col = mix(tr * 1.25, ph, 0.25) * (0.75 + 0.4 * luma(ph));
    finish(col * (1.1 - 0.4 * edge));
}
