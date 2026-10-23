//@doc
 * @brief STUART VORTEX CHAIN: the exact solution for a chain of vortices in a shear layer (the stream function ln(cosh y + e cos x)): the photo rolls into Kelvin-Helmholtz billows that move to the right.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the billows travel (integrated); audioSwell sets e, the strength of the billows
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: the exact solution for a chain of vortices in a shear layer (the stream function ln(cosh y + e cos x))
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
    float eps = 0.25 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float x = q.x * 1.4 - 0.4 * t;
    float y = q.y * 1.4;
    float den = cosh(y) + eps * cos(x);
    return 1.2 * vec2(sinh(y), eps * sin(x)) / den;
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
