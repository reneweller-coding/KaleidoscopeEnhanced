//@doc
 * @brief SADDLE STRETCH FOLDS: a hyperbolic stagnation point stretches the photo along one direction and squeezes it along the other; the axes turn slowly and the filaments never break: the picture is drawn into threads.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioPhase      -> the axes turn (integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioPhase
//@body

/**  The flow: a hyperbolic stagnation point stretches the photo along one direction and squeezes it along the other; the axes turn slowly and the filaments never break
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
    float th = 0.15 * t;
    float c = cos(2.0 * th), s = sin(2.0 * th);
    return 1.5 * vec2(c * q.x + s * q.y, s * q.x - c * q.y);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.1 + 0.32 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    float th = 0.15 * t;
    float s = (0.35 + 0.5 * sw) * sin(0.25 * t);
    vec2 pp = rot2(th) * (vec2(exp(s), exp(-s)) * (rot2(-th) * p));
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
