//@doc
 * @brief RULE HUNDRED TEN GLIDERS: rule 110: the rule that can compute anything has gliders that move over a background pattern and collide; the photo provides the start as a dense mixture.  Every cell remembers where its colour was born, and the gliders carry the colour of the place they came from, so the
 * photo is smeared along the paths of the collisions.  The curtain falls one row per step.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the density of the first row (and of the sparks that refresh it)
 *   audioSwell   -> the pace
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSwell audioSpread
//@state 480 270 44 32
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
    int H = int(stateRes.y);
    if (stateFrame < 0.5) {
        float l = luma(phAt(vec2(ip) + 0.5, 1.0));
        float d = 0.35 + 0.3 * l;
        float a = ip.y == H - 1 && stRand(0) < d ? 1.0 : 0.0;
        return vec4(a, float(ip.x), float(ip.y), 1.0);
    }
    if (stRandStep(0) > 0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0)) return stAt(ip);
    if (ip.y < H - 1) return stAt(ip + ivec2(0, 1));
    vec4 L = stAt(ip + ivec2(-1, 0));
    vec4 C = stAt(ip);
    vec4 R = stAt(ip + ivec2(1, 0));
    int idx = int(step(0.5, L.r)) * 4 + int(step(0.5, C.r)) * 2 + int(step(0.5, R.r));
    float alive = float((110 >> idx) & 1);
    vec2 org = C.r > 0.5 ? C.gb : (R.r > 0.5 ? R.gb : (L.r > 0.5 ? L.gb : vec2(ip)));
    if (stRand(1) < 0.0008 * (0.3 + clamp(audioSpread, 0.0, 1.0))) { alive = 1.0; org = vec2(ip); }
    return vec4(alive, org, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.5 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = texelFetch(texState, stWrap(ivec2(floor(cc))), 0);
    vec3 ph = phAt(s.gb, 1.5);
    vec3 bg = phAt(cc, 2.5) * 0.06;
    vec3 col = bg + mix(vec3(luma(ph)), ph, 1.4) * s.r * 1.2;
    finish(col);
}
