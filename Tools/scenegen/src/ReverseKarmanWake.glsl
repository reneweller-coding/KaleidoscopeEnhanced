//@doc
 * @brief REVERSE KARMAN WAKE: a reversed Karman street, as the tail of a fish leaves it: the photo becomes a jet of vortices zigzagging away from a fin.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the fin's beat (the stream's pace, integrated); audioSwell sets the swing
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: a reversed Karman street, as the tail of a fish leaves it
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
    float jet = 0.5 + 0.7 * exp(-q.y * q.y * 3.0);
    vec2 v = vec2(jet, 0.0);
    float d = 1.1;
    float sw = 0.18 + 0.1 * clamp(audioSwell, 0.0, 1.0);
    for (int i = -2; i <= 2; ++i) {
        float x0 = (float(i) + fract(0.06 * t)) * d;
        vec2 a = q - vec2(x0, sw), b = q - vec2(x0 + 0.5 * d, -sw);
        v += -vec2(-a.y, a.x) / (dot(a, a) + 0.05) * 0.3 + vec2(-b.y, b.x) / (dot(b, b) + 0.05) * 0.3;
    }
    return v;
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
