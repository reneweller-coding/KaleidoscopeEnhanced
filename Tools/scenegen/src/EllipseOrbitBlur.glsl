//@doc
 * @brief ELLIPSE ORBIT BLUR: smearing on Kepler ellipses: a photo that circles itself, the eccentricity changing.  Nothing is drawn: every pixel integrates the photo over a path in time (an integral over an elliptic orbit), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioPhase      -> the orbit turns (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioPhase
//@body
/**  The path of the exposure: an ellipse.
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
    float e = 0.2 + 0.6 * (0.5 + 0.5 * sin(0.2 * t));
    vec2 o = vec2(cos(a) - e, sqrt(1.0 - e * e) * sin(a));
    return p + (0.08 + 0.18 * R) * L * rot2(0.15 * t) * o;
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
