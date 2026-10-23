//@doc
 * @brief ZOOM BURST ROSE: a zoom exposure whose centre wanders along a rose curve: the photo explodes into rays of colour that turn with the centre.  Nothing is drawn: every pixel integrates the photo over a path in time (an integral over scales about a centre that runs on a rose curve), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioHarmAdvance -> the rose's petal count glides with the key (integrated); audioPhase runs the centre
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioHarmAdvance
//@body
/**  The path of the exposure: a zoom about the rose curve's moving point.
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
    float k = 3.0 + 2.5 * (0.5 - 0.5 * cos(0.3 * audioHarmAdvance));
    float th = 0.25 * t * 4.0;
    vec2 c = (0.15 + 0.25 * R) * cos(k * th) * vec2(cos(th), sin(th));
    return c + (p - c) * exp(0.9 * L * u);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
