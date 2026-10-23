//@doc
 * @brief PAN TRACK STREAK: tracking a subject: one place (the brightest) stays sharp while everything else is drawn into horizontal streaks that grow away from the subject; the subject wanders.  Nothing is drawn: every pixel integrates the photo over a path in time (a horizontal smear whose length grows with the distance from a tracked point), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioMelodyPitch -> the tracked point follows the melody (smoothed)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioMelodyPitch
//@body
/**  The path of the exposure: a horizontal smear whose length grows with the distance from the subject.
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
    vec2 c = vec2(0.5 * sin(0.2 * t) + 0.3 * (clamp(audioMelodyPitch, 0.0, 1.0) - 0.5), 0.2 * cos(0.3 * t));
    float d = length(vec2(p.x - c.x, 0.5 * (p.y - c.y)));
    return p + vec2(0.45 * L * u * smoothstep(0.0, 0.5, d), 0.0);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
