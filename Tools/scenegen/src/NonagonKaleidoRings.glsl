//@doc
 * @brief NONAGON KALEIDO RINGS: concentric rings of kaleidoscope with unusual symmetries -- nine, eleven, thirteen
 * and fifteen mirrors -- each ring turning on its own, each cut from its own part of the photo, the rings' borders
 * soft, the innermost a small seven-fold heart.  Odd mirror counts make petals that never line up with the next ring,
 * so the rings slide past each other like the gears of an astrolabe.  The photo's own colours, calmed toward one
 * colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> each ring listens to its own band: its light follows that band's level
 *   audioAdvance      -> the rings turn, the odd ones one way and the even ones the other (integrated)
 *
 * Knobs: ringP (the rings' width), pieceP (how much of the photo a petal shows), hueP.  Distinct from
 * SymmetryBreathing, which breathes between 3 and 12.
//@params ringP pieceP
//@audio audioSpectrum[32]
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
    float W = 0.13 + 0.07 * clamp(ringP, 0.0, 1.0);
    float sz = 0.4 + 0.5 * clamp(pieceP, 0.0, 1.0);
    float turn = 0.04 * sceneTime + 0.2 * audioAdvance;
    float r = length(p);
    float rr = r / W;
    float k = floor(rr);
    float fr = rr - k;
    vec3 col = vec3(0.0);
    // the ring and its neighbour, blended over the soft border
    for (int j = 0; j < 2; ++j) {
        float ring = k + float(j) - (fr < 0.5 ? 1.0 : 0.0);
        float w = 1.0 - smoothstep(0.0, 0.5, abs(rr - (ring + 0.5)) - 0.25);
        if (ring < 0.0 || w <= 0.0) continue;
        float sides = ring < 0.5 ? 7.0 : 9.0 + 2.0 * mod(ring - 1.0, 4.0);
        float dir = mod(ring, 2.0) > 0.5 ? -1.0 : 1.0;
        vec2 q = kfold(rot2(dir * turn * (0.5 + 0.1 * ring) + ring) * p, sides);
        vec2 uv = q / (W * 2.5) * sz * 0.5 + vec2(0.3 + 0.08 * ring, 0.4 + 0.05 * sin(ring));
        float band = audioSpectrum[int(mod(3.0 + 4.0 * ring, 30.0))];
        col += w * tone(imgLod(uv, 0.7), fh) * (0.6 + 0.8 * clamp(band, 0.0, 1.0));
    }
    col *= smoothstep(1.4, 0.9, r * 0.9);
    finish(col);
}
