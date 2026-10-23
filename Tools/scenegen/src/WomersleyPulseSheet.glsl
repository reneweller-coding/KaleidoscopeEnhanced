//@doc
 * @brief WOMERSLEY PULSE SHEET: pulsating pipe flow: the photo is pushed back and forth in parabolic layers, the layers lagging behind the beat of the pulse: sheets of the photo sliding on one another.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioBarPhase   -> the pulse, the bar's own phase (continuous, no jump)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioBarPhase
//@body

/**  The flow: pulsating pipe flow
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
    return vec2(1.0 - 4.0 * p.y * p.y, 0.0) * (0.5 + 0.5 * sin(6.2831853 * audioBarPhase));
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.1 + 0.32 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    float yy = p.y;
    float lag = 3.0 * (0.5 - abs(yy));
    float amp = 0.09 * (1.0 - 4.0 * yy * yy) * (0.4 + 0.9 * sw);
    vec2 pp = p + vec2(amp * sin(6.2831853 * audioBarPhase - lag), 0.0);
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
