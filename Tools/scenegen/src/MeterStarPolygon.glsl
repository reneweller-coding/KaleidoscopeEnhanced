//@doc
 * @brief METER STAR POLYGON: a tunnel of star polygons, one for every bar -- a triangle, a pentagram, a heptagram, an
 * octagram, the figure changing with the sections -- each turned a step further than the bar before, so the bars stack
 * into a twisting tunnel of stars; the view flies one star per bar.  A small field of the scene's own counts the bars;
 * star n stands at depth n and is turned by n twentieths of a turn; its lines are the chords of the star polygon {n/k}
 * of the section's figure.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase      -> the bars: the flight, one star per bar, each turned a step further
 *   audioSectionId/Age -> every section changes the stars' figure (cross-faded over six seconds)
 *   audioSwell         -> the lines' glow
 *
 * Knobs: spaceP (the stars' spacing), lineP (the lines' width), hueP.
//@params spaceP lineP
//@audio audioBarPhase audioSectionId audioSectionPrev audioSectionAge audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the bars counted by summing the bar phase's steps.
 *
 * @return
 *   x the bars so far, y the last bar phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBarPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4200.0), bp, 0.0, 1.0);
}

/**  The distance to a star polygon's chords.
 *
 * @param q  The place, the star's centre at 0. (in)
 * @param R  The star's radius. (in)
 * @param n  The number of points. (in)
 * @param k  The step between joined points. (in)
 *
 * @return
 *   The distance.
 **/
float starD(vec2 q, float R, float n, float k)
{
    float sec = 6.2831853 / n;
    float off = 3.14159265 * k / n;
    float dk = R * cos(off), hl = R * sin(off);
    float a = atan(q.y, q.x) - off;
    float j0 = floor(a / sec + 0.5);
    float best = 9.0;
    for (int jj = -1; jj <= 1; ++jj) {
        float aj = (j0 + float(jj)) * sec + off;
        vec2 nr = vec2(cos(aj), sin(aj));
        float along = dot(q, vec2(-nr.y, nr.x)), across = dot(q, nr) - dk;
        best = min(best, length(vec2(across, max(abs(along) - hl, 0.0))));
    }
    return best;
}

/**  A section's star figure.
 *
 * @param s  The section's number. (in)
 *
 * @return
 *   x the points, y the step.
 **/
vec2 figureOf(float s)
{
    float j = mod(s, 4.0);
    return j < 0.5 ? vec2(3.0, 1.0) : j < 1.5 ? vec2(5.0, 2.0) : j < 2.5 ? vec2(7.0, 3.0) : vec2(8.0, 3.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float D = 0.5 + 0.4 * clamp(spaceP, 0.0, 1.0);
    float px = (1.6 + 1.6 * clamp(lineP, 0.0, 1.0)) / resolution.y;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    vec2 fA = figureOf(max(audioSectionPrev, 0.0)), fB = figureOf(max(audioSectionId, 0.0));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBarPhase, 0.0, 1.0) - st.y + 1.0);
    float bc = st.x + (dl < 0.5 ? dl : 0.0);                          // the count carried on to this frame
    float zc = (bc - 1.0) * D;
    vec3 col = famCol(fh, 0.45) * 0.015;
    float n0 = floor(bc);
    for (int i = 0; i < 14; ++i) {
        float n = n0 + float(i);
        float dz = n * D - zc;
        if (dz < 0.12) continue;
        float R = 0.5 / dz;
        vec2 q = rot2(n * 0.31415927) * p;                            // a twentieth of a turn per bar
        float dA = m < 0.999 ? starD(q, R, fA.x, fA.y) : 9.0;
        float dB = starD(q, R, fB.x, fB.y);
        float g = (1.0 - m) * (exp(-pow(dA / px, 2.0)) + 0.12 * exp(-dA / (6.0 * px)))
                + m * (exp(-pow(dB / px, 2.0)) + 0.12 * exp(-dB / (6.0 * px)));
        float fade = exp(-0.3 * dz) * smoothstep(0.12, 0.5, dz) * (1.0 - smoothstep(8.0, 11.0, dz));
        col += famLight(fh, 0.3 + 0.4 * fract(n * 0.13), 0.4) * g * fade * glow;
    }
    finish(col);
}
