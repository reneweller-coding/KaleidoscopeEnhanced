//@doc
 * @brief AMPHIDROMIC TIDE SWIRL: the tides turning round amphidromic points where the range is nil: the photo is pushed round several centres in wave crests that run like clock hands.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioPhase      -> the tide's phase (integrated); audioSwell sets the number of centres' reach
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioPhase
//@body

/**  The flow: the tides turning round amphidromic points where the range is nil
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
    for (int j = 0; j < 3; ++j) {
        vec2 c = 0.55 * vec2(cos(2.1 * float(j) + 0.1 * t), sin(2.1 * float(j)));
        vec2 d = q - c * (1.8 + 3.0 * clamp(scaleP, 0.0, 1.0)) * 0.5;
        v += vec2(-d.y, d.x) / (dot(d, d) + 0.1) * (j == 1 ? -1.0 : 1.0);
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
    for (int j = 0; j < 3; ++j) {
        vec2 c = 0.45 * vec2(cos(2.1 * float(j) + 0.1 * t), sin(2.1 * float(j)));
        vec2 d = p - c;
        float r = length(d);
        float th = atan(d.y, d.x);
        pp += (0.03 + 0.06 * sw) * r * exp(-r * 2.5) * 6.0 * vec2(cos(th - 0.6 * t + 2.0 * float(j)), sin(th - 0.6 * t + 2.0 * float(j)));
    }
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
