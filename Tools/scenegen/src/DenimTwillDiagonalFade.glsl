//@doc
 * @brief DENIM TWILL DIAGONAL FADE: denim twill: blue warp and white weft in twill, washed out at the folds; the photo sets the degree of fading, and the diagonals run on.  Fine diagonal threads (warp indigo, weft pale) with the twill step, and fold lines (ridged noise) where the dye is worn off down to the white; the
 * fading follows the photo's brightness.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the amount of fading
 *   audioAdvance -> the diagonals and the folds run (integrated)
 *
 * Knobs: sizeP (the thread width), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float T = (2.0 + 2.5 * clamp(sizeP, 0.0, 1.0)) * px;
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    vec2 g = (fc + vec2(0.0, 0.0)) / T;
    vec2 ci = floor(g);
    vec2 f = fract(g) - 0.5;
    float tw = mod(ci.x + ci.y, 3.0) < 1.0 ? 1.0 : 0.0;
    float thr = tw > 0.5 ? (0.6 + 0.4 * cos(f.y * 3.1416)) : (0.6 + 0.4 * cos(f.x * 3.1416));
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    float fold = 1.0 - abs(fbm(p * 3.0 + vec2(t, 0.0)) - 0.5) * 2.0;
    float fold2 = 1.0 - abs(fbm(p * 8.0 + vec2(4.0, -t)) - 0.5) * 2.0;
    float fade = clamp(pow(fold, 5.0) * 0.9 + pow(fold2, 6.0) * 0.4 + 0.3 * (luma(c) - 0.4), 0.0, 1.0) * (0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 indigo = vec3(0.1, 0.18, 0.4) * (0.8 + 0.4 * noise2(fc / px * 0.8));
    vec3 white = vec3(0.88, 0.9, 0.92);
    vec3 warp = mix(indigo, white, fade * 0.9);
    vec3 weft = mix(white * 0.9, white, 0.3) * (0.85 + 0.2 * noise2(fc / px * 1.3 + 3.0));
    vec3 col = (tw > 0.5 ? warp : weft) * thr;
    col = mix(col, col * (0.7 + 0.5 * c), 0.35);
    finish(col * 1.2);
}
