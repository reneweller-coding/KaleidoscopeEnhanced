//@doc
 * @brief PROJECTILE ARC EXPOSURE: thrown parabolas: the photo smeared along a family of throws whose slope wanders in time: the picture fans like sparks.  Nothing is drawn: every pixel integrates the photo over a path in time (an integral along parabolas), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioAdvance    -> the slope wanders (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioAdvance
//@body
/**  The path of the exposure: a parabola.
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
    float a = 0.8 * sin(0.2 * t);
    vec2 dir = vec2(cos(a), sin(a));
    return p + (0.15 + 0.25 * R) * L * (u * dir + 2.5 * (u * u - 0.08) * vec2(-dir.y, dir.x));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
