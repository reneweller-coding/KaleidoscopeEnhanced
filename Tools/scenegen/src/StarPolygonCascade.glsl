//@doc
 * @brief STAR POLYGON CASCADE: an endless grid of eight-pointed star polygons {8/k} as in Islamic patterns, their points
 * meeting their neighbours'; k glides between two and three and a half, so every star's lines wander through one
 * another -- octagons, sharp stars, interlaced double squares -- while the grid turns slowly.  A star polygon joins every
 * k-th vertex; its chords are lines at the distance R cos(pi k / n) from the centre with their normals every 2 pi / n
 * from the angle pi k / n, so a non-whole k still gives a continuous figure; each pixel measures the three chords
 * nearest its angle.  The lines are shades of one colour family from the photo; the cells are faintly lit by the
 * photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> k glides with the chords: every star's lines wander through one another
 *   audioAdvance     -> the grid turns (integrated)
 *   audioSwell       -> the lines' glow
 *
 * Knobs: cellP (the stars' size), lineP (the lines' width), hueP.
//@params cellP lineP
//@audio audioHarmAdvance audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.28 + 0.14 * clamp(cellP, 0.0, 1.0);
    float lw = 0.0018 + 0.002 * clamp(lineP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float k = 2.0 + 1.5 * (0.5 + 0.5 * sin(0.6 * h));
    float turn = 0.01 * sceneTime + 0.04 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 g = rot2(turn) * p / S + 0.5;
    vec2 q = (fract(g) - 0.5) * S;
    const float n = 8.0;
    float R = 0.5 * S / cos(3.14159265 / n);                         // the vertices reach the cell's edges' middles
    float sec = 6.2831853 / n;
    float off = 3.14159265 * k / n;
    float dk = R * cos(off), half8 = R * sin(off);
    float a = atan(q.y, q.x) - off;
    float j0 = floor(a / sec + 0.5);
    float r = length(q);
    float best = 9.0;
    for (int jj = -1; jj <= 1; ++jj) {
        float aj = (j0 + float(jj)) * sec + off;
        vec2 nr = vec2(cos(aj), sin(aj));
        float along = dot(q, vec2(-nr.y, nr.x));
        float across = dot(q, nr) - dk;
        float d = length(vec2(across, max(abs(along) - half8, 0.0)));
        best = min(best, d);
    }
    float line = exp(-pow(best / lw, 2.0)) + 0.2 * exp(-best / (5.0 * lw));
    vec3 col = tone(imgLod(p * 0.5 + 0.5, 3.0), fh) * 0.12 * (0.6 + 0.4 * smoothstep(R, 0.0, r));
    col += famLight(fh, 0.4 + 0.3 * r / R, 0.55) * line * glow;
    finish(famExpose(col, 1.20, 1.00, 0.03, fh));
}
