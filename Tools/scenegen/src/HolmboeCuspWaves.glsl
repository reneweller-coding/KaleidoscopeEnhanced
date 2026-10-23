//@doc
 * @brief HOLMBOE CUSP WAVES: Holmboe waves in a shear layer with its own density interface: two trains of waves with sharp crests running against each other, between which the photo is drawn into cusps that do not roll up but shoot upward.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the waves' travel (integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: Holmboe waves in a shear layer with its own density interface
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
    float up = q.y > 0.0 ? 1.0 : -1.0;
    float ph = 3.0 * q.x - up * 0.8 * t;
    float cusp = 1.0 - abs(sin(0.5 * ph)) * 2.0;
    return vec2(tanh(5.0 * q.y), 0.5 * cusp * exp(-q.y * q.y * 2.0) * (0.5 + clamp(audioSwell, 0.0, 1.0)));
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
