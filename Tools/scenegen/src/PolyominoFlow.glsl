//@doc
 * @brief POLYOMINO FLOW: the photo as a sliding puzzle without a gap -- on every beat three rows (or three columns)
 * of tiles slide along by one or two, gliding over the beat and wrapping round at the edge.  A round of moves
 * scrambles the picture, then the same moves are undone in reverse order and the photo stands whole again, and the
 * next round begins.  Every tile keeps a faint shade of its home square, so the scramble reads as a patchwork; the
 * tiles' seams show as thin grooves.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> every beat three rows or columns slide (the slide glides over the beat); the beats are counted on
 *                      the state pass
 *   audioSwell      -> the grooves deepen
 *   audioKick       -> the sliding rows flash (light)
 *
 * Knobs: tilesP (tiles across), lengthP (moves per round: 12 to 32), grooveP (groove width), hueP.
//@params tilesP lengthP grooveP
//@audio audioSwell audioKick audioBeatPhase
//@state 4 1 120
//@body
/**  The beat counter (the state pass): counts the wraps of the beat phase.
 *
 * @return
 *   The beats counted (r), the last beat phase seen (g), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, audioBeatPhase, 0.0, 1.0);
    vec4 c = texelFetch(texState, ivec2(0, 0), 0);
    float beats = c.r + (audioBeatPhase < c.g - 0.5 ? 1.0 : 0.0);
    return vec4(beats, audioBeatPhase, 0.0, 1.0);
}
/**  One line of one step of a round: which axis, which line, how far and which way.
 *
 * @param rnd   The round. (in)
 * @param j     The step within the round (one per beat). (in)
 * @param k     Which of the step's three lines. (in)
 * @param nx    Tiles across. (in)
 * @param ny    Tiles down. (in)
 *
 * @return
 *   The axis (x: 0 a row, 1 a column), the line's index (y) and the signed shift in tiles (z).
 **/
vec3 moveOf(float rnd, float j, float k, float nx, float ny)
{
    float axis = hash11(rnd * 13.1 + j * 1.7) < 0.5 ? 0.0 : 1.0;
    float n = axis < 0.5 ? ny : nx;
    float base = floor(hash11(rnd * 7.3 + j * 3.9) * n);
    float idx = mod(base + k * floor(n / 3.0), n);             // three distinct lines: the step's moves commute
    float amt = (hash11(rnd * 2.9 + j * 5.3 + k * 0.71) < 0.5 ? -1.0 : 1.0) * (hash11(rnd * 4.1 + j * 2.3 + k * 1.3) < 0.6 ? 1.0 : 2.0);
    return vec3(axis, idx, amt);
}

/**  Undoes one step (its three line shifts, scaled) on a tile coordinate.
 *
 * @param g     The tile coordinate. (in)
 * @param rnd   The round. (in)
 * @param j     The step. (in)
 * @param amt   How much of the step to undo (0..1). (in)
 * @param nx    Tiles across. (in)
 * @param ny    Tiles down. (in)
 * @param hit   Set to 1 when the coordinate lies on one of the step's lines. (inout)
 *
 * @return
 *   The coordinate before the step.
 **/
vec2 undoStep(vec2 g, float rnd, float j, float amt, float nx, float ny, inout float hit)
{
    for (int k = 0; k < 3; ++k) {
        vec3 mv = moveOf(rnd, j, float(k), nx, ny);
        if (mv.x < 0.5) { if (floor(g.y) == mv.y) { g.x = mod(g.x - mv.z * amt, nx); hit = 1.0; } }
        else { if (floor(g.x) == mv.y) { g.y = mod(g.y - mv.z * amt, ny); hit = 1.0; } }
    }
    return g;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float nx = floor(8.0 + 10.0 * clamp(tilesP, 0.0, 1.0)), ny = floor(nx * 0.5625 + 0.5);
    float L = floor(12.0 + 20.0 * clamp(lengthP, 0.0, 1.0));
    float beats = texelFetch(texState, ivec2(0, 0), 0).r;
    float frac = smoothstep(0.0, 1.0, clamp(audioBeatPhase * 1.4, 0.0, 1.0));   // the slide glides over the beat
    float rnd = floor(beats / (2.0 * L));
    float c = mod(beats, 2.0 * L);
    // how many of this round's steps stand done, and the step gliding now (forward, or being undone)
    float done = c < L ? c : 2.0 * L - c;
    bool undoing = c >= L;
    vec2 g = (p / vec2(1.7777778, 1.0) + 0.5) * vec2(nx, ny);   // tile coordinates
    // the gliding step first (partly), then the done steps undone from the last to the first
    float moving = 0.0, dummy = 0.0;
    float jg = undoing ? done - 1.0 : done;
    if (jg >= 0.0 && jg < L) g = undoStep(g, rnd, jg, undoing ? 1.0 - frac : frac, nx, ny, moving);
    float stop = undoing ? done - 1.0 : done;
    for (int k = 31; k >= 0; --k) {
        float j = float(k);
        if (j >= stop) continue;
        g = undoStep(g, rnd, j, 1.0, nx, ny, dummy);
    }
    vec2 uv = g / vec2(nx, ny);
    vec3 photo = imgLod(uv, 0.3);
    vec2 home = floor(g);
    photo *= 0.85 + 0.3 * hash21(home + 0.5);                   // a faint shade of the home square
    vec2 f = fract(g);
    float gw = (0.02 + 0.05 * clamp(grooveP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float groove = 1.0 - smoothstep(0.0, gw, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 col = photo * (1.0 - 0.6 * groove) + mix(tone, vec3(1.0), 0.5) * groove * 0.15;
    col += mix(tone, vec3(1.0), 0.5) * moving * 0.12 * clamp(audioKick, 0.0, 1.0) * (1.0 - frac);
    finish(col);
}
