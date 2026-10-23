//@doc
 * @brief POTTS GRAIN FOTO: the Potts model: cells with q states grow into grains, with small grains shrinking; the photo colours the grains with its mean values.  Every cell carries the place of the photo it was born at; a boundary cell takes the state of a neighbour if that lowers the energy of the boundary
 * (or by chance, at a temperature), and the grains' colour is the photo at their birth place.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the temperature (rougher grain boundaries)
 *   audioAdvance -> a slow shift of the colours through the photo (integrated)
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioAdvance
//@state 320 180 40 32
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
        vec2 blk = floor(vec2(ip) / 4.0);
        vec2 h = hash22(blk);
        float id = floor(h.x * 1500.0) + 1.0;
        return vec4(id, (blk.x + h.y) * 4.0, (blk.y + h.x) * 4.0, 1.0);
    }
    vec4 c = stAt(ip);
    if (((ip.x + ip.y + int(stateFrame)) & 1) != 0) return c;
    int dir = int(stRand(0) * 8.0);
    ivec2 o = ivec2(0);
    if (dir == 0) o = ivec2(1, 0); else if (dir == 1) o = ivec2(-1, 0); else if (dir == 2) o = ivec2(0, 1); else if (dir == 3) o = ivec2(0, -1);
    else if (dir == 4) o = ivec2(1, 1); else if (dir == 5) o = ivec2(-1, 1); else if (dir == 6) o = ivec2(1, -1); else o = ivec2(-1, -1);
    vec4 n = stAt(ip + o);
    if (abs(n.r - c.r) < 0.5) return c;
    float e0 = 0.0;
    float e1 = 0.0;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            if (dx == 0 && dy == 0) continue;
            float v = stAt(ip + ivec2(dx, dy)).r;
            e0 += abs(v - c.r) > 0.5 ? 1.0 : 0.0;
            e1 += abs(v - n.r) > 0.5 ? 1.0 : 0.0;
        }
    float dE = e1 - e0;
    float T = 0.15 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    if (dE <= 0.0 || stRand(1) < exp(-dE / T)) return n;
    return c;
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
    float edge = (abs(sr.r - s.r) > 0.5 || abs(su.r - s.r) > 0.5) ? 1.0 : 0.0;
    vec3 c = phAt(s.gb + 3.0 * vec2(sin(0.02 * audioAdvance), cos(0.017 * audioAdvance)), 2.8);
    c = mix(vec3(luma(c)), c, 1.3);
    finish(c * (1.15 - 0.55 * edge));
}
