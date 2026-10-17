//@doc
 * @brief VORTEX MERGER CASCADE: two-dimensional turbulence's inverse cascade -- thirty-two vortices of one sign
 * each, set out in a jittered hierarchy, pair off, spiral into each other and merge, again and again, until two
 * great whirlpools are left; then a fresh generation is sown and the cascade begins anew.  The photo is carried by
 * their flow: it is wound into spirals around every vortex and drawn out into filaments between them.  An
 * endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> a short-lived vortex pair (a dipole) shoots across a wandering place (structure)
 *   audioSwell      -> the circulation: loud passages wind the photo faster
 *   audioPhase      -> the palette of the cores turns (integrated)
 *   audioKick       -> the cores flash (light)
 *
 * Knobs: cycleP (how long one cascade takes), windP (the base circulation), freshP (how fast the photo returns), hueP.
//@params cycleP windP freshP
//@audio audioSwell audioKick audioOnset
//@state 384 216 120 32
//@body
/**  The position of a first-generation vortex: a jittered binary hierarchy over the field, so the vortices that
 * merge first sit next to each other.
 *
 * @param i    The vortex, 0..31. (in)
 * @param cyc  The cascade's number (a fresh jitter for each). (in)
 *
 * @return
 *   The position in field units (the field is 1.78 x 1).
 **/
vec2 leafPos(int i, float cyc)
{
    vec2 c = vec2(0.89, 0.5), hs = vec2(0.89, 0.5);
    for (int l = 0; l < 5; ++l) {
        int bit = (i >> (4 - l)) & 1;
        if (hs.x >= hs.y) { hs.x *= 0.5; c.x += (bit == 1 ? 1.0 : -1.0) * hs.x; }
        else { hs.y *= 0.5; c.y += (bit == 1 ? 1.0 : -1.0) * hs.y; }
    }
    return c + (hash22(vec2(float(i), cyc)) - 0.5) * hs * 0.8;
}

/**  The flow of all vortices of the current stage at a point.  In each of the five stages of a cascade the groups
 * of 2^stage vortices merge pairwise: the two halves of every pair spiral into their common centre (the mean of
 * their first-generation vortices, so a merged group starts the next stage exactly where the pair ended).
 *
 * @param x  The point in field units. (in)
 *
 * @return
 *   The velocity (field units per second, before the circulation's scale).
 **/
vec2 flowAt(vec2 x)
{
    float span = 40.0 + 60.0 * clamp(cycleP, 0.0, 1.0);
    float tt = sceneTime / span;
    float cyc = floor(tt), ph = fract(tt) * 5.0;
    int level = int(floor(ph));
    float f = fract(ph);
    float grow = smoothstep(0.0, 0.1, fract(tt));               // a fresh generation spins up
    vec2 leaf[32];
    for (int i = 0; i < 32; ++i) leaf[i] = leafPos(i, cyc);
    int hn = 1 << level;
    vec2 v = vec2(0.0);
    for (int g = 0; g < 32; g += 2 * hn) {
        vec2 ca = vec2(0.0), cb = vec2(0.0);
        for (int k = 0; k < 16; ++k) {
            if (k >= hn) break;
            ca += leaf[g + k];
            cb += leaf[g + hn + k];
        }
        ca /= float(hn);
        cb /= float(hn);
        vec2 mid = 0.5 * (ca + cb);
        float sep = 1.0 - smoothstep(0.0, 1.0, f);
        float turn = 6.0 * f;
        vec2 pa = mid + rot2(turn) * (ca - mid) * sep, pb = mid + rot2(turn) * (cb - mid) * sep;
        // one sign for each half of the field's hierarchy, the same in every stage: a merge never flips a vortex
        float sgn = hash11(float(g >> 4) * 1.7 + cyc * 7.0) < 0.5 ? -1.0 : 1.0;
        float gam = sgn * float(hn) * grow;
        float core = 0.012 * sqrt(float(hn));
        for (int j = 0; j < 2; ++j) {
            vec2 d = x - (j == 0 ? pa : pb);
            d -= vec2(1.7777778, 1.0) * floor(d / vec2(1.7777778, 1.0) + 0.5);
            v += gam * vec2(-d.y, d.x) / (dot(d, d) + core * core);
        }
    }
    return v;
}

/**  One step of the photo carried by the vortices for this cell (the state pass).
 *
 * @return
 *   The photo displacement (rg), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    vec2 x = (vec2(stCell()) + 0.5) / stateRes.y;
    vec2 v = flowAt(x);
    // an onset: a dipole shooting across a wandering place
    float slot = floor(stateFrame / 120.0);
    vec2 at = vec2(hash11(slot * 2.1 + 0.3) * 1.7777778, hash11(slot * 4.7 + 0.1));
    float on = clamp(audioOnset, 0.0, 1.0) > 0.6 ? 1.0 : 0.0;
    vec2 dd = x - at;
    dd -= vec2(1.7777778, 1.0) * floor(dd / vec2(1.7777778, 1.0) + 0.5);
    v += on * 4.0 * vec2(1.0, 0.3) * exp(-dot(dd, dd) / 0.004);
    float circ = (0.00002 + 0.00005 * clamp(windP, 0.0, 1.0)) * (0.5 + clamp(audioSwell, 0.0, 1.0));
    vec2 step = clamp(v * circ * stateRes.y, vec2(-1.5), vec2(1.5));
    return stCarry(step, 0.0005 + 0.003 * clamp(freshP, 0.0, 1.0));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    vec3 photo = imgLod(uv * 0.85 + 0.08, lod);
    float swirl = smoothstep(1.5, 4.5, lod);                    // where the photo is wound finest: the cores
    vec3 tone = imgPalette(0.5 + 0.03 * audioPhase);
    vec3 col = photo * (1.0 + 0.1 * swirl) + mix(tone, vec3(1.0), 0.5) * swirl * 0.2 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
