//@doc
 * @brief PHOTO STAR TRAILS: the star trails of the photo: a lighten stack over arcs about a celestial pole: the bright places pull sharp arcs and the dark stays ground.  Nothing is drawn: every pixel integrates the photo over a path in time (a lighten stack over circular arcs about a pole), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioAdvance    -> the pole wanders with the flight (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioAdvance
//@body
/**  The path of the exposure: an arc about the pole.
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
    vec2 pole = vec2(0.3 * sin(0.05 * t * 3.0), -0.55 - 0.5 * R) + 0.1 * vec2(cos(0.2 * t), 0.0);
    return pole + rot2(0.5 * L * u) * (p - pole);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 1, 1.5) * 1.05);
}
