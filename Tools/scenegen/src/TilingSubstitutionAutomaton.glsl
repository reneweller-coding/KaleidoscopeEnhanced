//@doc
 * @brief TILING SUBSTITUTION AUTOMATON: self-similar tilings grown by substitution -- the chair (an L of three
 * squares splits into four smaller Ls) and the table (a domino splits into four dominoes, two upright).  Every pixel
 * descends the hierarchy to find its tile; the generations glide in and out, the view zooms endlessly toward a fixed
 * point of the substitution (one zoom octave is one generation, so it never ends and never jumps), mirrored at the
 * axes.  Each tile shows its own cut of the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> every change of harmony divides the tiles one generation further or merges them back (gliding)
 *   audioSectionId   -> a new section crossfades to the other tiling
 *   audioPhase       -> the palette turns through the photo (integrated)
 *   audioKick        -> the youngest edges flash (light)
 *
 * Knobs: tileP (the first tiling: chair or table), genP (the base generation), zoomP (zoom speed), hueP.
//@params tileP genP zoomP
//@audio audioKick audioHarmAdvance audioSectionId audioSectionAge
//@body
/**  An integer hash (Wellons' lowbias32).
 *
 * @param x  The input. (in)
 *
 * @return
 *   A well mixed 32-bit value.
 **/
uint tileHash(uint x)
{
    x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
    return x;
}
/**  One level down the chair substitution: which of the four sub-chairs holds the point, and the point in its frame.
 *
 * @param q   The point in the chair's frame (the L [0,2]^2 without [1,2]^2); replaced by its place in the sub-chair. (in,out)
 *
 * @return
 *   The sub-chair: 0 at the corner (the fixed point), 1 in the middle, 2 and 3 in the arms.
 **/
int chairDown(inout vec2 q)
{
    if (q.x >= 1.0 && !(q.x < 1.5 && q.y >= 0.5)) { q = vec2(2.0 - q.x, q.y) * 2.0; return 2; }
    if (q.y >= 1.0 && !(q.y < 1.5 && q.x >= 0.5)) { q = vec2(q.x, 2.0 - q.y) * 2.0; return 3; }
    if (q.x >= 0.5 && q.y >= 0.5) { q = (q - 0.5) * 2.0; return 1; }
    q *= 2.0;
    return 0;
}
/**  A point's distance to the edge of the chair it lies in (in the chair's frame).
 *
 * @param q  The point in the chair's frame. (in)
 *
 * @return
 *   The distance to the L's boundary.
 **/
float chairEdge(vec2 q)
{
    float d = min(q.x, q.y);
    if (q.x > 1.0) return min(d, min(2.0 - q.x, 1.0 - q.y));
    if (q.y > 1.0) return min(d, min(2.0 - q.y, 1.0 - q.x));
    return min(d, min(length(q - 1.0), min(2.0 - q.x, 2.0 - q.y)));
}
/**  One level down the table substitution (a 2 x 1 domino into four 1 x 0.5 dominoes).
 *
 * @param q   The point in the domino's frame ([0,2] x [0,1]); replaced by its place in the sub-domino. (in,out)
 *
 * @return
 *   The sub-domino: 0 middle bottom (the fixed point's), 1 middle top, 2 left upright, 3 right upright.
 **/
int tableDown(inout vec2 q)
{
    if (q.x < 0.5) { q = vec2(q.y, 0.5 - q.x) * 2.0; return 2; }
    if (q.x >= 1.5) { q = vec2(q.y, q.x - 1.5) * 2.0; return 3; }
    if (q.y < 0.5) { q = vec2(q.x - 0.5, q.y) * 2.0; return 0; }
    q = vec2(q.x - 0.5, q.y - 0.5) * 2.0;
    return 1;
}
/**  The tiling at a screen point: the fill of the generation shown, and its edges down to the finest level.
 *
 * @param p      The screen point. (in)
 * @param table  True for the table tiling, false for the chair. (in)
 * @param zf     The zoom within the octave, 0..1. (in)
 * @param gen    The generation shown (fractional: the next one glides in). (in)
 *
 * @return
 *   The colour.
 **/
vec3 tiling(vec2 p, bool table, float zf, float gen)
{
    float s = 0.97 * exp2(-zf);
    vec2 q = table ? vec2(1.0 + p.x * s, abs(p.y) * s) : abs(p) * s;
    float unit = 1.0 / s;                                      // screen units per frame unit at level 0
    uint id = 0u;
    float kf = gen + zf;
    int kFill = int(floor(kf));
    float wNext = smoothstep(0.55, 1.0, fract(kf));
    vec3 fill = vec3(0.0), fillN = vec3(0.0);
    float line = 0.0;
    for (int i = 0; i < 11; ++i) {
        float a = float(i) - zf;                               // the level's apparent generation
        float e = (table ? min(min(q.x, q.y), min(2.0 - q.x, 1.0 - q.y)) : chairEdge(q)) * unit;
        float wl = smoothstep(gen + 1.2, gen + 0.2, a);         // finer levels fade in
        float width = 0.004 * exp2(-0.3 * max(a, 0.0));
        line = max(line, wl * (1.0 - smoothstep(width * 0.5, width * 1.5, e)));
        if (i == kFill || i == kFill + 1) {
            // the path's number: leading corner choices (0) add nothing, so a tile keeps its colour when the zoom
            // wraps and it moves up a level
            float h = float(tileHash(id + 0x51edu) >> 8u) / 16777216.0;
            vec2 uv = p * 0.6 + 0.5 + vec2(h, fract(h * 7.31)) * 0.8;
            vec3 c = mix(imgLod(uv, 0.8), imgPalette(h + 0.03 * audioPhase), 0.3) * (0.55 + 0.6 * h);
            if (i == kFill) fill = c; else fillN = c;
        }
        int ch = table ? tableDown(q) : chairDown(q);
        id = id * 4u + uint(ch);
        unit *= 0.5;
    }
    vec3 col = mix(fill, fillN, wNext);
    // the joints: a dark groove with a bright lip, so every generation's outline reads
    vec3 edge = mix(imgPalette(0.5 + 0.03 * audioPhase), vec3(1.0), 0.5) * (0.7 + 0.6 * clamp(audioKick, 0.0, 1.0));
    col *= 1.0 - 0.75 * line;
    return col + edge * line * line * 0.5;
}

void main()
{
    vec2 p = rot2(0.006 * sceneTime) * screenP();
    float zf = fract((0.01 + 0.04 * clamp(zoomP, 0.0, 1.0)) * sceneTime);
    float tri = abs(fract(audioHarmAdvance / 8.0) * 2.0 - 1.0);     // up and down through the generations
    float gen = 1.5 + 2.0 * clamp(genP, 0.0, 1.0) + 2.0 * tri;
    // a new section crossfades from the last tiling to the next
    float k = floor(clamp(tileP, 0.0, 0.999) * 2.0) + max(audioSectionId, 0.0);
    float now = mod(k, 2.0), before = mod(k + 1.0, 2.0);
    float m = mix(before, now, smoothstep(0.0, 4.0, audioSectionAge));
    if (audioSectionId < 0.5) m = now;
    vec3 col = vec3(0.0);
    if (m < 0.999) col += (1.0 - m) * tiling(p, false, zf, gen);
    if (m > 0.001) col += m * tiling(p, true, zf, gen);
    finish(col);
}
