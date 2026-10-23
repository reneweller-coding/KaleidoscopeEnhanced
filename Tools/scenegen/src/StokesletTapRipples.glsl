//@doc
 * @brief STOKESLET TAP RIPPLES: point forces (Stokeslets) tapping a viscous surface: the photo swings after in vortex pairs, each tap wrapped by a vortex ring.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the taps' pulses (soft, integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: point forces (Stokeslets) tapping a viscous surface
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
    vec2 v = vec2(0.0);
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        vec2 c = 0.7 * vec2(cos(1.7 * fi + 0.2 * sin(0.1 * t)), sin(2.3 * fi));
        float a = 1.3 * fi + 0.2 * t;
        float pulse = pow(max(0.0, sin(0.7 * t + 1.9 * fi)), 2.0);
        vec2 f = vec2(cos(a), sin(a)) * pulse;
        vec2 d = q - c;
        float r = length(d) + 0.1;
        v += (f / r + d * dot(d, f) / (r * r * r)) * 0.15;
    }
    return v + 0.05 * vec2(cos(0.1 * t), sin(0.1 * t));
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
