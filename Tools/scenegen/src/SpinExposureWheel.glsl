//@doc
 * @brief SPIN EXPOSURE WHEEL: a spin exposure about a wandering pivot: the photo smears into wheel hubs and spokes, the pivots circling.  Nothing is drawn: every pixel integrates the photo over a path in time (an integral over the angle 0 to phi about a wandering pivot), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioMelodyPitch -> the pivot follows the melody (smoothed); audioPhase runs it
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioMelodyPitch
//@body
/**  The path of the exposure: a turn about the pivot.
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
    vec2 c = (0.1 + 0.3 * R) * vec2(sin(0.4 * t) + 0.5 * (clamp(audioMelodyPitch, 0.0, 1.0) - 0.5), cos(0.31 * t));
    return c + rot2(1.6 * L * u) * (p - c);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
