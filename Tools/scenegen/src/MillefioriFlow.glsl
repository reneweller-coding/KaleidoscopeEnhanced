//@doc
 * @brief MILLEFIORI FLOW: slices of patterned glass canes packed side by side in molten clear glass, lit from behind and
 * slowly flowing: rings, flowers and stars of dots in white and coloured glass, each slice a little different, the
 * whole sheet sliding and swirling as if still soft.  The slices sit on a hexagonal packing seen through a slow domain
 * warp (the melt); each slice draws its pattern from its own radius and angle -- concentric rings, a petalled flower or
 * a ring of small dots round a centre -- and the light comes through brightest at its middle.  The canes take their
 * colour from the photo beneath their place, calmed into one colour family, with white threads.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the melt flows and the sheet drifts (integrated)
 *   audioSectionId/Age -> every new section turns the canes to other patterns (cross-faded over six seconds)
 *   audioSwell         -> the backlight's strength
 *
 * Knobs: caneP (the slices' size), warpP (how strongly the melt swirls), hueP.
//@params caneP warpP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A cane slice's pattern: how white the glass is at a place in the slice.
 *
 * @param q     The place in the slice (radius 1 at the slice's rim). (in)
 * @param kind  0 rings, 1 flower, 2 star of dots. (in)
 * @param hc    The slice's own random number. (in)
 *
 * @return
 *   0 coloured glass .. 1 white thread.
 **/
float canePattern(vec2 q, float kind, float hc)
{
    float r = length(q);
    float an = atan(q.y, q.x);
    float n = 5.0 + floor(4.0 * hc);
    if (kind < 0.5) return smoothstep(0.55, 0.8, abs(fract(r * (3.0 + floor(3.0 * hc))) - 0.5) * 2.0);
    if (kind < 1.5) {
        float rr = r * (1.0 + 0.3 * cos(n * an));
        return smoothstep(0.5, 0.75, abs(fract(rr * 2.5) - 0.5) * 2.0);
    }
    float sec = 6.2831853 / n;
    float a = abs(mod(an, sec) - 0.5 * sec);
    vec2 d = r * vec2(cos(a), sin(a));
    return clamp(smoothstep(0.16, 0.11, length(d - vec2(0.62, 0.0))) + smoothstep(0.22, 0.16, r), 0.0, 1.0);
}

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
    float S = 0.09 + 0.07 * clamp(caneP, 0.0, 1.0);
    float warp = 0.06 + 0.1 * clamp(warpP, 0.0, 1.0);
    float flow = 0.03 * sceneTime + 0.12 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    // the melt: a slow swirl moves the sheet, and the whole sheet drifts
    vec2 w = p + warp * 2.0 * (vec2(fbm(1.3 * p + vec2(flow, 0.0)), fbm(1.3 * p + vec2(5.2, 1.7 - flow))) - 0.5);
    vec2 drift = vec2(0.5 * flow, 0.15 * flow);
    w += drift;
    // the slices on a hexagonal packing
    vec2 g = w / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 a = mod(g, R) - 0.5 * R, b = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q = dot(a, a) < dot(b, b) ? a : b;
    vec2 cell = g - q;
    float hc = hash21(floor(cell * 2.0 + 0.5));
    float rad = 0.44 + 0.05 * hc;
    vec2 qn = rot2(6.2831853 * hc) * q / rad;
    float rq = length(qn);
    vec2 centre = cell * S - drift;                                  // the slice's place on screen, roughly
    vec3 caneCol = mix(famCol(fh, hc), tone(imgLod(centre * 0.5 + 0.5, 3.0), fh), 0.5);
    // each slice has its own pattern; a new section moves every slice on to the next
    float own = floor(3.0 * fract(hc * 7.3));
    float white = (1.0 - m) * canePattern(qn, mod(kA + own, 3.0), hc) + m * canePattern(qn, mod(kB + own, 3.0), hc);
    vec3 glass = mix(caneCol * 0.85, famLight(fh, hc, 0.85), white);
    float back = (0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * (0.7 + 0.6 * (1.0 - rq * rq));
    vec3 col = famCol(fh, 0.5) * 0.06 * (0.6 + 0.8 * fbm(4.0 * w));   // the clear glass between the canes
    col = mix(col, glass * back, smoothstep(1.0, 0.95, rq));
    col += famLight(fh, 0.5, 0.7) * exp(-pow((rq - 0.98) / 0.025, 2.0)) * 0.25;   // the clear casing's rim
    finish(col);
}
