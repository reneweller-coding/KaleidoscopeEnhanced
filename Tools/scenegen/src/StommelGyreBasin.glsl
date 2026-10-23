//@doc
 * @brief STOMMEL GYRE BASIN: the Stommel gyre: an ocean basin with a western boundary current in which the photo becomes one large gyre, its stream narrow and fast at one rim and broad and slow elsewhere; the centre circles.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the gyre's centre circles (integrated); audioSwell sets the boundary current's strength
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: the Stommel gyre
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
    vec2 c = 0.08 * vec2(cos(0.2 * t), sin(0.17 * t));
    float X = clamp((q.x * 0.35 - c.x) * 0.5 + 0.5, 0.01, 1.0);
    float Y = (q.y * 0.45 - c.y) + 0.5;
    float del = 0.1 - 0.05 * clamp(audioSwell, 0.0, 1.0);
    float f = 1.0 - X - exp(-X / del);
    float fx = -1.0 + exp(-X / del) / del;
    return vec2(3.14159265 * cos(3.14159265 * Y) * f, -sin(3.14159265 * Y) * fx * 0.5) * 1.2;
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
