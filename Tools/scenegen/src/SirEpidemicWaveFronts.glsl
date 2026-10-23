//@doc
 * @brief SIR EPIDEMIC WAVE FRONTS: an SIR model on the lattice: infection, recovery, immunity; waves run through a population whose density is the photo, and leave immunity behind.  Only places where the photo is bright are populated (more densely the brighter), so the waves run along the photo's shapes
 * and jump gaps; immunity fades slowly, so the waves return.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the rate of infection
 *   audioAdvance -> the colour of the waves drifts (integrated)
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioAdvance
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
    float rho = 0.35 + 0.65 * smoothstep(0.1, 0.75, luma(phAt(vec2(ip) + 0.5, 1.5)));
    bool vacant = hash21(vec2(ip) + 0.5) > rho;
    if (vacant) return vec4(3.0, 0.0, 0.0, 1.0);
    if (stateFrame < 0.5) {
        return vec4(stRand(0) < 0.0015 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    if (c.r > 2.5) return vec4(0.0, 0.0, 0.0, 1.0);
    float beta = 0.14 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    if (c.r < 0.5) {
        float nI = 0.0;
        for (int dy = -1; dy <= 1; ++dy)
            for (int dx = -1; dx <= 1; ++dx) {
                if (dx == 0 && dy == 0) continue;
                nI += abs(stAt(ip + ivec2(dx, dy)).r - 1.0) < 0.5 ? 1.0 : 0.0;
            }
        float pI = 1.0 - pow(1.0 - beta, nI);
        if (stRand(0) < pI || stRand(1) < 0.00004) return vec4(1.0, 0.0, 0.0, 1.0);
        return c;
    }
    if (c.r < 1.5) {
        float tau = 7.0 + 3.0 * stRand(2);
        if (c.g + 1.0 > tau) return vec4(2.0, 0.0, 0.0, 1.0);
        return vec4(1.0, c.g + 1.0, 0.0, 1.0);
    }
    if (c.g + 1.0 > 70.0) return vec4(0.0, 0.0, 0.0, 1.0);
    return vec4(2.0, c.g + 1.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = texelFetch(texState, stWrap(ivec2(floor(cc))), 0);
    vec3 ph = phAt(cc, 0.8);
    vec3 col = ph * 0.05;
    if (s.r < 0.5) col = ph * 0.95;
    else if (s.r < 1.5) col = mix(ph, vec3(1.0, 0.75, 0.3), 0.7) * 1.5;
    else if (s.r < 2.5) col = vec3(luma(ph)) * vec3(0.45, 0.5, 0.65) * (0.8 + 0.4 * (1.0 - s.g / 70.0));
    finish(col);
}
