//@doc
 * @brief DOUBLE KALEIDO INTERFERENCE: two kaleidoscopes laid over each other, one seven-fold and one eight-fold, each
 * from its own piece of the photo, added like two projectors on one screen: where the two rosettes agree they
 * brighten, where they cross they make quasi-periodic moire patterns of photo colour that neither shows alone.  The
 * two turn independently, so the moire never repeats.  The photo's own colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase   -> the seven-fold rosette turns (integrated)
 *   audioAdvance -> the eight-fold rosette turns the other way (integrated)
 *   audioBass    -> the seven-fold one's light; audioHigh the eight-fold one's
 *
 * Knobs: pieceP (how much of the photo each rosette shows), ringP (the rosettes' ring pattern), hueP.
//@params pieceP ringP
//@audio audioBass audioHigh
//@body
/**  The dihedral fold: a direction folded into one mirror sector of the given count.
 *
 * @param d      The point (centre at 0). (in)
 * @param sides  The number of mirrors. (in)
 *
 * @return
 *   The folded point.
 **/
vec2 kfold(vec2 d, float sides)
{
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    return length(d) * vec2(cos(a), sin(a));
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
    float sz = 0.3 + 0.3 * clamp(pieceP, 0.0, 1.0);
    float rings = 6.0 + 10.0 * clamp(ringP, 0.0, 1.0);
    float r = length(p);
    vec2 k7 = kfold(rot2(0.15 * audioPhase + 0.02 * sceneTime) * p, 7.0);
    vec2 k8 = kfold(rot2(-0.4 * audioAdvance - 0.015 * sceneTime) * p, 8.0);
    vec3 a = tone(imgLod(k7 * sz + vec2(0.3, 0.35), 0.7), fh);
    vec3 b = tone(imgB(k8 * sz + vec2(0.62, 0.55), 0.7), fh);
    // each rosette carries a ring pattern of its own; their product beats into moire
    float ra = 0.55 + 0.45 * cos(rings * 6.2831853 * k7.x * 0.3);
    float rb = 0.55 + 0.45 * cos(rings * 6.2831853 * k8.x * 0.3 + 1.0);
    vec3 col = a * ra * (0.5 + 0.6 * clamp(audioBass, 0.0, 1.0)) + b * rb * (0.5 + 0.6 * clamp(audioHigh, 0.0, 1.0));
    col *= 0.75;
    col += famLight(fh, 0.6, 0.6) * pow(ra * rb, 6.0) * 0.25 * smoothstep(1.2, 0.2, r);
    finish(col);
}
