//@doc
 * @brief TAYLOR VORTEX STACK: Taylor-Couette flow: stacked vortex rings between two turning cylinders, seen in section as rolls that carry the photo alternately up and down; the rolls undulate.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioSpread     -> the rolls' number; audioAdvance their speed (integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance audioSpread
//@body

/**  The flow: Taylor-Couette flow
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
    float k = 3.0 + 4.0 * clamp(audioSpread, 0.0, 1.0);
    float wav = 0.3 * sin(2.0 * q.x - 0.4 * t);
    float X = q.x * 0.35 + 0.5;
    return 1.1 * vec2(k * cos(k * q.y + wav) * sin(3.14159265 * X), -3.14159265 * 0.35 * sin(k * q.y + wav) * cos(3.14159265 * X) * 0.5);
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
