//@doc
 * @brief CONVECTION ROLLS DYE: the photo as dye in Rayleigh-Benard convection rolls: it rises in the middle of the rolls and sinks at their edges, and the rolls swing to and fro.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the rolls' swing (integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: the photo as dye in Rayleigh-Benard convection rolls
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
    float k = 2.0;
    float xs = k * q.x + 0.8 * sin(0.3 * t);
    return 0.9 * vec2(sin(xs) * cos(k * q.y), -cos(xs) * sin(k * q.y));
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
