//@doc
 * @brief FINGERPRINT RIDGES FROM PHOTO: fingerprint ridges that follow the contour lines of the photo: lines of equal brightness, bent by a slow swirl so they loop and split like a fingertip, spaced close where the photo is dark and wide
 * where it is bright; the ink is the photo's own colour on a pale ground, so the picture is the photo printed as a fingerprint.  The line spacing follows the spectral spread, the course of the lines the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the spacing of the lines
 *   audioPhase      -> the lines run along their course (integrated)
 *
 * Knobs: lineP (the number of lines), hueP.
//@params lineP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float l = luma(imgLod(uv, 2.5));
    vec2 sw = vec2(fbm(p * 3.0 + 0.02 * sceneTime), fbm(p * 3.0 + 7.0 - 0.02 * sceneTime)) - 0.5;
    float K = (6.0 + 10.0 * clamp(lineP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    float s = pow(clamp(l, 0.02, 1.0), 0.55) * K + 0.8 * (fbm(p * 2.2 + sw) - 0.5) * 3.0 - 0.15 * audioPhase - 0.03 * sceneTime;
    float f = fract(s);
    float ridge = smoothstep(0.65, 0.35, abs(f - 0.5) * 2.0);
    vec3 c = imgLod(uv, 1.0);
    vec3 paper = mix(vec3(0.96, 0.94, 0.9), imgLod(uv, 4.0), 0.25);
    finish(mix(paper, c * 0.75, ridge) * 1.02);
}
