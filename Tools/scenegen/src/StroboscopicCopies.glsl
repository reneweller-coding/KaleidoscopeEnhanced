//@doc
 * @brief STROBOSCOPIC COPIES: a stroboscope exposure as Muybridge made them: twelve copies of the photo along a looping path, each fainter than the last.  Nothing is drawn: every pixel integrates the photo over a path in time (twelve discrete copies along a loop (the sixteen readings fall on them)), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioAdvance    -> the loop runs (integrated); the spacing follows the tempo of the flow
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioAdvance
//@body
/**  The path of the exposure: a loop sampled at twelve places.
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
    float k = floor((u + 0.5) * 11.999);
    float a = 6.2831853 * k / 12.0 + 0.1 * t;
    return p + (0.1 + 0.2 * R) * L * vec2(sin(a), 0.6 * sin(2.0 * a));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 2, 1.5) * 1.05);
}
