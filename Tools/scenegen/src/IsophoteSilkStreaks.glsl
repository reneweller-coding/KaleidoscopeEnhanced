//@doc
 * @brief ISOPHOTE SILK STREAKS: the photo smeared along its own contour lines (perpendicular to the gradient): strands that flow round the shapes of the picture, the picture combing itself.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> a slow drift lets the smear start where the gradient is flat (integrated)
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: the photo smeared along its own contour lines (perpendicular to the gradient)
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
    vec2 uv = p * 0.8 + 0.5;
    float e = 0.01;
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), 3.2)) - luma(imgLod(uv - vec2(e, 0.0), 3.2)),
                  luma(imgLod(uv + vec2(0.0, e), 3.2)) - luma(imgLod(uv - vec2(0.0, e), 3.2)));
    return vec2(-g.y, g.x) * 45.0 + 0.15 * vec2(cos(0.1 * t), sin(0.1 * t));
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
