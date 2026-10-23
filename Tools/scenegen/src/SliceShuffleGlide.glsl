//@doc
 * @brief SLICE SHUFFLE GLIDE: the photo in sixteen vertical slices like a chopped breakbeat: on every bar the slices glide to a new order, in the last beat of the bar, the order a pattern the ear takes for a fill; the glide
 * is always a movement, never a jump, the slices passing one another, and the picture is whole again at the start of every phrase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the bar (the order is chosen by the bar), and inside it the glide of the last beat
 *   audioSwell      -> the shadow between the slices
 *
 * Knobs: sliceP (the slices' width), hueP.
//@params sliceP
//@audio audioSwell
//@body
/**  The place of a slice in the order of a bar.
 *
 * @param i    The slice, 0..15. (in)
 * @param bar  The bar, 0..8 (0 and 8 give the original order). (in)
 *
 * @return
 *   The slot, 0..15.
 **/
float sliceSlot(float i, float bar)
{
    if (bar < 0.5 || bar > 7.5) return i;
    float a = 1.0 + 2.0 * floor(8.0 * hash21(vec2(bar, 3.1)));
    float b = floor(16.0 * hash21(vec2(bar, 9.7)));
    return mod(a * i + b, 16.0);
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float u = rhyPhrase() * 8.0;
    float f = fract(u);
    float bar = u - f;
    float gl = smoothstep(0.62, 0.95, f);
    float x16 = (p.x / asp + 0.5) * 16.0;
    vec3 col = vec3(0.03);
    float shade = 1.0;
    for (int ii = 0; ii < 16; ++ii) {
        float fi = float(ii);
        float s0 = sliceSlot(fi, bar);
        float s1 = sliceSlot(fi, mod(bar + 1.0, 8.0));
        float ds = s1 - s0;
        if (ds > 8.0) ds -= 16.0;
        if (ds < -8.0) ds += 16.0;
        float pos = s0 + ds * gl;
        float fr = x16 - pos;
        if (fr >= 0.0 && fr < 1.0) {
            float lift = 0.5 - abs(fr - 0.5);
            vec2 uv = vec2(0.5 + ((fi + fr) / 16.0 - 0.5) * asp * 0.8, p.y * 0.8 + 0.5);
            col = imgLod(uv, 0.6) * 1.1;
            shade = 1.0 - (0.2 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * smoothstep(0.1, 0.0, lift);
        }
    }
    finish(col * shade);
}
