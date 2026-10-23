//@doc
 * @brief VARVE YEAR BANDS: varves: annual layers in lake sediment, light in summer and dark in winter, with an occasional flood layer; the photo colours the layers, and the thickness of the year changes.  Each layer has a thickness from a slow noise, summer layers are pale and coarse, winter layers dark and fine,
 * and now and then a thick graded flood layer lies between.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the thickness of the layers (the year's size)
 *   audioPhrasePos -> the pattern of the flood layers over the phrase (periodic)
 *
 * Knobs: sizeP (the number of layers), hueP.
//@params sizeP
//@audio audioSwell audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float N = 18.0 + 22.0 * clamp(sizeP, 0.0, 1.0);
    float th = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float warp = 0.5 * fbm(vec2(p.y * 6.0, 3.0 + 0.05 * sceneTime)) + 0.1 * sin(3.0 * p.x + 0.3 * p.y);
    float s = (p.y * N + 3.0 * warp) * th;
    float k = floor(s);
    float fy = fract(s);
    float yr = floor(k * 0.5);
    float summer = mod(k, 2.0);
    float h = hash21(vec2(yr, 7.0));
    float flood = step(0.88 - 0.05 * sin(6.2831853 * audioPhrasePos), h);
    vec3 c = imgLod(vec2(p.x * 0.85 + 0.5 + 0.1 * (h - 0.5), yr * 0.017 + 0.5), 1.5);
    c = mix(vec3(luma(c)), c, 1.25);
    vec3 pale = mix(vec3(0.82, 0.74, 0.58), c * 1.2, 0.45);
    vec3 dark = mix(vec3(0.15, 0.11, 0.09), c * 0.5, 0.45);
    vec3 col = mix(dark, pale, summer);
    float grade = fy;
    vec3 fl = mix(pale * 0.9, dark * 1.2, grade);
    col = mix(col, fl, flood * summer);
    col *= 0.85 + 0.3 * noise2(vec2(p.x * 80.0, s * 12.0));
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.08, fy);
    finish(col * 1.2);
}
