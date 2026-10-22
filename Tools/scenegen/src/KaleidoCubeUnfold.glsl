//@doc
 * @brief KALEIDO CUBE UNFOLD: a floor of cube nets -- crosses of six squares, which tile the plane -- each square a
 * kaleidoscope of the photo; with the phrase the four arms of every cross fold up toward a cube and open out again.
 * Seen from above, an arm folding up about its hinge is squeezed toward the hinge by the cosine of its angle and
 * shaded by it, while the square under it shows through; the crosses' centre squares stay flat.  The photo's own
 * colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the arms fold up and open once per phrase (continuous: a cosine of the phrase's progress)
 *   audioAdvance   -> the kaleidoscopes turn (integrated)
 *   audioSwell     -> how far the arms fold
 *
 * Knobs: sizeP (the squares' size), sidesP (the kaleidoscopes' symmetry), hueP.
//@params sizeP sidesP
//@audio audioPhrasePos audioSwell
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

/**  A square's kaleidoscope.
 *
 * @param f      The point in the square, -0.5..0.5. (in)
 * @param id     The square's own number. (in)
 * @param sides  The symmetry. (in)
 * @param rot    The turn. (in)
 * @param fh     The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 squareK(vec2 f, float id, float sides, float rot, float fh)
{
    float h = fract(sin(id * 12.9898) * 43758.5453);
    vec2 k = kfold(rot2(rot + 6.2831853 * h) * f, sides);
    return tone(imgLod(k * 0.6 + vec2(0.2 + 0.6 * h, 0.3 + 0.4 * fract(h * 3.7)), 0.7), fh);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.12 + 0.1 * clamp(sizeP, 0.0, 1.0);
    float sides = floor(4.0 + 4.0 * clamp(sidesP, 0.0, 1.0));
    float rot = 0.03 * sceneTime + 0.15 * audioAdvance;
    float fold = (0.5 - 0.5 * cos(6.2831853 * audioPhrasePos)) * (0.6 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float ang = 1.5707963 * fold;                                // the arms' angle up from the floor
    // the crosses tile the plane on the lattice (2, 1), (-1, 2) in squares; a cross is its centre square and four arms
    vec2 g = p / S;
    vec2 sq = floor(g + 0.5);
    vec2 f = g - sq;
    // which cross and which part: of the five candidates (this square as the centre or as one of four arms) the one
    // whose centre lies on the cross lattice (2, 1), (-1, 2)
    mat2 iB = inverse(mat2(2.0, 1.0, -1.0, 2.0));
    vec2 off = vec2(0.0);
    for (int k = 0; k < 5; ++k) {
        vec2 o = k == 0 ? vec2(0.0) : k == 1 ? vec2(1.0, 0.0) : k == 2 ? vec2(-1.0, 0.0) : k == 3 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
        vec2 l = iB * (sq - o);
        if (length(l - floor(l + 0.5)) < 0.01) off = o;
    }
    vec2 centre = sq - off;
    vec3 col;
    if (dot(off, off) < 0.5) {
        col = squareK(f, dot(centre, vec2(7.0, 13.0)), sides, rot, fh);
    } else {
        // an arm folding up about its hinge (the side toward the centre): seen from above, squeezed toward the hinge
        float along = dot(f, off) + 0.5;                         // 0 at the hinge, 1 at the free edge
        float c = cos(ang);
        if (along > c) {
            col = famCol(fh, 0.4) * 0.05;                        // the floor below the lifted arm
        } else {
            vec2 fu = f + off * (along / max(c, 0.05) - along);  // back into the arm's own square
            col = squareK(fu, dot(sq, vec2(7.0, 13.0)), sides, rot, fh) * (0.45 + 0.55 * c);
        }
    }
    // the squares' seams
    col *= smoothstep(0.5, 0.47, max(abs(f.x), abs(f.y)));
    finish(col);
}
