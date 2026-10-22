//@doc
 * @brief PAPERWEIGHT BUBBLE LATTICE: inside a glass paperweight: rows of tiny air bubbles and twisted colour canes lie on
 * nested spheres round the eye, and the glass bends everything into a round world.  Three shells of bubbles surround
 * the centre, each a lattice of latitude rows turning at its own pace; behind them the outermost shell carries the
 * canes as twisted ribbons along its meridians.  The view is bent by a strong fish-eye (the glass' curve); the bubbles
 * are bright-rimmed rings with dark middles, the canes shades of one colour family from the photo with white threads.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the sphere turns (integrated)
 *   audioSectionId/Age -> every new section changes the canes' pattern (cross-faded over six seconds)
 *   audioSwell         -> the bubbles' glow
 *
 * Knobs: bubbleP (how dense the bubble rows are), caneP (how many canes), hueP.
//@params bubbleP caneP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
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

/**  A cane's pattern: how white the cane is at a place on it.
 *
 * @param x     Across the cane, -0.5..0.5. (in)
 * @param s     Along the cane (the latitude). (in)
 * @param kind  0 twisted threads, 1 bands, 2 fine spiral. (in)
 *
 * @return
 *   0 coloured glass .. 1 white thread.
 **/
float canePat(float x, float s, float kind)
{
    if (kind < 0.5) return smoothstep(0.3, 0.42, abs(fract(4.0 * s + 1.5 * x) - 0.5));
    if (kind < 1.5) return smoothstep(0.15, 0.3, abs(fract(2.0 * s) - 0.5)) * smoothstep(0.3, 0.2, abs(x));
    return smoothstep(0.38, 0.46, abs(fract(9.0 * s - 3.0 * x) - 0.5));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float turn = 0.03 * sceneTime + 0.12 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float glowB = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the glass' curve: a strong fish-eye
    float rr = length(p);
    vec3 d0 = normalize(vec3(p * (1.0 + 0.9 * rr * rr), 0.9));
    // the outermost shell: canes along the meridians
    vec3 dc = d0;
    dc.xz = rot2(turn) * dc.xz;
    dc.yz = rot2(0.3 * sin(0.4 * turn)) * dc.yz;
    float lat = asin(clamp(dc.y, -1.0, 1.0)), lon = atan(dc.z, dc.x);
    float nC = floor(8.0 + 8.0 * clamp(caneP, 0.0, 1.0));
    float ci = floor(lon / 6.2831853 * nC);
    float cx = fract(lon / 6.2831853 * nC) - 0.5;
    float wc = (1.0 - m) * canePat(cx, lat, kA) + m * canePat(cx, lat, kB);
    vec3 cc = mix(famCol(fh, fract(ci / nC * 0.7)), tone(imgLod(vec2(ci / nC, 0.5 + 0.3 * sin(lat)), 3.0), fh), 0.4);
    float caneIn = smoothstep(0.5, 0.42, abs(cx)) * smoothstep(1.45, 1.2, abs(lat));
    vec3 col = mix(famCol(fh, 0.5) * 0.18, mix(cc * 0.7, famLight(fh, 0.5, 0.85), wc), caneIn);
    // three shells of bubbles in front, each turning at its own pace
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        vec3 d = d0;
        d.xz = rot2(turn * (1.0 + 0.45 * fk) + 1.7 * fk) * d.xz;
        d.xy = rot2(0.2 * fk) * d.xy;
        float la = asin(clamp(d.y, -1.0, 1.0)), lo = atan(d.z, d.x);
        float nRow = floor((9.0 + 5.0 * clamp(bubbleP, 0.0, 1.0)) * (1.0 + 0.5 * fk));
        float sp = 3.14159265 / nRow;
        float row = floor(la / sp + 0.5);
        float rowLat = row * sp;
        float nLon = max(floor(2.0 * nRow * cos(rowLat)), 1.0);
        float lc = (floor(lo / 6.2831853 * nLon) + 0.5) / nLon * 6.2831853;
        vec2 off = vec2((lo - lc) * cos(la), la - rowLat);
        float br = sp * (0.28 - 0.05 * fk) * (0.8 + 0.4 * hash21(vec2(row, lc * 10.0) + fk));
        float bd = length(off);
        float ring = exp(-pow((bd - br) / (0.22 * br), 2.0)) + 0.15 * smoothstep(br, 0.0, bd);
        col *= 1.0 - 0.35 * smoothstep(br * 1.1, br * 0.6, bd);    // the bubble hides what lies behind it
        col += famLight(fh, 0.5 + 0.15 * fk, 0.8) * ring * glowB * (0.55 - 0.12 * fk);
    }
    // the dome's edge mirrors the light
    col += famLight(fh, 0.5, 0.7) * exp(-pow((rr - 0.95) / 0.08, 2.0)) * 0.15;
    finish(col);
}
