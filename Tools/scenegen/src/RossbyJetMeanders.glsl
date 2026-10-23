//@doc
 * @brief ROSSBY JET MEANDERS: a jet stream with travelling Rossby waves: the photo meanders in bands that pinch off and become eddies.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the waves travel (integrated); audioSwell sets their amplitude
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: a jet stream with travelling Rossby waves
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
    float k = 3.0;
    float amp = 0.15 + 0.25 * clamp(audioSwell, 0.0, 1.0);
    float eta = amp * sin(k * q.x * 0.5 - 0.5 * t) + 0.4 * amp * sin(2.3 * k * q.x * 0.5 + 0.9 * t);
    float etax = amp * 0.5 * k * cos(k * q.x * 0.5 - 0.5 * t) + 0.4 * amp * 1.15 * k * cos(2.3 * k * q.x * 0.5 + 0.9 * t);
    float s = (q.y * 0.5 - eta) / 0.22;
    float sech2 = 1.0 / (cosh(s) * cosh(s));
    return sech2 * vec2(1.0, etax * 0.5) * 1.1 + 0.2 * tanh(s) * vec2(0.0, 0.5);
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
