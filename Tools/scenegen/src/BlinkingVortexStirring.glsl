//@doc
 * @brief BLINKING VORTEX STIRRING: two vortices that blink on and off in turn, softly, stirring the photo chaotically: streaks, spirals and veils.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the blinking runs on (integrated, always as a soft wave)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: two vortices that blink on and off in turn, softly, stirring the photo chaotically
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
    float s = 0.5 + 0.5 * sin(0.5 * t);
    float g1 = smoothstep(0.1, 0.9, s), g2 = 1.0 - g1;
    vec2 a = q - vec2(0.35, 0.0), b = q + vec2(0.35, 0.0);
    return (0.5 + clamp(audioSwell, 0.0, 1.0)) * (g1 * vec2(-a.y, a.x) / (dot(a, a) + 0.04) - g2 * vec2(-b.y, b.x) / (dot(b, b) + 0.04));
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
