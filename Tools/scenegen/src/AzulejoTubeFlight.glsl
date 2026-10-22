//@doc
 * @brief AZULEJO TUBE FLIGHT: a flight through a tube of glazed tiles, every tile a little mirror-symmetric picture made
 * from the photo, framed by a painted border, with the glaze's shine running round the tube with the music's phase;
 * each section of the music lays a different tile pattern, cross-faded.  The tiles are squares with a whole number
 * round the tube; inside a tile the place is folded into one quarter, so the photo shows mirrored four times, and the
 * section chooses which piece of the photo and how it is turned.  The shine is a soft highlight whose angle circles with
 * the integrated phase.  The tiles are the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every section lays its own tile pattern (cross-faded over six seconds)
 *   audioPhase         -> the glaze's shine circles round the tube (integrated)
 *   audioAdvance       -> the flight (integrated)
 *   audioSwell         -> the shine's strength
 *
 * Knobs: tileP (the tiles' size), borderP (the borders' width), hueP.
//@params tileP borderP
//@audio audioSectionId audioSectionPrev audioSectionAge audioPhase audioSwell
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

/**  A tile's picture.
 *
 * @param l    The place in the tile (0..1). (in)
 * @param sec  The section, which chooses the pattern. (in)
 * @param fh   The family's hue. (in)
 *
 * @return
 *   The picture's colour.
 **/
vec3 tilePic(vec2 l, float sec, float fh)
{
    vec2 f = abs(l - 0.5) * 2.0;                                      // folded into a quarter
    if (mod(sec, 2.0) > 0.5) f = vec2(max(f.x, f.y), min(f.x, f.y)); // and along the diagonal too
    vec2 off = fract(vec2(0.13, 0.29) + vec2(0.37, 0.61) * sec);
    vec3 c = tone(imgLod(fract(off + rot2(0.7 * sec) * f * 0.28), 1.5), fh);
    return mix(c, famLight(fh, 0.5, 0.2) * luma(c) * 1.4, 0.35);      // a glaze's calm
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float M = floor(10.0 + 8.0 * (1.0 - clamp(tileP, 0.0, 1.0)));
    float cw = 6.2831853 * R0 / M;
    vec2 q = vec2(a / 6.2831853 * M, (z + fly) / cw);
    vec2 l = fract(q);
    float px = R0 / (r * r * resolution.y) / cw;
    float detail = 1.0 - smoothstep(0.08, 0.25, px);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float sA = max(audioSectionPrev, 0.0), sB = max(audioSectionId, 0.0);
    vec3 pic = m * tilePic(l, sB, fh);
    if (m < 0.999) pic += (1.0 - m) * tilePic(l, sA, fh);
    float bw = 0.03 + 0.04 * clamp(borderP, 0.0, 1.0);
    float e = min(min(l.x, 1.0 - l.x), min(l.y, 1.0 - l.y));
    float border = 1.0 - smoothstep(bw - px, bw + px, e);
    float grout = 1.0 - smoothstep(0.008 - px, 0.008 + px, e);
    vec3 col = mix(pic, famCol(fh, 0.3) * 0.5, border * 0.7);
    col = mix(col, vec3(0.04), grout);
    col = mix(mix(pic, famCol(fh, 0.3) * 0.5, 0.25) * 0.8, col, detail);
    float shineA = 0.03 * sceneTime + 0.4 * audioPhase;
    float shine = pow(max(cos(a - shineA), 0.0), 18.0) * (0.5 + 0.5 * sin(6.2831853 * (z + fly) * 0.3));
    col = col * 0.8 + vec3(luma(col) + 0.3) * shine * (0.3 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    col = mix(col, famCol(fh, 0.5) * 0.3, smoothstep(6.0, 18.0, z));
    col += famLight(fh, 0.5, 0.6) * exp(-r * 9.0) * 0.3;
    finish(col);
}
