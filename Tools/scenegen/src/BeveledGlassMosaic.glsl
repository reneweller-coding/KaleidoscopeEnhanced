//@doc
 * @brief BEVELED GLASS MOSAIC: a window of bevelled glass panes in dark leading before the photo: the flat middle of
 * each pane shows the picture almost straight, while its bevelled borders, cut at an angle, throw their strips of the
 * picture sideways and fringe them with a little colour, so the photo is broken into prismatic pieces; the window
 * slides slowly, and its panes grow or shrink with the chords.  A pane is a rectangle; its bevel shifts the picture by
 * a constant step toward the pane's edge (the facets meet in mitred corners), the three colours a little apart.  Two
 * windows of different pane sizes are cross-faded as the harmony changes.  The photo's colours, calmed toward one
 * colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the window slides (integrated)
 *   audioHarmAdvance -> the panes' size: every chord change cross-fades to a window of another pane size
 *
 * Knobs: paneP (the panes' base size), bevelP (the bevels' width), hueP.
//@params paneP bevelP
//@audio audioHarmAdvance
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

/**  The photo seen through one window of bevelled panes.
 *
 * @param p      The place on screen. (in)
 * @param S      The panes' size. (in)
 * @param slide  The window's slide. (in)
 * @param bev    The bevels' width (in pane units). (in)
 * @param fh     The colour family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 window(vec2 p, float S, vec2 slide, float bev, float fh)
{
    vec2 q = (p + slide) / (S * vec2(1.0, 0.72));
    vec2 f = fract(q) - 0.5;
    float e = 0.5 - max(abs(f.x), abs(f.y));                         // the distance to the pane's edge
    vec2 dir = abs(f.x) > abs(f.y) ? vec2(sign(f.x), 0.0) : vec2(0.0, sign(f.y));
    float onBev = smoothstep(bev, bev - 0.012, e);
    vec2 sh = dir * 0.09 * onBev;
    vec2 uv = p * 0.6 + 0.5;
    vec3 c = vec3(imgLod(uv + sh * 1.12, 0.5).r, imgLod(uv + sh, 0.5).g, imgLod(uv + sh * 0.88, 0.5).b);
    c = tone(c, fh);
    c *= 0.85 + 0.45 * onBev * dot(dir, normalize(vec2(-0.5, 0.7)));
    c += famLight(fh, 0.6, 0.85) * exp(-pow((e - bev) / 0.006, 2.0)) * 0.2;   // the facet's crease catches light
    float lead = smoothstep(0.012, 0.024, e);
    return mix(famCol(fh, 0.4) * 0.03, c, lead);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S0 = 0.22 + 0.12 * clamp(paneP, 0.0, 1.0);
    float bev = 0.1 + 0.1 * clamp(bevelP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    vec2 slide = vec2(0.6, 0.25) * (0.02 * sceneTime + 0.08 * audioAdvance);
    float sA = S0 * (0.75 + 0.5 * fract(hk * 0.618034)), sB = S0 * (0.75 + 0.5 * fract((hk + 1.0) * 0.618034));
    vec3 col = (1.0 - hm) * window(p, sA, slide, bev, fh) + hm * window(p, sB, slide, bev, fh);
    finish(col);
}
