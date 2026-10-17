//@doc
 * @brief ROTOR-ROUTER AGGREGATE: chips are fed in at the centre; every occupied cell carries a rotor that sends its
 * chips round its four neighbours in a fixed order, and a chip that reaches an empty cell settles there.  The
 * aggregate grows into an almost perfect disc, and inside it the rotors freeze into an intricate fractal mandala
 * (Levine and Peres).  The cells pass chips in parallel -- the result does not depend on the order.  The disc
 * repeats across the frame; each rotor direction shows its own cut of the photo.  When the disc is grown it holds a
 * while, fades and grows again with another rotor order.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the feed: more chips a step in loud passages (the disc grows faster)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the busy cells flash (light)
 *
 * Knobs: rotorP (the first rotor order), feedP (chips a step), hueP.
//@params rotorP feedP
//@audio audioSwell audioKick
//@state 200 200 960 32
//@body
/**  A step in one of the four directions.
 *
 * @param d  The direction: 0 east, 1 north, 2 west, 3 south. (in)
 *
 * @return
 *   The step in cells.
 **/
ivec2 stepOf(int d) { return d == 0 ? ivec2(1, 0) : d == 1 ? ivec2(0, 1) : d == 2 ? ivec2(-1, 0) : ivec2(0, -1); }
/**  The direction a rotor sends to at a position of its order.
 *
 * @param o  The rotor order: 0 counter-clockwise, 1 east-west-north-south, 2 east-north-south-west. (in)
 * @param i  The position in the order, 0..3. (in)
 *
 * @return
 *   The direction, 0..3.
 **/
int orderDir(int o, int i)
{
    if (o == 0) return i;
    if (o == 1) return i == 0 ? 0 : i == 1 ? 2 : i == 2 ? 1 : 3;
    return i == 0 ? 0 : i == 1 ? 1 : i == 2 ? 3 : 2;
}
/**  The steps of one cycle: growth to the full disc, then a hold.
 *
 * @return
 *   Steps per cycle.
 **/
float cycleSteps() { return 120000.0; }
/**  The rotor order of this cycle.
 *
 * @return
 *   The order, 0..2.
 **/
int orderNow() { return (int(floor(clamp(rotorP, 0.0, 0.999) * 3.0)) + int(floor(stateFrame / cycleSteps()))) % 3; }

/**  One parallel routing step for this cell (the state pass).
 *
 * @return
 *   Chips on the cell, rotor position 0..3, occupied (0 or 1), activity glow.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    ivec2 o0 = ivec2(stateRes) / 2;
    float cyc = mod(stateFrame, cycleSteps());
    if (stateFrame < 0.5 || cyc < 0.5) return vec4(0.0, 0.0, ip == o0 ? 1.0 : 0.0, 0.0);
    int ord = orderNow();
    vec4 c = stAt(ip);
    float recv = 0.0;
    for (int d = 0; d < 4; ++d) {
        vec4 nb = stAt(ip + stepOf(d));
        if (nb.b < 0.5 || nb.r < 0.5) continue;
        int back = (d + 2) % 4;                                 // the neighbour sends toward us in direction back
        int j0 = 0;
        for (int j = 1; j <= 4; ++j)
            if (orderDir(ord, (int(nb.g) + j) % 4) == back) j0 = j;
        float k = nb.r;
        recv += floor(k / 4.0) + (float(j0) <= mod(k, 4.0) ? 1.0 : 0.0);
    }
    bool occ = c.b > 0.5;
    float rot = c.g, chips = 0.0, act = c.a * 0.97;
    if (occ && c.r > 0.5) { rot = mod(c.g + c.r, 4.0); act = 1.0; }
    // the feed at the centre while the disc grows (about two thirds of the field's height across)
    float feed = (1.0 + 3.0 * clamp(feedP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    bool full = stAt(o0 + ivec2(int(0.45 * stateRes.y), 0)).b > 0.5;   // the disc has reached its radius
    if (ip == o0 && !full && cyc < cycleSteps() - 4000.0) recv += floor(feed + stRandStep(0));
    if (occ) chips = recv;
    else if (recv > 0.5) { occ = true; chips = recv - 1.0; act = 1.0; }
    return vec4(chips, rot, occ ? 1.0 : 0.0, act);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.05);
    ivec2 cell = stWrap(ivec2(floor(cc)));
    vec4 c = texelFetch(texState, cell, 0);
    vec4 s = stLin(cc);
    float rot = floor(c.g + 0.5);
    vec2 uv = cc / stateRes.y * 0.7;
    vec3 photo = imgLod(uv + vec2(0.33, 0.51) * rot, 0.5);     // every rotor direction its own cut of the photo
    vec3 tone = imgPalette(rot * 0.25 + 0.03 * audioPhase);
    vec2 f = abs(fract(cc) - 0.5);
    float bevel = 1.0 - 0.3 * smoothstep(0.32, 0.5, max(f.x, f.y));
    vec3 col = c.b > 0.5 ? mix(photo, tone, 0.4) * (0.5 + 0.2 * rot) * bevel : imgLod(uv, 2.0) * 0.16;
    col += mix(tone, vec3(1.0), 0.5) * s.a * 0.35 * (0.6 + clamp(audioKick, 0.0, 1.0));
    // fade out before the next cycle, in at its start
    float cyc = mod(stateFrame, cycleSteps());
    col *= smoothstep(cycleSteps(), cycleSteps() - 2400.0, cyc) * smoothstep(0.0, 960.0, cyc);
    finish(col);
}
