//@doc
 * @brief LOG SPIRAL EXPOSURE: an exposure along a logarithmic spiral (turning and zooming at once): a whirl of strands that stream into the centre and run out into colour there.  Nothing is drawn: every pixel integrates the photo over a path in time (a turn and a zoom together about the centre), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioHarmAdvance -> the spiral's angle changes with the harmony (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioHarmAdvance
//@body
/**  The path of the exposure: a logarithmic spiral about the centre.
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
    float a = 1.0 + 0.8 * sin(0.3 * audioHarmAdvance) + 0.6 * R;
    return rot2(a * L * u) * (p * exp(0.6 * L * u));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
