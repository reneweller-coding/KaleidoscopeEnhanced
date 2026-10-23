//@doc
 * @brief HARMONOGRAPH EXPOSURE: an exposure along the damped path of a harmonograph (two pendulums): rosettes of traces.  Nothing is drawn: every pixel integrates the photo over a path in time (an integral over a damped Lissajous path), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioHarmAdvance -> the pendulums' frequencies follow the harmony (simple ratios glide)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioHarmAdvance
//@body
/**  The path of the exposure: a damped Lissajous curve.
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
    float a = 6.2831853 * (u + 0.5) * 2.0;
    float damp = exp(-1.2 * (u + 0.5));
    float f2 = 1.5 + 0.5 * sin(0.25 * audioHarmAdvance);
    return p + (0.1 + 0.25 * R) * L * damp * vec2(sin(2.0 * a + 0.3 * t), sin(2.0 * f2 * a + 1.0));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
