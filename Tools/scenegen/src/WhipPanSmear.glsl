//@doc
 * @brief WHIP PAN SMEAR: a pan so fast that only strokes are left: with each bar the camera draws the photo across the frame and the streaks run out as it stops (a soft pulse, never a jolt).  Nothing is drawn: every pixel integrates the photo over a path in time (a horizontal smear whose length pulses with the bar), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioBarPhase   -> the pulse (the bar's own phase, continuous)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioBarPhase
//@body
/**  The path of the exposure: a horizontal smear pulsing with the bar.
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
    float pulse = exp(-pow((fract(audioBarPhase + 0.1) - 0.15) / 0.18, 2.0));
    return p + vec2((0.1 + 0.8 * pulse) * 0.45 * L * u, 0.0);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
