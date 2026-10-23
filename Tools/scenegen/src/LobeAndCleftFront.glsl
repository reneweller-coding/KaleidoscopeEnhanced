//@doc
 * @brief LOBE AND CLEFT FRONT: the front of a density current with its lobes and clefts, eddy tongues at its tip that split and form anew: the photo is eaten by such a front and remains behind it as marble in streaks.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the front advances (integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body
/**  The position of the front at a height.
 *
 * @param y  The height (screen units). (in)
 * @param t  The flow clock. (in)
 *
 * @return
 *   The front's x.
 **/
float lobeFront(float y, float t)
{
    return 0.5 * sin(0.12 * t) + 0.08 * sin(11.0 * y + 0.5 * t) + 0.05 * sin(23.0 * y - 0.8 * t);
}
/**  The flow: the front of a density current with its lobes and clefts, eddy tongues at its tip that split and form anew
 *
 * @param p   The place (screen units, y -0.5..0.5). (in)
 * @param t   The flow clock. (in)
 * @param ch  The channel (unused: all colours follow the same flow). (in)
 *
 * @return
 *   The velocity.
 **/
vec2 licVel(vec2 p, float t, int ch)
{
    vec2 q = p * (1.8 + 3.0 * clamp(scaleP, 0.0, 1.0));
    float xf = lobeFront(p.y, t) * (1.8 + 3.0 * clamp(scaleP, 0.0, 1.0));
    float d = q.x - xf;
    return vec2(-0.6 * tanh(5.0 * d), 0.5 * sin(8.0 * q.y + 2.0 * t) * exp(-d * d * 3.0));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.1 + 0.32 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    vec2 pp = p;
    len *= 0.35 + 1.3 * smoothstep(-0.05, 0.4, lobeFront(p.y, t) - p.x);
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
