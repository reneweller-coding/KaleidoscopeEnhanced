//@doc
 * @brief KOLAM LOOP WEAVE: a kolam drawn on a grid of dots: lines loop round the dots and cross between them, weaving a
 * four-fold symmetric ornament over the whole picture; over each phrase the drawing grows out from the middle along
 * its lines and is wiped back again.  In each quarter of a cell the line is a quarter circle joining the two edge
 * midpoints -- either curving round the dot or round the cell's corner -- chosen symmetrically about the centre, so
 * the quarters join into loops round single dots and long lines winding between them.  The drawing's front runs along
 * the loops by the distance from the middle plus the way round each dot.  The lines are shades of one colour family
 * from the photo, the dots white.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the kolam is drawn out from the middle over each phrase and wiped back again
 *   audioAdvance   -> the pattern of loops changes slowly from one layout to the next (integrated, cross-faded)
 *   audioSwell     -> the lines' glow
 *
 * Knobs: gridP (the dots' spacing), lineP (the lines' width), hueP.
//@params gridP lineP
//@audio audioPhrasePos audioSwell
//@body
/**  The kolam's line at a place for one layout.
 *
 * @param g       The place (in cells; dots at the cell centres). (in)
 * @param lid     The layout's number. (in)
 * @param lw      The line's half width (in cells). (in)
 *
 * @return
 *   x the line, y the drawing order of the place (0 near the middle).
 **/
vec2 kolam(vec2 g, float lid, float lw)
{
    vec2 cid = floor(g);
    vec2 f = fract(g) - 0.5;
    vec2 qd = sign(f + 1e-5);                                         // which quarter of the cell
    // the choice is symmetric about the centre: it depends on |cell| and the quarter's direction outward
    vec2 ac = abs(cid + 0.5);
    vec2 ow = qd * sign(cid + 0.5);
    float hsel = fract(sin(dot(ac, vec2(12.9898, 78.233)) + dot(ow, vec2(3.1, 5.3)) + lid * 17.0) * 43758.5453);
    float d;
    if (hsel < 0.55) d = abs(length(f) - 0.5);                        // round the dot
    else d = abs(length(f - 0.5 * qd) - 0.5);                         // round the cell's corner
    float line = exp(-pow(d / lw, 2.0));
    float order = length(cid + 0.5) + 0.25 * (atan(f.y, f.x) / 3.14159265 + 1.0);
    return vec2(line, order);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.1 + 0.06 * clamp(gridP, 0.0, 1.0);
    float lw = 0.03 + 0.03 * clamp(lineP, 0.0, 1.0);
    float clock = 0.5 - 0.5 * cos(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    float lay = 0.01 * sceneTime + 0.04 * audioAdvance;
    float lk = floor(lay), lm = smoothstep(0.3, 0.7, fract(lay));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 g = p / S;
    vec2 a = kolam(g, lk, lw), b = kolam(g, lk + 1.0, lw);
    float line = (1.0 - lm) * a.x + lm * b.x;
    float reach = clock * (length(vec2(0.9, 0.5)) / S + 1.5);
    float drawn = smoothstep(reach + 0.3, reach - 0.3, a.y);
    vec2 f = fract(g) - 0.5;
    float dot0 = smoothstep(0.07, 0.04, length(f));
    vec3 col = famCol(fh, 0.45) * 0.025;
    col += famLight(fh, 0.4 + 0.2 * sin(0.3 * a.y), 0.5) * line * drawn * glow;
    col += vec3(0.9, 0.88, 0.85) * dot0 * 0.5;
    finish(col);
}
