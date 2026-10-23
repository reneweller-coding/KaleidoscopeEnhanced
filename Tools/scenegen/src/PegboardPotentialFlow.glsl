//@doc
 * @brief PEGBOARD POTENTIAL FLOW: a pegboard of cylinders through which the photo flows (potential flow with circulation round each): the streamlines bend round the pegs and the sense of each circulation changes smoothly.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioPhase      -> the circulations turn over (integrated); audioAdvance sets the stream's direction
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance audioPhase
//@body

/**  The flow: a pegboard of cylinders through which the photo flows (potential flow with circulation round each)
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
    vec2 v = vec2(cos(0.05 * t), sin(0.05 * t)) * 1.0;
    for (int j = 0; j < 2; ++j) {
        for (int i = 0; i < 3; ++i) {
            vec2 c = vec2(-1.3 + 1.3 * float(i), -0.6 + 1.2 * float(j));
            vec2 d = q - c;
            float r2 = dot(d, d) + 0.02;
            v += -0.09 * vec2(d.x * d.x - d.y * d.y, 2.0 * d.x * d.y) / (r2 * r2);
            v += 0.35 * sin(0.3 * t + 2.0 * float(i + 3 * j)) * vec2(-d.y, d.x) / r2;
        }
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
