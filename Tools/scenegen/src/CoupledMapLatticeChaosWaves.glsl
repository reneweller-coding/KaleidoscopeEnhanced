//@doc
 * @brief COUPLED MAP LATTICE CHAOS WAVES: a lattice of coupled logistic maps: every cell iterates chaotically and shares itself with its neighbours; zones with fronts and turbulent clouds arise.  The photo sets the parameter of every cell (bright places are more chaotic) and colours the cells, so the
 * picture is a photo whose brightness boils in the bright places and rests in the dark ones.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the coupling between the cells (more swell, calmer fronts)
 *   audioSpread  -> the mid value of the parameters
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioSpread
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
/**  The state pass: the next state of this cell from the last one (the rule of the scene).
 *
 *
 * @return
 *   The cell's new state.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(stRand(0), 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    float l = luma(phAt(vec2(ip) + 0.5, 1.5));
    float r = 3.55 + 0.4 * (l - 0.2) + 0.1 * (clamp(audioSpread, 0.0, 1.0) - 0.5);
    r = clamp(r, 3.3, 3.99);
    float eps = 0.15 + 0.45 * clamp(audioSwell, 0.0, 1.0);
    float x = c.r;
    float fx = r * x * (1.0 - x);
    float s = 0.0;
    vec2 o[4];
    o[0] = vec2(1.0, 0.0); o[1] = vec2(-1.0, 0.0); o[2] = vec2(0.0, 1.0); o[3] = vec2(0.0, -1.0);
    for (int k = 0; k < 4; ++k) {
        float xn = stAt(ip + ivec2(o[k])).r;
        s += r * xn * (1.0 - xn);
    }
    float nx = clamp((1.0 - eps) * fx + eps * 0.25 * s, 0.0, 1.0);
    return vec4(nx, mix(c.g, abs(nx - x), 0.3), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = stLin(cc);
    vec3 ph = phAt(cc, 0.8);
    vec3 col = ph * (0.15 + 1.2 * s.r) * (0.8 + 0.5 * s.g * 4.0);
    col += imgPalette(0.2 + 0.5 * s.r) * s.g * 0.8;
    finish(col);
}
