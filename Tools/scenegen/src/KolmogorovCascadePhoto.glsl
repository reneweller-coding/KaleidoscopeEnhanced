//@doc
 * @brief KOLMOGOROV CASCADE PHOTO: a field of eddies of all sizes with a Kolmogorov spectrum (k to the minus five thirds) carrying the photo: large eddies fold the picture, small ones sow it with fine whirls.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioSpread     -> the steepness of the spectrum (the hi-hat feeds the small eddies); audioSwell sets the total energy
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance audioSpread
//@body

/**  The flow: a field of eddies of all sizes with a Kolmogorov spectrum (k to the minus five thirds) carrying the photo
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
    float hi = 0.3 + 0.7 * clamp(audioSpread, 0.0, 1.0);
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        float kk = exp2(0.5 * fi) * 0.8;
        float a = 2.399 * fi;
        vec2 kd = vec2(cos(a), sin(a));
        float amp = pow(kk, -0.833) * (i >= 5 ? hi : 1.0);
        v += amp * vec2(-kd.y, kd.x) * cos(kk * dot(kd, q) + 1.7 * fi + (0.2 + 0.06 * fi) * t);
    }
    return v * 0.7;
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
