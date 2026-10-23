//@doc
 * @brief KARMAN SILK STREAKS: the photo smeared along the streamlines of a Karman vortex street: silky strands that peel off a row of cylinders and roll up into a street of vortices.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the vortices drift downstream (integrated); the spacing follows the tempo of the flow
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: the photo smeared along the streamlines of a Karman vortex street
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
    vec2 v = vec2(0.8, 0.0);
    float d = 1.2;
    for (int i = -2; i <= 2; ++i) {
        float x0 = (float(i) + fract(0.05 * t)) * d;
        vec2 a = q - vec2(x0, 0.25), b = q - vec2(x0 + 0.5 * d, -0.25);
        v += vec2(-a.y, a.x) / (dot(a, a) + 0.05) * 0.3 - vec2(-b.y, b.x) / (dot(b, b) + 0.05) * 0.3;
    }
    return v;
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
