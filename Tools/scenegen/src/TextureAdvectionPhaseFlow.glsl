//@doc
 * @brief TEXTURE ADVECTION PHASE FLOW: texture advection: a texture is pushed along a field, with two phases cross-faded so that it does not become distorted; the photo is pushed through a vortex field as two copies in opposite phase, and the cross-fade is seen as a pulsing.  Each copy is traced back along the
 * flow for a time that runs from zero to the cycle length and then restarts; the weights are triangular, so the sum is smooth.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the flow runs (the field's speed) (integrated)
 *   audioPhrasePos -> the cross-fade period (one cycle per phrase) (periodic)
 *
 * Knobs: sizeP (the strength of the flow), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
/**  The velocity of the vortex field: the rotated gradient of a noise.
 *
 * @param p  The point. (in)
 * @param t  The time. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 flowAt(vec2 p, float t)
{
    float e = 0.01;
    float a = fbm(p * 1.6 + vec2(0.0, 0.0) + 0.02 * t);
    float ay = fbm((p + vec2(0.0, e)) * 1.6 + 0.02 * t);
    float ax = fbm((p + vec2(e, 0.0)) * 1.6 + 0.02 * t);
    return vec2(ay - a, -(ax - a)) / e;
}
/**  A point traced back along the flow for a time tau.
 *
 * @param p  The point. (in)
 * @param tau  The time to trace back. (in)
 * @param t  The time. (in)
 *
 * @return
 *   The earlier place.
 **/
vec2 trace(vec2 p, float tau, float t)
{
    vec2 q = p;
    for (int i = 0; i < 6; ++i) {
        q -= flowAt(q, t) * tau / 6.0;
    }
    return q;
}
void main()
{
    vec2 p = screenP();
    float T = (0.08 + 0.2 * clamp(sizeP, 0.0, 1.0)) * 3.0;
    float t = 0.5 * audioAdvance + 0.6 * sceneTime;
    float ph = fract(audioPhrasePos * 4.0);
    float w0 = 1.0 - abs(2.0 * ph - 1.0);
    float w1 = 1.0 - w0;
    vec2 q0 = trace(p, ph * T, t);
    vec2 q1 = trace(p, fract(ph + 0.5) * T, t);
    vec3 c0 = imgLod(q0 * 0.85 + 0.5, 0.6);
    vec3 c1 = imgLod(q1 * 0.85 + 0.5, 0.6);
    vec3 col = mix(c1, c0, w0 * w0 * (3.0 - 2.0 * w0));
    finish(col * 1.1);
}
