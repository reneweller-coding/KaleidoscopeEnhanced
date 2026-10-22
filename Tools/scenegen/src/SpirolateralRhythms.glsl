//@doc
 * @brief SPIROLATERAL RHYTHMS: an endless grid of spirolaterals -- turtle figures that repeat one sequence of steps,
 * turning a right angle after each, until they close -- all the same figure, all changing together: the five steps'
 * lengths come from five bands of the music, smoothed, so the figures stretch, fold and blossom as the sound's balance
 * shifts.  Five steps repeated four times with right-angle turns always close; the figure is centred on its cell by its
 * mean point, scaled to fill the cell and drawn as twenty glowing segments.  The scene keeps the smoothed bands in a
 * small field of its own.  The lines are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> five bands, smoothed over a second or two, give the steps' lengths: the figures reshape
 *   audioAdvance      -> the figures turn slowly (integrated)
 *
 * Knobs: cellP (the cells' size), lineP (the lines' width), hueP.
//@params cellP lineP
//@audio audioSpectrum[32]
//@state 8 1 60
//@body
/**  The state pass: five bands of the spectrum, each smoothed over a second or two.
 *
 * @return
 *   This cell's smoothed band, 0, 0, 1.
 **/
vec4 stateStep()
{
    int k = stCell().x;
    float b = 0.0;
    for (int i = 0; i < 4; ++i) b += audioSpectrum[min(2 + 5 * k + i, 31)];
    b = clamp(b * 0.25, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(k, 0), 0).r;
    return vec4(mix(old, b, 0.02), 0.0, 0.0, 1.0);
}

/**  The distance from a point to a segment.
 *
 * @param p  The point. (in)
 * @param a  The segment's start. (in)
 * @param b  The segment's end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec2 p, vec2 a, vec2 b)
{
    vec2 ab = b - a, ap = p - a;
    return length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.3 + 0.15 * clamp(cellP, 0.0, 1.0);
    float lw = 0.0018 + 0.0018 * clamp(lineP, 0.0, 1.0);
    float turn = 0.01 * sceneTime + 0.04 * audioAdvance;
    float len[5];
    for (int i = 0; i < 5; ++i) len[i] = 0.6 + 1.6 * texelFetch(texState, ivec2(i, 0), 0).r;
    // the figure's mean point, to centre it
    vec2 pos = vec2(0.0), dir = vec2(1.0, 0.0), mean = vec2(0.0);
    for (int i = 0; i < 20; ++i) {
        pos += dir * len[i % 5];
        dir = vec2(-dir.y, dir.x);
        mean += pos;
    }
    mean /= 20.0;
    float rmax = 0.0;
    pos = vec2(0.0);
    dir = vec2(1.0, 0.0);
    for (int i = 0; i < 20; ++i) {
        pos += dir * len[i % 5];
        dir = vec2(-dir.y, dir.x);
        rmax = max(rmax, length(pos - mean));
    }
    float scale = 0.46 * S / max(rmax, 1e-3);                        // the figure fills its cell
    vec2 g = p / S + 0.5;
    vec2 q = rot2(turn) * ((fract(g) - 0.5) * S);
    float best = 9.0;
    pos = vec2(0.0);
    dir = vec2(1.0, 0.0);
    for (int i = 0; i < 20; ++i) {
        vec2 nxt = pos + dir * len[i % 5];
        best = min(best, segD(q, (pos - mean) * scale, (nxt - mean) * scale));
        pos = nxt;
        dir = vec2(-dir.y, dir.x);
    }
    float line = exp(-pow(best / lw, 2.0)) + 0.2 * exp(-best / (5.0 * lw));
    vec3 col = famCol(fh, 0.45) * 0.02 + famLight(fh, 0.4 + 0.3 * fract(dot(floor(g), vec2(0.37, 0.61))), 0.5) * line;
    finish(col);
}
