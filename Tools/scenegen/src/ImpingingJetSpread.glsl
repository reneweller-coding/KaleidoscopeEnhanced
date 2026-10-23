//@doc
 * @brief IMPINGING JET SPREAD: a jet that strikes a wall and spreads as a wall jet with vortex rings that detach from its edge: the photo streams from the middle outward.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the rings run outward (integrated); audioSwell sets the jet's strength
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: a jet that strikes a wall and spreads as a wall jet with vortex rings that detach from its edge
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
    float sg = q.x < 0.0 ? -1.0 : 1.0;
    float ax = abs(q.x);
    float ring = sin(6.0 * ax - 0.8 * t);
    vec2 v = vec2(sg * (0.7 * (1.0 - exp(-ax * 3.0)) / (1.0 + ax) + 0.3 * ring * exp(-ax * 0.5)), -0.5 * exp(-q.x * q.x * 3.0) * (0.5 + 0.5 * cos(2.0 * q.y)) + 0.2 * ring * exp(-q.x * q.x));
    return v * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.1 + 0.32 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    vec2 pp = p;
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
