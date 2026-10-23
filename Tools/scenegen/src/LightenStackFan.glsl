//@doc
 * @brief LIGHTEN STACK FAN: a lighten stack over a fan of rays that circle a wandering origin: the photo becomes a sun-disc of lines.  Nothing is drawn: every pixel integrates the photo over a path in time (a lighten stack over a turn and zoom about a wandering origin), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioPhase      -> the origin circles (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioPhase
//@body
/**  The path of the exposure: a fan about the origin.
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
    vec2 c = (0.1 + 0.4 * R) * vec2(cos(0.3 * t), sin(0.4 * t));
    return c + rot2(0.9 * L * u) * ((p - c) * exp(0.7 * L * u));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 1, 1.5) * 1.05);
}
