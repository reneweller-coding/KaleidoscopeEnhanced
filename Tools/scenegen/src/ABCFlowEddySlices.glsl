//@doc
 * @brief ABC FLOW EDDY SLICES: slices through the Arnold-Beltrami-Childress flow: cells of eddies with chaotic borders in which the photo is twisted.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioHarmAdvance -> the flow's three constants A, B, C wander with the harmony (integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance audioHarmAdvance
//@body

/**  The flow: slices through the Arnold-Beltrami-Childress flow
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
    float h = audioHarmAdvance;
    float A = 1.0 + 0.3 * sin(0.5 * h), B = 0.8165 + 0.3 * sin(0.4 * h + 1.0), C = 0.5774 + 0.3 * sin(0.3 * h + 2.0);
    vec3 x = vec3(q * 1.2, 1.0 * sin(0.15 * t));
    return vec2(A * sin(x.z) + C * cos(x.y), B * sin(x.x) + A * cos(x.z));
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
