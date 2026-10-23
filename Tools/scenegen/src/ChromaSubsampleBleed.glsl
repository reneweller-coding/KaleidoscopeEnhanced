//@doc
 * @brief CHROMA SUBSAMPLE BLEED: chroma subsampling 4:2:0: the colour lies at half or a quarter of the resolution under the sharp brightness, and the colour resolution glides; at colour edges the colour bleeds over the edge of the brightness and forms
 * fringes that open and close with the resolution.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the colour's resolution wanders (integrated)
 *   audioSwell   -> the colour's gain
 *
 * Knobs: sizeP (how far the colour is blurred), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5 + 0.05 * vec2(cos(0.05 * sceneTime), sin(0.045 * sceneTime));
    vec3 c = imgLod(uv, 0.2);
    float y = luma(c);
    float lodC = 1.5 + 2.6 * clamp(sizeP, 0.0, 1.0) + 1.2 * sin(0.05 * sceneTime + 0.03 * audioAdvance);
    vec2 sh = 0.012 * vec2(sin(0.07 * sceneTime), cos(0.06 * sceneTime));
    vec3 cc = imgLod(uv + sh, max(lodC, 0.2));
    float yc = luma(cc);
    vec3 chroma = cc - vec3(yc);
    vec3 col = vec3(y) + chroma * (1.1 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    finish(col * 1.1);
}
