//@doc
 * @brief OVERTURNING WAVE FOLD: a wave that breaks: the Lagrangian coordinates of a Gerstner trochoid driven up to the point of breaking, so the photo lies in a breaking edge that runs through every part of the picture, its colours turning over with it.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the wave runs (integrated); audioSwell sets its steepness
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: a wave that breaks
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
    return vec2(1.0, 0.0);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.1 + 0.32 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    float k = 4.5;
    float eps = 0.55 + 0.4 * sw;
    float ph = 0.25 * t;
    vec2 a = p * 1.1;
    for (int i = 0; i < 6; ++i) {
        float e = exp(k * a.y * 0.3) * eps / k;
        a = vec2(p.x * 1.1 - e * sin(k * a.x - ph), p.y * 1.1 + e * cos(k * a.x - ph));
    }
    vec2 pp = a / 1.1;
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
