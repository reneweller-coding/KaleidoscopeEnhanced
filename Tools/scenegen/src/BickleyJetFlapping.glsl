//@doc
 * @brief BICKLEY JET FLAPPING: a plane Bickley jet with a sinuous instability: the photo meanders in a band that flaps, rolls up and sheds eddies at its edges.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the flapping wave runs (integrated); audioSwell sets its amplitude
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: a plane Bickley jet with a sinuous instability
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
    float eps = 0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float k = 1.8;
    float s = 1.0 / cosh(q.y * 1.3);
    float s2 = s * s;
    float ph = k * q.x - 0.5 * t;
    return vec2(s2 - eps * 2.0 * s2 * tanh(q.y * 1.3) * cos(ph), eps * k * s2 * sin(ph)) * 1.2;
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
