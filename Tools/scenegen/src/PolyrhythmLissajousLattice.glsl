//@doc
 * @brief POLYRHYTHM LISSAJOUS LATTICE: a table of Lissajous figures, one per cell, each drawn by two rhythms against
 * each other -- the column's beat in x, the row's in y -- so the table shows every polyrhythm side by side: 2 against
 * 3 a figure eight with a twist, 3 against 4 a woven knot, and the ones on the diagonal plain circles.  A bead runs
 * round every figure at its own pace, and the table's rhythms shift as the music changes harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the beads run on the beat (the beats counted on the state pass: continuous)
 *   audioHarmAdvance -> each change of harmony shifts which rhythms the table holds (crossfaded)
 *   audioPhase      -> the figures' phase turns (integrated)
 *   audioKick       -> the beads flash (light)
 *
 * Knobs: cellsP (cells across), lineP (the lines' width), photoP (photo share), hueP.
//@params cellsP lineP photoP
//@audio audioBeatPhase audioKick audioHarmAdvance
//@state 1 1 120
//@body
/**  The state pass: counts the beats (wraps of the beat phase).
 *
 * @return
 *   The beats (r), the last beat phase (g), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, audioBeatPhase, 0.0, 1.0);
    vec4 c = texelFetch(texState, ivec2(0, 0), 0);
    return vec4(c.r + (audioBeatPhase < c.g - 0.5 ? 1.0 : 0.0), audioBeatPhase, 0.0, 1.0);
}

/**  One cell's figure: the distance to the Lissajous curve (fx : fy) and the bead's distance.
 *
 * @param q     The point in the cell (-0.5 .. 0.5). (in)
 * @param fx    The x rhythm. (in)
 * @param fy    The y rhythm. (in)
 * @param ph    The phase between them. (in)
 * @param bt    The bead's time. (in)
 *
 * @return
 *   The distance to the curve (x) and to the bead (y).
 **/
vec2 figure(vec2 q, float fx, float fy, float ph, float bt)
{
    float best = 1e9;
    vec2 prev = 0.4 * vec2(sin(ph), 0.0);
    for (int i = 1; i <= 96; ++i) {
        float t = 6.2831853 * float(i) / 96.0;
        vec2 c = 0.4 * vec2(sin(fx * t + ph), sin(fy * t));
        best = min(best, sdSeg(q, prev, c));                    // the curve as joined segments, unbroken
        prev = c;
    }
    float tb = 6.2831853 * bt;
    vec2 cb = 0.4 * vec2(sin(fx * tb + ph), sin(fy * tb));
    return vec2(best, length(q - cb));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float beats = texelFetch(texState, ivec2(0, 0), 0).r + clamp(audioBeatPhase, 0.0, 1.0);
    float n = floor(4.0 + 3.0 * clamp(cellsP, 0.0, 1.0));
    float cs = 1.0 / n;
    vec2 g = p / cs;
    vec2 cell = floor(g);
    vec2 q = g - cell - 0.5;
    float h = max(audioHarmAdvance, 0.0);
    float gl = smoothstep(0.2, 0.8, fract(h));
    float lw = (0.012 + 0.02 * clamp(lineP, 0.0, 1.0));
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    float lineA = 0.0, beadA = 0.0;
    for (int s = 0; s < 2; ++s) {
        float w = s == 0 ? 1.0 - gl : gl;
        if (w < 0.001) continue;
        float off = floor(h) + float(s);
        float fx = 1.0 + mod(cell.x + off, 5.0), fy = 1.0 + mod(cell.y + 2.0 * off, 5.0);
        float ph = 0.02 * audioPhase + 0.03 * sceneTime;
        vec2 dd = figure(q, fx, fy, ph, beats / (fx * fy));
        lineA += w * (1.0 - smoothstep(lw * 0.4, lw, dd.x));
        beadA += w * smoothstep(0.045, 0.02, dd.y);
    }
    vec3 tone = imgPalette(hash21(cell) + 0.03 * audioPhase);
    vec3 photo = imgLod((cell + 0.5) * cs * 0.5 + 0.5 + q * cs * 0.4, 0.8);
    vec3 line = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
    col = mix(col, line * 0.9, lineA);
    col = mix(col, mix(line, vec3(1.0), 0.5) * (1.1 + 0.6 * clamp(audioKick, 0.0, 1.0)), beadA);
    finish(col * 1.1);
}
