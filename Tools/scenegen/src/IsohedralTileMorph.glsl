//@doc
 * @brief ISOHEDRAL TILE MORPH: Escher-like tiles that flow between isohedral types -- a square tiling whose
 * horizontal edges follow one curve and whose vertical edges follow another (the translation type TTTT), then one
 * whose edges are turned copies of each other (the rotation type: four tiles meet at a turning point), then one on
 * a brick lattice.  The curves move continuously, the interlocking creatures change their shapes, and on a new
 * section the tiling passes to the next type.  Every tile holds the same motif from the photo, so the tiling reads
 * as one creature repeated, brighter or darker tile by tile.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each section passes to the next isohedral type (crossfaded over four seconds)
 *   audioPhase      -> the edge curves move (integrated)
 *   audioSwell      -> how far the edges bulge
 *   audioKick       -> the outlines flash (light)
 *
 * Knobs: sizeP (tile size), bendP (the base bulge), outlineP (how strong the outlines are), hueP.
//@params sizeP bendP outlineP
//@audio audioSwell audioKick audioSectionId audioSectionAge
//@body
/**  An edge curve: a smooth periodic bulge (period one tile).
 *
 * @param s  The position along the edge. (in)
 * @param k  Which curve. (in)
 *
 * @return
 *   The bulge, about -1..1.
 **/
float edgeCurve(float s, float k)
{
    float t = 0.08 * audioPhase + 0.12 * sceneTime;
    return sin(6.2831853 * s + t + k) * 0.6 + sin(12.566371 * s - 0.7 * t + 2.0 * k) * 0.3
           + sin(18.849556 * s + 0.4 * t + 3.0 * k) * 0.15;
}
/**  The tile a point lies in, for one isohedral type.
 *
 * @param x     The point in tile units. (in)
 * @param type  0 translation (TTTT), 1 rotation about the corners, 2 brick lattice. (in)
 * @param amp   The bulge. (in)
 *
 * @return
 *   The tile's index (xy) and the distance to its outline (z).
 **/
vec3 tileOf(vec2 x, int type, float amp)
{
    float sh = type == 2 ? 0.5 * floor(x.y) : 0.0;
    x.x += sh;                                                  // brick: every row shifted half a tile
    float fy = amp * edgeCurve(x.x, 1.0);
    float fx = amp * edgeCurve(x.y, 2.0);
    if (type == 1) {
        // rotation type: the curve along an edge is the turned copy of its neighbour's, so four tiles meet
        // at turning points; alternate the curves' signs by cell parity
        float cy = floor(x.y - fy), cx = floor(x.x - fx);
        float sgn = mod(cx + cy, 2.0) < 0.5 ? 1.0 : -1.0;
        fy *= sgn;
        fx *= -sgn;
    }
    float j = floor(x.y - fy), i = floor(x.x - fx);
    float dy = min(fract(x.y - fy), 1.0 - fract(x.y - fy));
    float dx = min(fract(x.x - fx), 1.0 - fract(x.x - fx));
    return vec3(i - sh, j, min(dx, dy));
}

void main()
{
    vec2 p = screenP();
    float sz = 0.16 + 0.14 * clamp(sizeP, 0.0, 1.0);
    vec2 x = p / sz;
    float amp = (0.08 + 0.12 * clamp(bendP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float k = max(audioSectionId, 0.0);
    int tNow = int(mod(k, 3.0)), tBefore = int(mod(k + 2.0, 3.0));
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    vec3 a = tileOf(x, tNow, amp), b = tileOf(x, tBefore, amp);
    float ha = hash21(a.xy + 0.3), hb = hash21(b.xy + 0.3);
    // every tile shows the same motif, taken relative to its own (bent) cell, turned by parity in the rotation type
    vec2 la = x - a.xy - 0.5, lb = x - b.xy - 0.5;
    if (tNow == 1 && mod(a.x + a.y, 2.0) > 0.5) la = -la.yx;
    if (tBefore == 1 && mod(b.x + b.y, 2.0) > 0.5) lb = -lb.yx;
    vec3 ca = imgLod(la * 0.45 + 0.5, 0.4);
    vec3 cb = imgLod(lb * 0.45 + 0.5, 0.4);
    vec3 col = mix(cb * (0.8 + 0.6 * hb), ca * (0.8 + 0.6 * ha), m);
    float line = mix(1.0 - smoothstep(0.0, 0.035, b.z), 1.0 - smoothstep(0.0, 0.035, a.z), m);
    vec3 tone = imgPalette(mix(hb, ha, m) + 0.03 * audioPhase);
    col = mix(col, mix(tone, vec3(1.0), 0.4) * (0.3 + 0.7 * clamp(audioKick, 0.0, 1.0)), line * (0.3 + 0.6 * clamp(outlineP, 0.0, 1.0)));
    finish(col);
}
