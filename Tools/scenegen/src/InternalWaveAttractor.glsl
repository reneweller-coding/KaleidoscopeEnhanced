//@doc
 * @brief INTERNAL WAVE ATTRACTOR: beams of internal waves bouncing in a trapezoid and gathering on a limit cycle: the photo is moved along the beams.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioSpread     -> the beams' breadth; audioAdvance sets the frequency
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance audioSpread
//@body

/**  The flow: beams of internal waves bouncing in a trapezoid and gathering on a limit cycle
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
    float w = 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    for (int j = 0; j < 4; ++j) {
        vec2 k = vec2((j & 1) == 0 ? 1.0 : -1.0, (j & 2) == 0 ? 1.0 : -1.0) * (1.2 + 0.4 * float(j / 2)) * w;
        v += vec2(-k.y, k.x) * cos(dot(k, q) - 0.5 * t * (1.0 + 0.1 * float(j)) + 1.3 * float(j)) * 0.5;
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
