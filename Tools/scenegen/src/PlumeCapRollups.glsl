//@doc
 * @brief PLUME CAP ROLLUPS: rising thermals with mushroom caps: the photo climbs in plumes whose caps roll up at the top and are overtaken by new ones.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the plumes rise (integrated); audioSwell sets how many plumes
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: rising thermals with mushroom caps
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
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        float x0 = (fi - 1.5) * 0.9;
        float ph = fract(0.04 * t + 0.25 * fi);
        float yc = -1.1 + 2.2 * ph;
        float w = exp(-pow((q.x - x0) / 0.25, 2.0)) * smoothstep(yc + 0.1, yc - 0.6, q.y) * smoothstep(-1.2, -0.7, q.y);
        v += vec2(0.0, 1.0) * w;
        vec2 a = q - vec2(x0 + 0.22, yc), b = q - vec2(x0 - 0.22, yc);
        v += 0.35 * (vec2(-a.y, a.x) / (dot(a, a) + 0.04) - vec2(-b.y, b.x) / (dot(b, b) + 0.04)) * sin(3.14159265 * ph);
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
