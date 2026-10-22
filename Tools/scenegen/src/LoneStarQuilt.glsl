//@doc
 * @brief LONE STAR QUILT: the eight-pointed star of a Lone Star quilt: each of its eight points a large diamond pieced
 * from rows of small diamonds, every small diamond a piece of the photo, the rings of pieces shaded from the middle
 * outward -- and the shading flows outward in waves with the music, ring after ring, while the background blocks
 * between the points hold the photo dimmed.  The star is folded into eighths; in a point the place is written in the
 * diamond's two edge directions (0 and 45 degrees), so the small diamonds are the whole-number cells of those two
 * coordinates and a piece's ring is the sum of its two indices.  The pieces' colours are the photo's, calmed into one
 * colour family and shaded by their ring.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the shading flows outward ring after ring (integrated: with the music's drive)
 *   audioSwell   -> the seams' glow
 *
 * Knobs: pieceP (how many pieces along a point's edge), sizeP (the star's size), hueP.
//@params pieceP sizeP
//@audio audioSwell
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float M = floor(6.0 + 4.0 * clamp(pieceP, 0.0, 1.0));
    float L = 0.36 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float run = 0.2 * sceneTime + 0.8 * audioAdvance;
    float seamGlow = 0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    const float SEC = 0.7853982;
    float th = atan(p.y, p.x);
    float k = floor(th / SEC);
    vec2 q = rot2(k * SEC) * p;                                       // into the point between 0 and 45 degrees
    const float C45 = 0.7071068;
    float b = q.y / C45, a = q.x - b * C45;                            // the diamond's two edge coordinates
    float s = L / M;
    vec2 ij = floor(vec2(a, b) / s);
    vec2 f = fract(vec2(a, b) / s);
    float inStar = step(0.0, a) * step(0.0, b) * step(a, L) * step(b, L);
    float ring = ij.x + ij.y;
    float wave = 0.5 + 0.5 * cos(6.2831853 * (ring / 6.0 - run * 0.3));
    vec2 centre = rot2(-k * SEC) * (vec2((ij.x + 0.5) * s + (ij.y + 0.5) * s * C45, (ij.y + 0.5) * s * C45));
    vec3 piece = tone(imgLod(centre * 0.6 + 0.5 + (f - 0.5) * s * 0.4, 1.5), fh);
    piece *= 0.45 + 0.75 * wave;
    float seam = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float line = exp(-pow(seam / 0.05, 2.0));
    vec3 star = mix(piece, famLight(fh, 0.6, 0.7) * seamGlow, line * 0.6);
    // the background blocks between the points
    vec2 bq = fract(p / (L * 0.5)) - 0.5;
    float bseam = exp(-pow((0.5 - max(abs(bq.x), abs(bq.y))) / 0.02, 2.0));
    vec3 back = tone(imgLod(p * 0.5 + 0.5, 3.0), fh) * 0.25 + famLight(fh, 0.4, 0.4) * bseam * 0.1;
    vec3 col = mix(back, star, inStar);
    finish(col);
}
