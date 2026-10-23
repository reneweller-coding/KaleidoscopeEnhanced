//@doc
 * @brief LISSAJOUS SHIFT TRAILS: comet tails: the photo shifted along a Lissajous curve and averaged with a falling weight: every bright place trails a ribbon.  Nothing is drawn: every pixel integrates the photo over a path in time (an integral with a comet's weights along a Lissajous curve), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioHarmAdvance -> the frequency ratio follows the key (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioHarmAdvance
//@body
/**  The path of the exposure: a Lissajous curve.
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
    float a = 6.2831853 * (u + 0.5);
    float ratio = 1.5 + 0.5 * sin(0.3 * audioHarmAdvance);
    return p + (0.1 + 0.2 * R) * L * vec2(sin(3.0 * a + 0.3 * t), sin(3.0 * ratio * a));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 2, 1.5) * 1.05);
}
