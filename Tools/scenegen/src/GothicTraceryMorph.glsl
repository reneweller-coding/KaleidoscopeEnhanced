//@doc
 * @brief GOTHIC TRACERY MORPH: windows of Gothic tracery drawn as glowing lines: in each round window a foil of lobes --
 * trefoil, quatrefoil, cinquefoil, sexfoil -- and round it a ring of curved mouchettes, the whole wall of windows
 * gliding from one style to the next as the chords change.  A foil is the outline of the union of its lobe circles
 * (the nearest lobe circle's distance); a mouchette is a crescent, one circle minus a smaller one beside it, turned
 * round the ring; two foil counts are cross-faded as the harmony moves.  The lines are shades of one colour family
 * from the photo, the glass between them faintly lit by the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the tracery's style (the number of lobes) changes with the chords (cross-faded)
 *   audioAdvance     -> the mouchettes turn slowly round their rings (integrated)
 *   audioSwell       -> the lines' glow
 *
 * Knobs: paneP (the windows' size), lineP (the lines' width), hueP.
//@params paneP lineP
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

/**  One window's tracery lines.
 *
 * @param q     The place, the window's centre at 0 (radius 1 at its frame). (in)
 * @param n     The number of lobes. (in)
 * @param turn  The mouchettes' turning. (in)
 * @param lw    The lines' half width (in window radii). (in)
 *
 * @return
 *   The light of the lines.
 **/
float tracery(vec2 q, float n, float turn, float lw)
{
    float r = length(q), a = atan(q.y, q.x);
    float frame = abs(r - 1.0);
    float inner = abs(r - 0.92);
    // the foil: the union of n lobe circles round the middle
    float sec = 6.2831853 / n;
    float ak = (floor(a / sec + 0.5)) * sec;
    float rl = 0.48 * sin(0.5 * sec) / (1.0 + sin(0.5 * sec)) * 1.25;
    float foil = abs(length(q - 0.48 * vec2(cos(ak), sin(ak))) - rl);
    float eye = abs(r - 0.12);
    // the mouchettes: crescents turned round the ring between the foil and the frame
    float am = a - turn;
    float km = floor(am / sec + 0.5) * sec + turn;
    vec2 cm = 0.74 * vec2(cos(km), sin(km));
    vec2 side = 0.07 * vec2(cos(km + 1.5708), sin(km + 1.5708));
    float crescent = max(length(q - cm) - 0.15, -(length(q - cm - side) - 0.12));
    float mou = abs(crescent);
    float d = min(min(frame, inner), min(min(foil, eye), mou));
    return exp(-pow(d / lw, 2.0)) + 0.2 * exp(-d / (5.0 * lw));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.5 + 0.2 * clamp(paneP, 0.0, 1.0);
    float lw = 0.008 + 0.008 * clamp(lineP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float nA = 3.0 + mod(hk, 4.0), nB = 3.0 + mod(hk + 1.0, 4.0);
    float turn = 0.02 * sceneTime + 0.08 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the wall of windows: one in the middle, the others round it
    vec2 g = p / S + 0.5;
    vec2 cid = floor(g);
    vec2 q = (fract(g) - 0.5) * 2.0 / 0.94;
    float tw = turn * (mod(cid.x + cid.y, 2.0) < 0.5 ? 1.0 : -1.0);
    float l = (1.0 - hm) * tracery(q, nA, tw, lw / (0.47 * S)) + hm * tracery(q, nB, tw, lw / (0.47 * S));
    float glass = smoothstep(1.02, 0.98, length(q));
    vec3 col = tone(imgLod(p * 0.5 + 0.5, 3.0), fh) * (0.06 + 0.16 * glass);
    col += famLight(fh, 0.55, 0.6) * l * glow;
    finish(col);
}
