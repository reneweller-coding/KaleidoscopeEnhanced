//@doc
 * @brief TRESILLO STRIPES: stripes whose widths run in the pattern three-three-two, the Cuban tresillo, repeated across the picture; every stripe carries the photo with another shift, and the whole row of stripes runs along with the bar.
 * A new section changes the pattern -- tresillo, son clave, habanera, a second clave -- and the old and new patterns cross over in six seconds.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the stripes run one period a bar (eight eighths)
 *   audioSectionId/Prev/Age -> the pattern changes, crossing over
 *   audioSwell      -> the stripes' brightness
 *
 * Knobs: sizeP (the width of one bar's period), hueP.
//@params sizeP
//@audio audioSwell
//@body
/**  The width of a stripe in a rhythm pattern, in eighths of a bar.
 *
 * @param pat  The pattern: 0 tresillo 3-3-2, 1 son clave, 2 habanera 3-1-2-2, 3 a clave of six short stripes. (in)
 * @param k    The stripe in the period. (in)
 *
 * @return
 *   The width, 0 where the period has no such stripe.
 **/
float stripeWidth(float pat, int k)
{
    if (pat < 0.5) return k == 0 ? 3.0 : (k == 1 ? 3.0 : (k == 2 ? 2.0 : 0.0));
    if (pat < 1.5) return k == 0 ? 1.5 : (k == 1 ? 1.5 : (k == 2 ? 2.0 : (k == 3 ? 1.0 : (k == 4 ? 2.0 : 0.0))));
    if (pat < 2.5) return k == 0 ? 3.0 : (k == 1 ? 1.0 : (k == 2 ? 2.0 : (k == 3 ? 2.0 : 0.0)));
    return k == 0 ? 1.5 : (k == 1 ? 1.5 : (k == 2 ? 1.0 : (k == 3 ? 1.0 : (k == 4 ? 1.5 : (k == 5 ? 1.5 : 0.0)))));
}
/**  The picture under one rhythm pattern.
 *
 * @param p    The pixel. (in)
 * @param pat  The pattern. (in)
 * @param W    The width of an eighth in screen units. (in)
 * @param sh   The running of the stripes in eighths. (in)
 *
 * @return
 *   The colour.
 **/
vec3 stripePattern(vec2 p, float pat, float W, float sh)
{
    float x = p.x / W + sh;
    float per = floor(x / 8.0);
    float xm = x - per * 8.0;
    float acc = 0.0;
    int kk = 0;
    float f = 0.0;
    float wk = 1.0;
    for (int k = 0; k < 6; ++k) {
        float w = stripeWidth(pat, k);
        if (w > 0.0 && xm >= acc) { kk = k; f = (xm - acc) / w; wk = w; }
        acc += w;
    }
    float sid = per * 7.0 + float(kk) + pat * 3.0;
    float h = hash21(vec2(sid, 1.3));
    vec2 uv = vec2(p.x * 0.8 + 0.5 + 0.35 * (h - 0.5), p.y * 0.8 + 0.5 + 0.3 * (hash21(vec2(sid, 8.1)) - 0.5));
    vec3 c = imgLod(uv, 0.7);
    float edge = smoothstep(0.0, 0.04, f) * smoothstep(1.0, 0.96, f);
    return c * (0.55 + 0.25 * wk) * edge * 1.1;
}
void main()
{
    vec2 p = screenP();
    float W = 0.05 + 0.07 * clamp(sizeP, 0.0, 1.0);
    float sh = rhyBar() * 8.0;
    vec3 a = stripePattern(p, rhySecPrev(4.0), W, sh);
    vec3 b = stripePattern(p, rhySecCur(4.0), W, sh);
    finish(mix(a, b, rhySecBlend()) * (0.95 + 0.25 * clamp(audioSwell, 0.0, 1.0)));
}
