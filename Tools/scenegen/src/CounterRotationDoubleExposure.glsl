//@doc
 * @brief COUNTER ROTATION DOUBLE EXPOSURE: two spin exposures in opposite senses about different pivots, added: crosses of rays and rosettes of strands.  Nothing is drawn: every pixel integrates the photo over a path in time (two turns, one each way, about two pivots), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioPhase      -> the pivots circle (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioPhase
//@body
/**  The path of the exposure: a turn about one pivot for the first half, about the other, the other way, for the second.
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
    vec2 c1 = 0.3 * vec2(cos(0.3 * t), sin(0.3 * t)), c2 = -c1;
    return u < 0.0 ? c1 + rot2(-1.6 * L * u * 2.0) * (p - c1) : c2 + rot2(1.6 * L * u * 2.0) * (p - c2);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
