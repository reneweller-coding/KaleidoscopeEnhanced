//@doc
 * @brief TILT SHIFT BAND SWEEP: a band of sharpness wandering over the photo; outside it the picture is smeared into fields of colour (the long exposure's vertical smear), so everything looks like a model.  Nothing is drawn: every pixel integrates the photo over a path in time (a vertical smear whose length grows with the distance from a band), so the picture is a long exposure of
 * the photo in its own colours, over the whole frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the exposure lengthens as the music swells
 *   audioPhase      -> the band wanders (integrated)
 *
 * Knobs: lengthP (the base length of the exposure), reachP (the path's reach or the pivot's wandering), hueP.
//@params lengthP reachP
//@audio audioSwell audioPhase
//@body
/**  The path of the exposure: a vertical smear growing away from the band.
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
    float yb = 0.3 * sin(0.2 * t);
    float d = abs(p.y - yb);
    return p + vec2(0.0, 0.3 * L * u * smoothstep(0.05 + 0.1 * R, 0.4, d));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    finish(expAccum(p, t, 0, 1.5) * 1.05);
}
