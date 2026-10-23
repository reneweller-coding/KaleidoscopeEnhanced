//@doc
 * @brief RULKOV NEURON MAP BURSTS: the Rulkov neuron model: a simple map for neurons that fire in bursts and run in waves over a coupled lattice; the photo sets the excitability and colours the cells.  Each cell has a fast and a slow variable; bright places of the photo are more excitable, and the coupling
 * passes the bursts on to the neighbours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the coupling between the cells
 *   audioSpread  -> the mean excitability (smoothed)
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioSpread
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
    if (stateFrame < 0.5) return vec4(-1.2 + 0.4 * stRand(0), -3.3 + 1.4 * noise2(vec2(ip) / 22.0) + 0.5 * noise2(vec2(ip) / 7.0 + 9.0), 0.0, 1.0);
    vec4 c = stAt(ip);
    float l = luma(phAt(vec2(ip) + 0.5, 1.5));
    float alpha = 4.1 + 0.35 * (l - 0.5) + 0.2 * (clamp(audioSpread, 0.0, 1.0) - 0.5);
    float mu = 0.0025;
    float sigma = 0.3 + 0.25 * (l - 0.5);
    float D = 0.3 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float x = c.r;
    float y = c.g;
    vec4 nb = stAt(ip + ivec2(1, 0)) + stAt(ip - ivec2(1, 0)) + stAt(ip + ivec2(0, 1)) + stAt(ip - ivec2(0, 1));
    float nx = alpha / (1.0 + x * x) + y + D * (0.25 * nb.r - x);
    float ny = y - mu * (x + 1.0 - sigma);
    return vec4(clamp(nx, -3.0, 3.0), clamp(ny, -4.0, 0.0), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = stLin(cc);
    vec3 ph = phAt(cc, 0.8);
    float spike = smoothstep(-0.2, 1.4, s.r);
    vec3 col = ph * (0.25 + 1.2 * spike) + imgPalette(fract(0.5 + 0.15 * s.g)) * spike * 0.35;
    finish(col);
}
