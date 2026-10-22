//@doc
 * @brief PRISMATIC KALEIDO REFRACTION: a kaleidoscope whose mirrors are glass prisms: every reflection splits the
 * light a little, so each mirror line of the rosette carries a fine seam of spectral colour and the whole rosette
 * shimmers at its folds.  The three colour channels are folded from angles shifted apart by an amount that grows
 * with the sector's distance from the first (the bounces), so the channels agree inside each petal and part only
 * along its edges; there the seam shows.  The bulk keeps one colour family from the photo; only the seams are
 * spectral, and narrow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRolloff -> the dispersion (brighter music, wider seams)
 *   audioAdvance -> the rosette turns (integrated)
 *   audioSwell   -> the content glows
 *
 * Knobs: sidesP (the symmetry), pieceP (how much of the photo a petal shows), hueP.
//@params sidesP pieceP
//@audio audioRolloff audioSwell
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

/**  The rosette's content for an angle offset (one colour channel's fold).
 *
 * @param p      The point. (in)
 * @param off    The channel's angle offset. (in)
 * @param sides  The symmetry. (in)
 * @param sz     The content's scale. (in)
 * @param fh     The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 rosette(vec2 p, float off, float sides, float sz, float fh)
{
    float sec = 6.2831853 / sides;
    float th = atan(p.y, p.x) + off;
    float a = abs(mod(th, sec) - 0.5 * sec);
    vec2 k = length(p) * vec2(cos(a), sin(a));
    return tone(imgLod(k * sz + vec2(0.5, 0.42), 0.6), fh);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sides = floor(6.0 + 4.0 * clamp(sidesP, 0.0, 1.0));
    float sz = 0.35 + 0.35 * clamp(pieceP, 0.0, 1.0);
    float disp = 0.006 + 0.02 * clamp(audioRolloff, 0.0, 1.0);
    vec2 q = rot2(0.03 * sceneTime + 0.15 * audioAdvance) * p;
    // the dispersion grows with the bounces (the sector's distance round the circle)
    float sec = 6.2831853 / sides;
    float bounces = abs(floor(atan(q.y, q.x) / sec + 0.5));
    float sh = disp * (0.5 + bounces * 0.35);
    vec3 cR = rosette(q, sh, sides, sz, fh), cG = rosette(q, 0.0, sides, sz, fh), cB = rosette(q, -sh, sides, sz, fh);
    vec3 col = cG;
    float split = clamp(length(cR - cB) * 3.0, 0.0, 1.0);
    vec3 fringe = vec3(luma(cR), luma(cG), luma(cB)) * 1.2;
    col = mix(col, fringe, split * 0.5);
    col *= 0.9 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    finish(col);
}
