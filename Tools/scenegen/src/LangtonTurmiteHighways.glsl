//@doc
 * @brief LANGTON TURMITE HIGHWAYS: hundreds of generalised Langton ants on one field.  Each turns by the colour of
 * its cell (a rule word such as RL, LLRR or LRRRRRLLR), advances the colour and steps on: chaos, symmetric growths,
 * filled squares and diagonal highways that cross the frame, collide and break up.  Every colour lays bare its own
 * cut of the photo; the ants leave glowing trails.  An endless, periodic field (a torus).
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> a new section moves on to the next rule word (the ants keep walking)
 *   audioOnset      -> new ants hatch (structure)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the trails flash (light)
 *
 * Knobs: ruleP (the first rule word), antsP (how many ants at the start), scaleP (cell size), hueP.
//@params ruleP antsP scaleP
//@audio audioOnset audioKick audioSectionId
//@state 480 270 120
//@body
/**  One of the rule words: bit i set means "turn right on colour i".
 *
 * @param k  The rule, 0..5. (in)
 *
 * @return
 *   The bit mask and the word's length (the number of colours).
 **/
ivec2 ruleOf(int k)
{
    if (k == 0) return ivec2(1, 2);                            // RL: Langton's ant
    if (k == 1) return ivec2(12, 4);                           // LLRR: symmetric growth
    if (k == 2) return ivec2(318, 9);                          // LRRRRRLLR: fills a square
    if (k == 3) return ivec2(3619, 12);                        // RRLLLRLLLRRR: a growing triangle
    if (k == 4) return ivec2(5, 3);                            // RLR: chaos
    return ivec2(2396, 12);                                    // LLRRRLRLRLLR: winding highways
}
/**  The rule word in force: the knob's, moved on by each new section.
 *
 * @return
 *   The rule, 0..5.
 **/
int ruleNow()
{
    int k0 = int(floor(clamp(ruleP, 0.0, 0.999) * 6.0));
    return (k0 + int(max(audioSectionId, 0.0))) % 6;
}
/**  A step in one of the four directions.
 *
 * @param d  The direction: 0 east, 1 north, 2 west, 3 south. (in)
 *
 * @return
 *   The step in cells.
 **/
ivec2 stepOf(int d) { return d == 0 ? ivec2(1, 0) : d == 1 ? ivec2(0, 1) : d == 2 ? ivec2(-1, 0) : ivec2(0, -1); }

/**  One step of all ants for this cell (the state pass): gathered -- the cell asks its four neighbours whose ant
 * steps onto it.
 *
 * @return
 *   Colour, ant (0 none, else direction + 1), trail glow, photo reveal.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    ivec2 rule = ruleOf(ruleNow());
    float m = float(rule.y);
    if (stateFrame < 0.5) {
        float ant = stRand(0) < 0.0005 + 0.0012 * clamp(antsP, 0.0, 1.0) ? 1.0 + floor(stRand(1) * 4.0) : 0.0;
        return vec4(0.0, ant, 0.0, 0.0);
    }
    vec4 c = stAt(ip);
    float col = mod(c.r, m);
    // the ant on this cell advances its colour and leaves
    float col2 = c.g > 0.5 ? mod(col + 1.0, m) : col;
    float ant2 = 0.0;
    for (int j = 0; j < 4; ++j) {
        ivec2 q = ip + stepOf(j);
        vec4 nb = stAt(q);
        if (nb.g < 0.5) continue;
        int dn = int(nb.g - 0.5);
        int cn = int(mod(nb.r, m));
        bool right = ((rule.x >> cn) & 1) == 1;
        int d2 = (dn + (right ? 3 : 1)) % 4;
        if (q + stepOf(d2) == ip) { ant2 = float(d2) + 1.0; break; }
    }
    // hatching: a few ants always, many on an onset
    if (ant2 < 0.5 && stRand(2) < 2.0e-7 + (audioOnset > 0.6 ? 4.0e-6 : 0.0)) ant2 = 1.0 + floor(stRand(3) * 4.0);
    if (stRand(4) < 4.0e-5) col2 = 0.0;                        // the oldest tracks slowly fade from the field
    float trail = ant2 > 0.5 ? 1.0 : c.b * 0.93;
    float reveal = max(c.a * 0.999, col2 > 0.5 ? 1.0 : 0.0);
    return vec4(col2, ant2, trail, reveal);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.3 + 0.25 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p + 0.03 * vec2(sin(0.031 * sceneTime), cos(0.023 * sceneTime)), zoom);
    vec4 c = texelFetch(texState, stWrap(ivec2(floor(cc))), 0);
    vec4 s = stLin(cc);                                         // the soft trails and reveal
    float m = float(ruleOf(ruleNow()).y);
    float k = mod(c.r, m);
    vec2 uv = cc / stateRes.y * 0.7;
    vec3 photo = imgLod(uv + vec2(0.37, 0.61) * k, 0.5);       // every colour its own cut of the photo
    vec3 tone = imgPalette(k / m + 0.03 * audioPhase);
    vec2 f = abs(fract(cc) - 0.5);
    float tile = 1.0 - 0.35 * smoothstep(0.38, 0.5, max(f.x, f.y));   // a faint grout between the cells
    vec3 col = k > 0.5 ? mix(photo, tone, 0.35) * (0.45 + 0.5 * k / m) * tile : imgLod(uv, 2.0) * 0.18;
    col *= 0.6 + 0.4 * s.a;
    vec3 glow = mix(imgPalette(0.5 + 0.03 * audioPhase), vec3(1.0), 0.5);
    col += glow * s.b * s.b * (0.8 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
