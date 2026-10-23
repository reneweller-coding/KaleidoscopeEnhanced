//@doc
 * @brief SCHELLING SEGREGATION PHOTO: the Schelling model: cells move when too few neighbours of their own kind are about; the photo colours two groups, light and dark, and the picture unmixes into islands and mixes again.  The cells swap in pairs (a cell and its right or upper neighbour) when the swap makes both
 * happier; each cell carries its own bit of photo colour, so at first the picture is the photo and then falls apart into light and dark islands.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the tolerance glides with the key (integrated): intolerant music unmixes, tolerant music mixes
 *   audioSwell       -> the rate of the moves
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioHarmAdvance
//@state 320 180 30 32
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
/**  How many of the eight neighbours of a cell have a type (the cell skip is left out).
 *
 * @param ip  The cell. (in)
 * @param t  The type to count. (in)
 * @param skip  The cell to leave out. (in)
 *
 * @return
 *   The count.
 **/
float cnt(ivec2 ip, float t, ivec2 skip)
{
    float n = 0.0;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            ivec2 d = ivec2(dx, dy);
            if (d == ivec2(0)) continue;
            ivec2 q = stWrap(ip + d);
            if (q == stWrap(skip)) continue;
            n += abs(stAt(q).r - t) < 0.5 ? 1.0 : 0.0;
        }
    return n;
}
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
        return vec4(l + 0.8 * (stRand(0) - 0.5) > 0.5 ? 1.0 : 0.0, float(ip.x), float(ip.y), 1.0);
    }
    vec4 c = stAt(ip);
    int axis = int(stRandStep(0) * 2.0);
    int par = int(stRandStep(1) * 2.0);
    ivec2 d = axis == 0 ? ivec2(1, 0) : ivec2(0, 1);
    int coord = axis == 0 ? ip.x : ip.y;
    bool isL = ((coord + par) & 1) == 0;
    ivec2 Lc = isL ? ip : ip - d;
    ivec2 Rc = isL ? ip + d : ip;
    vec4 L = stAt(Lc);
    vec4 R = stAt(Rc);
    if (abs(L.r - R.r) < 0.5) return c;
    float nLL = cnt(Lc, L.r, Rc);
    float nRR = cnt(Rc, R.r, Lc);
    float nRL = cnt(Lc, R.r, Rc);
    float nLR = cnt(Rc, L.r, Lc);
    float G = nRL + nLR - nLL - nRR;
    float tol = 0.5 + 0.5 * sin(0.06 * audioHarmAdvance + 0.02 * sceneTime);
    float T = 0.5 + 4.0 * tol;
    float rate = 0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float h = hash11(float(Lc.x) * 0.137 + float(Lc.y) * 3.71 + stateFrame * 0.0731 + float(axis) * 11.0);
    float h2 = hash11(float(Lc.x) * 0.911 + float(Lc.y) * 1.37 + stateFrame * 0.377);
    bool swap = (G > 0.0 || h < exp(G / T)) && h2 < rate;
    if (!swap) return c;
    return isL ? R : L;
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = texelFetch(texState, stWrap(ivec2(floor(cc))), 0);
    vec3 c = phAt(s.gb, 1.2);
    c = mix(vec3(luma(c)), c, 1.2);
    vec3 tint = s.r > 0.5 ? vec3(1.25, 1.12, 0.9) : vec3(0.55, 0.65, 0.95);
    finish(c * tint * (s.r > 0.5 ? 0.95 : 0.7));
}
