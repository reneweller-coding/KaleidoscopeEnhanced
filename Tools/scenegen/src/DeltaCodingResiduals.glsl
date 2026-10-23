//@doc
 * @brief DELTA CODING RESIDUALS: predictive coding: only what the prediction from the neighbours missed is shown, in grey with colour only at the errors; the picture shows its own surprise, and the predictor glides slowly between left, up and the median edge
 * detector.  Where the photo is smooth the screen is grey, where it is surprising it shows its colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the predictor glides between left, up and MED (integrated)
 *   audioSwell       -> the amplification of the errors
 *
 * Knobs: sizeP (the distance of the neighbours), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
vec3 med(vec3 l, vec3 u, vec3 ul)
{
    vec3 mx = max(l, u);
    vec3 mn = min(l, u);
    vec3 grad = l + u - ul;
    vec3 hi = step(mx, ul);
    vec3 lo = step(ul, mn);
    return mix(mix(grad, mn, hi), mx, lo * (1.0 - hi));
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5 + 0.03 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    float e = 0.004 + 0.012 * clamp(sizeP, 0.0, 1.0);
    vec3 c = imgLod(uv, 0.4);
    vec3 l = imgLod(uv - vec2(e, 0.0), 0.4);
    vec3 u = imgLod(uv - vec2(0.0, e), 0.4);
    vec3 ul = imgLod(uv - vec2(e, e), 0.4);
    float a = 0.2 * audioHarmAdvance + 0.04 * sceneTime;
    vec3 w = exp(vec3(sin(a), sin(a + 2.09), sin(a + 4.19)) * 2.2);
    w /= w.x + w.y + w.z;
    vec3 pred = w.x * l + w.y * u + w.z * med(l, u, ul);
    vec3 r = c - pred;
    float k = 3.0 + 4.0 * clamp(audioSwell, 0.0, 1.0);
    float g = 0.5 + k * luma(r);
    vec3 col = vec3(g) + (r - vec3(luma(r))) * k * 1.6;
    finish(clamp(col, 0.0, 1.0) * 1.1);
}
