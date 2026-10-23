//@doc
 * @brief RETINEX ILLUMINANT SHIFT RECOVERY: Land's retinex: a picture under changing light, from which the eye calculates back the colour of the things; the picture shows the photo at the same time in the light and in the calculation, separated by a wandering border.  A coloured light that follows the key turns the whole
 * photo; on the other side of the border every pixel is divided by the local mean of the colour over a wide area, which brings the colours back.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the colour of the light follows the key (integrated)
 *   audioAdvance     -> the border wanders (integrated)
 *
 * Knobs: sizeP (the width of the averaging), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float a = 0.08 * audioHarmAdvance + 0.04 * sceneTime;
    vec3 cast = vec3(1.0 + 0.55 * sin(a), 1.0 + 0.3 * sin(a + 2.1), 1.0 + 0.55 * sin(a + 4.2));
    vec3 c = imgLod(uv, 0.6) * cast;
    vec3 mean_ = imgLod(uv, 6.5 - 1.5 * clamp(sizeP, 0.0, 1.0)) * cast;
    float gm = luma(mean_);
    vec3 rec = c / max(mean_, vec3(0.05)) * (0.35 + 0.4 * gm) * 1.2;
    float ang = 1.2;
    float pos = 0.3 * sin(0.012 * audioAdvance + 0.02 * sceneTime);
    float d = dot(p, vec2(cos(ang), sin(ang))) - pos;
    float m = smoothstep(-0.015, 0.015, d);
    float line = exp(-pow(d / 0.004, 2.0));
    vec3 col = mix(c * 1.1, clamp(rec, 0.0, 1.4), m);
    finish(col + vec3(1.0) * line * 0.35);
}
