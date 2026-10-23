//@doc
 * @brief KEPLER SHEAR SPIRAL: differential rotation as in a disc of stars (angular speed falling as r to the minus three halves): the photo is wound into a spiral of arms that coil ever tighter; two phases are cross-faded so the winding can start over without a jump.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the winding (integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: differential rotation as in a disc of stars (angular speed falling as r to the minus three halves)
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
    float r = max(length(p), 0.05);
    return vec2(-p.y, p.x) / r * 0.8 / pow(r + 0.1, 0.5);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.1 + 0.32 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    vec2 pp = p;
    float r = max(length(p), 0.05);
    float w = 0.5 / pow(r + 0.1, 1.5);
    float a = fract(t / 40.0), b = fract(t / 40.0 + 0.5);
    float wa = sin(3.14159265 * a) * sin(3.14159265 * a), wb = sin(3.14159265 * b) * sin(3.14159265 * b);
    vec3 colA = licSmear(rot2(w * a * 40.0 * 0.05) * p, t, len, 0);
    vec3 colB = licSmear(rot2(w * b * 40.0 * 0.05) * p, t, len, 0);
    vec3 col = colA * wa + colB * wb;
    finish(col * 1.05);
    return;
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
