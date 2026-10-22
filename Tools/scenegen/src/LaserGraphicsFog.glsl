//@doc
 * @brief LASER GRAPHICS FOG: laser projectors draw rosettes and Lissajous figures into layers of fog standing one
 * behind the other: each figure glows where the beam crosses its fog layer, the beams' fans run from the projectors
 * through the fog, and the lines leave a soft afterglow.  A figure is a closed parametric curve (x = sin(a t + d),
 * y = sin(b t)), drawn as the distance to its polyline; each layer is further away, so its figure is smaller and
 * fainter.  Two laser colours: the photo's family tone and its neighbour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the figures' frequency ratios glide with the chord changes (3:2, 5:4, 4:3, 5:3)
 *   audioLevel       -> how many layers carry a figure (loud music fills the fog)
 *   audioAdvance     -> the figures' phases run (integrated)
 *
 * Knobs: lineP (the lines' width), fanP (the fans' brightness), hueP.
//@params lineP fanP
//@audio audioHarmAdvance audioLevel
//@body
/**  The ratio of a step in the cycle 3:2, 5:4, 4:3, 5:3.
 *
 * @param k  The step. (in)
 *
 * @return
 *   (a, b).
 **/
vec2 ratioOf(float k)
{
    float m = mod(k, 4.0);
    return m < 0.5 ? vec2(3.0, 2.0) : m < 1.5 ? vec2(5.0, 4.0) : m < 2.5 ? vec2(4.0, 3.0) : vec2(5.0, 3.0);
}

/**  The distance to a Lissajous figure.
 *
 * @param p      The point. (in)
 * @param ab     The ratio. (in)
 * @param ph     The phase. (in)
 * @param scale  The figure's size. (in)
 *
 * @return
 *   The distance.
 **/
float lissajous(vec2 p, vec2 ab, float ph, float scale)
{
    float best = 1e9;
    vec2 prev = scale * vec2(sin(ph), 0.0);
    for (int i = 1; i <= 72; ++i) {
        float t = 6.2831853 * float(i) / 72.0;
        vec2 cur = scale * vec2(sin(ab.x * t + ph), sin(ab.y * t));
        vec2 e = cur - prev;
        float h = clamp(dot(p - prev, e) / dot(e, e), 0.0, 1.0);
        best = min(best, length(p - prev - e * h));
        prev = cur;
    }
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float layers = 1.5 + 2.5 * clamp(audioLevel, 0.0, 1.0);
    float w = (0.004 + 0.004 * clamp(lineP, 0.0, 1.0));
    float ph = 0.1 * sceneTime + 0.4 * audioAdvance;
    vec3 col = vec3(0.0);
    for (int L = 3; L >= 0; --L) {
        float fl = float(L);
        float on = clamp(layers - fl, 0.0, 1.0);
        if (on <= 0.0) continue;
        float sc = 0.42 / (1.0 + 0.45 * fl);
        vec2 q = p - vec2(0.25 * sin(1.7 * fl), 0.1 * cos(2.3 * fl)) / (1.0 + 0.3 * fl);
        float dA = lissajous(q, ratioOf(hk + fl), ph * (1.0 + 0.2 * fl) + fl, sc);
        float dB = lissajous(q, ratioOf(hk + fl + 1.0), ph * (1.0 + 0.2 * fl) + fl, sc);
        float g = (1.0 - hm) * exp(-pow(dA / w, 2.0)) + hm * exp(-pow(dB / w, 2.0));
        float glow = (1.0 - hm) * exp(-dA / (w * 10.0)) + hm * exp(-dB / (w * 10.0));
        vec3 laser = famLight(fh, mod(fl, 2.0) > 0.5 ? 0.25 : 0.7, 0.35 * g);
        col += laser * (g * 1.2 + glow * 0.25) * on * (1.0 - 0.15 * fl);
    }
    // the beam fans from the projectors below, through the fog
    float fan = 0.0;
    for (int i = 0; i < 3; ++i) {
        vec2 src = vec2(-0.6 + 0.6 * float(i), -0.62);
        vec2 d = p - src;
        float ang = atan(d.x, d.y);
        float rays = pow(0.5 + 0.5 * cos(ang * 40.0 + 3.0 * ph + float(i)), 30.0);
        fan += rays * smoothstep(0.6, 0.0, abs(ang)) * exp(-length(d) * 1.2);
    }
    col += famLight(fh, 0.5, 0.2) * fan * (0.1 + 0.3 * clamp(fanP, 0.0, 1.0));
    // the fog itself
    col += famCol(fh, 0.45) * 0.03 * (0.6 + 0.4 * fbm(p * 2.0 + vec2(0.02 * sceneTime, 0.0)));
    finish(col);
}
