//@doc
 * @brief ROTOSCOPE LINE BOIL: the boiling of rotoscoped contours: the photo as flat areas of colour with outlines that shift a little at every moment, so that they tremble as if drawn by hand without anything jolting (a steady noise).  The outlines are thin and
 * dark and stay discreet.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> the amplitude of the trembling
 *   audioSwell     -> the width of the lines
 *
 * Knobs: sizeP (the flatness of the areas), hueP.
//@params sizeP
//@audio audioSwell audioRoughness
//@body
/**  The colour flattened to n soft levels.
 *
 * @param c  The colour. (in)
 * @param n  The number of levels. (in)
 *
 * @return
 *   The flat colour.
 **/
vec3 flatten(vec3 c, float n)
{
    vec3 x = c * n;
    return (floor(x) + smoothstep(0.3, 0.7, fract(x))) / n;
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float n = 3.0 + 4.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float amp = 0.002 + 0.006 * clamp(audioRoughness, 0.0, 1.0);
    vec2 w1 = amp * vec2(noise2(p * 14.0 + 0.5 * sceneTime) - 0.5, noise2(p * 14.0 + 7.0 - 0.45 * sceneTime) - 0.5) * 2.0;
    vec2 w2 = amp * vec2(noise2(p * 9.0 + 3.0 + 0.35 * sceneTime) - 0.5, noise2(p * 9.0 + 11.0 + 0.3 * sceneTime) - 0.5) * 2.0;
    vec3 c = flatten(imgLod(uv + w2 * 0.5, 2.3), n);
    float e = 0.006;
    float l0 = luma(imgLod(uv + w1, 2.0));
    float gx = luma(imgLod(uv + w1 + vec2(e, 0.0), 2.0)) - l0;
    float gy = luma(imgLod(uv + w1 + vec2(0.0, e), 2.0)) - l0;
    float g = length(vec2(gx, gy));
    float lw = 0.35 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float line = smoothstep(0.05 - 0.03 * lw, 0.12 - 0.04 * lw, g);
    vec3 col = mix(c, c * 0.18, line * 0.8);
    finish(col * 1.1);
}
