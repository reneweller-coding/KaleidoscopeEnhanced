//@doc
 * @brief ELEMENTARY RULE TAPESTRY: Wolfram's one-dimensional automata (rules 30, 110, 90, 150, 54, 73 ...) woven
 * as a tapestry: every step a new row is born on the centre line from the row before, and the rows stream outward,
 * mirrored four ways, so the whole frame is the automaton's history.  Living cells show the photo cut into strips
 * along the rows; a change of rule runs outward as a seam between two weaves.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony moves on to the next rule (it spreads outward: no jump)
 *   audioOnset       -> sprinkles defects into the newest row (new gliders and triangles)
 *   audioPhase       -> the palette turns through the photo (integrated)
 *   audioKick        -> the newest rows flash (light)
 *
 * Knobs: ruleP (the first rule), scaleP (cell size), driftP (how fast the weave slides sideways), hueP.
//@params ruleP scaleP driftP
//@audio audioOnset audioKick audioHarmAdvance
//@state 320 160 24
//@body
/**  One of the elementary rules worth watching.
 *
 * @param k  The rule's place in the list, 0..9. (in)
 *
 * @return
 *   Wolfram's rule number.
 **/
int ruleOf(int k)
{
    if (k == 0) return 30;
    if (k == 1) return 110;
    if (k == 2) return 90;
    if (k == 3) return 150;
    if (k == 4) return 54;
    if (k == 5) return 73;
    if (k == 6) return 105;
    if (k == 7) return 18;
    if (k == 8) return 45;
    return 126;
}
/**  The rule in force: the knob's, moved on by each change of harmony.
 *
 * @return
 *   The rule's place in the list, 0..9.
 **/
int ruleNow()
{
    int k0 = int(floor(clamp(ruleP, 0.0, 0.999) * 10.0));
    return (k0 + int(max(audioHarmAdvance, 0.0))) % 10;
}

/**  One step for this cell (the state pass): the ring buffer's next row is computed from the row before it; every
 * other row keeps its generation.
 *
 * @return
 *   Cell (0 or 1), the rule's place it was made with, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    int h = int(stateRes.y);
    if (stateFrame < 0.5)
        return vec4(ip.y == 0 && stRand(0) < 0.5 ? 1.0 : 0.0, float(ruleNow()), 0.0, 1.0);
    int row = int(mod(stateFrame, float(h)));
    if (ip.y != row) return stAt(ip);
    int prev = (row + h - 1) % h;
    int l = int(stAt(ivec2(ip.x - 1, prev)).r + 0.5);
    int c = int(stAt(ivec2(ip.x, prev)).r + 0.5);
    int r = int(stAt(ivec2(ip.x + 1, prev)).r + 0.5);
    int k = ruleNow();
    float v = float((ruleOf(k) >> (l * 4 + c * 2 + r)) & 1);
    // defects: a few always (rules that die out come back), many on an onset
    if (stRand(1) < 0.0015 + 0.03 * clamp(audioOnset, 0.0, 1.0) * clamp(audioOnset, 0.0, 1.0)) v = 1.0 - v;
    return vec4(v, float(k), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 q = abs(p);                                            // mirrored four ways around the centre
    float rows = 60.0 + 70.0 * clamp(scaleP, 0.0, 1.0);         // rows on a screen height
    float age = q.y * rows;
    float genF = stateFrame - 1.0 + stateFrac - age;            // the newest row moves out continuously
    float g = floor(genF);
    float xs = q.x * rows + (0.3 + 3.0 * clamp(driftP, 0.0, 1.0)) * sceneTime;
    int w = int(stateRes.x), h = int(stateRes.y);
    ivec2 cell = ivec2(int(mod(floor(xs), float(w))), int(mod(g, float(h))));
    vec4 c = texelFetch(texState, cell, 0);
    vec2 f = abs(fract(vec2(xs, genF)) - 0.5);
    float bevel = 1.0 - 0.45 * smoothstep(0.3, 0.5, max(f.x, f.y));
    // the photo cut into strips along the rows: each generation reads its own shifted strip
    vec2 uv = vec2(xs / rows * 0.5, q.y * 0.9) + vec2(0.23 * hash11(g * 0.173), 0.0);
    vec3 photo = imgLod(uv, 0.8);
    vec3 tone = imgPalette(c.g / 10.0 + 0.03 * audioPhase);
    vec3 col = c.r > 0.5 ? mix(photo, tone, 0.3) * bevel : photo * 0.1;
    float fresh = exp(-age * 0.25);
    col += tone * fresh * c.r * (0.4 + 0.8 * clamp(audioKick, 0.0, 1.0));
    col *= g < 0.0 ? 0.0 : 1.0;
    finish(col);
}
