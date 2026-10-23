//@doc
 * @brief BARKLEY SPIRAL EXCITABLE: the Barkley model: an excitable medium with spiral waves that turn and run into each other; the photo sets the excitability and colours the waves.  Each cell has a fast variable u (the wave) and a slow one v (the refractory memory); bright places of the photo are more
 * excitable, so the waves curve and bend round the photo's shapes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the coupling between the cells (the waves' thickness)
 *   audioSpread  -> a slow shift of the excitability
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioSpread
//@state 320 180 60 32
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
    float W = stateRes.x;
    float H = stateRes.y;
    if (stateFrame < 0.5) {
        float u = (float(ip.x) < 0.5 * W && float(ip.y) < 0.5 * H) ? 1.0 : 0.0;
        float v = (float(ip.x) < 0.5 * W && float(ip.y) >= 0.5 * H) ? 0.5 : 0.0;
        float u2 = (abs(float(ip.x) - 0.8 * W) < 3.0 && float(ip.y) < 0.4 * H) ? 1.0 : 0.0;
        return vec4(max(u, u2), v, 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    vec4 lap = stLap9(ip);
    float l = luma(phAt(vec2(ip) + 0.5, 2.0));
    float a = 0.75 + 0.12 * (l - 0.5) + 0.03 * (clamp(audioSpread, 0.0, 1.0) - 0.5);
    float b = 0.06;
    float eps = 0.02;
    float D = 1.2 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float dt = 0.04;
    float du = (1.0 / eps) * c.r * (1.0 - c.r) * (c.r - (c.g + b) / a) + D * lap.r;
    float dv = c.r - c.g;
    return vec4(clamp(c.r + dt * du, 0.0, 1.0), clamp(c.g + dt * dv, 0.0, 1.0), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = stLin(cc);
    vec3 ph = phAt(cc, 0.8);
    vec3 col = ph * (0.34 + 1.1 * s.r + 0.55 * s.g) + imgPalette(0.8) * s.r * s.r * 0.25;
    finish(col);
}
