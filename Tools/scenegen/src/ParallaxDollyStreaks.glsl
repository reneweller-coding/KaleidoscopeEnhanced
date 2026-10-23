//@doc
 * @brief PARALLAX DOLLY STREAKS: a dolly shot: the camera moves forward and what is bright in the photo (the brightness stands for nearness) smears more; the photo is crossed by rays running toward the middle.  Nothing is drawn: every pixel integrates the photo over a path in time (a zoom exposure whose speed depends on the pixel's brightness), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioAdvance    -> the dolly's pace (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioAdvance
//@body
/**  The path of the exposure: a zoom whose rate is the pixel's brightness.
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
    float d = luma(imgLod(p * 0.8 + 0.5, 3.0));
    return p * exp((0.2 + 1.2 * d) * 0.9 * L * u);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
