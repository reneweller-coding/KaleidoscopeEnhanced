//@doc
 * @brief MORPHOLOGICAL BREATH: mathematical morphology breathing through the photo -- opening (the darkest under a
 * round brush, then the brightest of those) rounds away every bright speck smaller than the brush, closing does the
 * same to the dark ones.  The brush grows and shrinks and the two take turns, so the picture rounds itself off into
 * soft pebbled shapes and crystallises back into its detail, light and shade alternately giving way.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the brush's size: loud passages round the picture off
 *   audioAdvance    -> the photo drifts (integrated)
 *
 * Knobs: brushP (the base brush), turnP (how often opening and closing take turns), photoP (photo share), hueP.
//@params brushP turnP photoP
//@audio audioSwell
//@body
/**  Erosion or dilation of the photo by a round brush: the darkest (or brightest) of the points on two rings.
 *
 * @param uv     The point. (in)
 * @param r      The brush's radius. (in)
 * @param dark   True for erosion (the darkest), false for dilation (the brightest). (in)
 *
 * @return
 *   The chosen colour.
 **/
vec3 morph(vec2 uv, float r, bool dark)
{
    vec3 best = imgLod(uv, 0.8);
    float bl = luma(best);
    for (int k = 0; k < 10; ++k) {
        float a = 0.6283185 * float(k);
        float rr = k % 2 == 0 ? r : 0.55 * r;
        vec3 c = imgLod(uv + rr * vec2(cos(a), sin(a)), 0.8);
        float l = luma(c);
        if (dark ? l < bl : l > bl) { bl = l; best = c; }
    }
    return best;
}

void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.015 * sceneTime + 0.01 * audioAdvance), cos(0.012 * sceneTime));
    vec2 uv = p * 0.5 + 0.5 + drift;
    float r = (0.01 + 0.014 * clamp(brushP, 0.0, 1.0)) * (0.4 + 1.2 * clamp(audioSwell, 0.0, 1.0));
    float turn = 0.5 + 0.5 * sin((0.15 + 0.3 * clamp(turnP, 0.0, 1.0)) * sceneTime);
    // opening: the brightest of the eroded; closing: the darkest of the dilated (the second step on a ring of six)
    vec3 opened = morph(uv, r, true), closed = morph(uv, r, false);
    for (int k = 0; k < 6; ++k) {
        float a = 1.0471976 * float(k) + 0.3;
        vec2 o = 0.6 * r * vec2(cos(a), sin(a));
        vec3 e = morph(uv + o, r, true), d = morph(uv + o, r, false);
        if (luma(e) > luma(opened)) opened = e;
        if (luma(d) < luma(closed)) closed = d;
    }
    vec3 col = mix(opened, closed, smoothstep(0.2, 0.8, turn));
    col = mix(col, imgLod(uv, 0.0), 0.15 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.07);
}
