//@doc
 * @brief CHANNEL PLATE TECTONICS: the red, green and blue plates of the photo slide over one another like continental plates,
 * each on its own drift; along the ridges where plates meet the picture wrinkles into folded mountains of its own
 * texture, and colour fringes appear only at those joints.  Elsewhere the three plates agree and the photo stands whole.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the plates' drift (integrated)
 *   audioSwell      -> the compression: how high the folds rise
 *
 * Knobs: driftP (how far the plates may drift), ridgeP (how fine the ridges are), hueP.
//@params driftP ridgeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float dr = (0.3 + 0.7 * clamp(driftP, 0.0, 1.0)) * 0.035;
    vec2 q = p * (1.4 + 2.0 * clamp(ridgeP, 0.0, 1.0));
    float f = fbm(q + vec2(0.02 * t, 0.0));
    float ridge = exp(-pow((f - 0.5) / 0.07, 2.0));
    dr *= 0.3 + 0.7 * ridge;                         // the plates agree away from the joints
    vec2 dR = dr * vec2(cos(0.13 * t), sin(0.11 * t));
    vec2 dG = dr * vec2(cos(0.13 * t + 2.1), sin(0.11 * t + 2.1));
    vec2 dB = dr * vec2(cos(0.13 * t + 4.2), sin(0.11 * t + 4.2));
    float fold = ridge * (0.01 + 0.03 * sw) * sin(60.0 * f + 0.5 * t);
    vec2 w = vec2(fold, -fold * 0.7);
    vec3 col = vec3(imgLod(uv + dR + w, 0.4).r, imgLod(uv + dG - 0.5 * w, 0.4).g, imgLod(uv + dB + 0.5 * w, 0.4).b);
    vec3 base = imgLod(uv, 0.4);
    col = mix(base, col, 0.5 + 0.5 * ridge);
    col *= 1.0 + 0.25 * ridge * sin(60.0 * f + 0.5 * t);
    finish(col);
}
