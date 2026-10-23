//@doc
 * @brief THREE HAND EXPOSURE: three hands turning at the pace of hours, minutes and seconds, the photo exposed over all three paths: a clock of rays that never stands the same way twice.  Nothing is drawn: every pixel integrates the photo over a path in time (the sum of three circular offsets of different frequencies), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioHarmAdvance -> the ratios 1:12:720 glide to simple ratios with the harmony
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioHarmAdvance
//@body
/**  The path of the exposure: three circles of different frequencies.
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
    float g = 0.5 - 0.5 * cos(0.25 * audioHarmAdvance);
    float f2 = mix(12.0, 3.0, g), f3 = mix(60.0, 5.0, g);
    float a = 6.2831853 * (u + 0.5);
    return p + (0.1 + 0.2 * R) * L * (0.6 * vec2(cos(a), sin(a)) + 0.3 * vec2(cos(f2 * a + t * 0.3), sin(f2 * a)) + 0.12 * vec2(cos(f3 * a), sin(f3 * a + 1.0)));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
