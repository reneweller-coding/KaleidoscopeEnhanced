//@doc
 * @brief MEANDER CHANNEL PHOTO: the photo flowing through a meandering channel: its coordinates (along, across) lay the picture in loops, and in the middle it runs faster than at the bank.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the meander wave travels and the flow runs (integrated); audioSwell sets the bend's depth
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: the photo flowing through a meandering channel
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
    return vec2(1.0, 0.0);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.1 + 0.32 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    float bend = 0.12 + 0.12 * sw;
    float yc = bend * sin(2.6 * p.x - 0.15 * t);
    float n = p.y - yc;
    float u = max(1.0 - (n / 0.4) * (n / 0.4), 0.0);
    vec2 pp = vec2(p.x - (0.05 + 0.5 * u) * 0.2 * t, n * 1.2);
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
