//@doc
 * @brief PATCH MATCH NEAREST FIELD MORPH: the PatchMatch method: every patch is assigned the most similar one elsewhere in the picture; the picture shows the photo made of patches that reassign themselves in the picture and slowly exchange.  Every cell shows the photo from the place of its assigned partner, a few cells away;
 * the assignments change in turns, cross-faded, and the cells' borders are soft.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the size of the patches (smoothed)
 *   audioAdvance -> the assignments change (integrated)
 *
 * Knobs: sizeP (the size of the patches), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
vec3 pmPick(vec2 ci, vec2 f, float k, float S)
{
    vec2 h = hash22(ci + k * 7.1);
    vec2 off = floor((h - 0.5) * 7.0 + 0.5);
    vec2 src = (ci + off + f) * S;
    return imgLod(src * 0.85 + 0.5, 0.6);
}
void main()
{
    vec2 p = screenP();
    float S = (0.07 + 0.08 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float ph = 0.015 * audioAdvance + 0.02 * sceneTime + 2.0 * hash21(ci);
    float k = floor(ph);
    float w = smoothstep(0.6, 1.0, fract(ph));
    vec3 a = pmPick(ci, f, k, S);
    vec3 b = pmPick(ci, f, k + 1.0, S);
    vec3 col = mix(a, b, w);
    float edge = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    finish(col * (0.9 + 0.1 * edge) * 1.1);
}
