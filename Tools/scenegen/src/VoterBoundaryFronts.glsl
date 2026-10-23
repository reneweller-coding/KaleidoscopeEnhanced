//@doc
 * @brief VOTER BOUNDARY FRONTS: the voter model: every cell takes the opinion of a random neighbour; regions form with rough borders that move at random.  The photo gives the opinions their colour: at the start the picture is the photo posterised into eight opinions, then the borders wander and the
 * regions coarsen, each in the colour of its opinion taken from the photo's palette, with the photo's own detail shining through.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the rate of copying (how many cells vote in a step)
 *   audioAdvance -> the palette turns slowly through the photo (integrated)
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioAdvance
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
        float l = luma(phAt(vec2(ip) + 0.5, 1.2));
        return vec4(floor(clamp(l + 0.1 * (stRand(0) - 0.5), 0.0, 0.999) * 8.0), 0.0, 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    float rate = 0.2 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    if (stRand(2) > rate) return c;
    int dir = int(stRand(0) * 4.0);
    ivec2 o = dir == 0 ? ivec2(1, 0) : (dir == 1 ? ivec2(-1, 0) : (dir == 2 ? ivec2(0, 1) : ivec2(0, -1)));
    return stAt(ip + o);
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
    vec3 pal = imgPalette(fract((s.r + 0.5) / 8.0 + 0.01 * audioAdvance));
    vec3 ph = phAt(cc, 1.0);
    vec3 col = mix(pal, ph, 0.28) * (0.7 + 0.5 * luma(ph));
    finish(col * (1.1 - 0.35 * edge));
}
