//@doc
 * @brief VORONOI SPIN BLUR: the surface divided into cells, in each one the photo smeared by a turn about the cell's own centre: fields of whirls of photo that interlock at the cell borders.  Nothing is drawn: every pixel integrates the photo over a path in time (a turn about the centre of the pixel's Voronoi cell), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioPhase      -> the cells' turns (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioPhase
//@body
/**  The path of the exposure: a turn about the Voronoi cell's centre.
 *
 * @param p  The pixel's place. (in)
 * @param u  The point on the path, -0.5..0.5. (in)
 * @param t  The clock. (in)
 *
 * @return
 *   The place to read.
 **/
vec2 expPath(vec2 p, float u, float t)
{
    float L = (0.45 + 0.9 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    float R = 0.1 + 0.6 * clamp(reachP, 0.0, 1.0);
    vec2 q = p * (3.0 + 3.0 * R / 0.7);
    vec2 g = floor(q);
    float best = 9.0;
    vec2 c = vec2(0.0);
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 cg = g + vec2(float(i), float(j));
            vec2 pt = cg + 0.15 + 0.7 * hash22(cg);
            float d = dot(q - pt, q - pt);
            if (d < best) { best = d; c = pt; }
        }
    }
    c /= (3.0 + 3.0 * R / 0.7);
    return c + rot2(1.4 * L * u) * (p - c);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
