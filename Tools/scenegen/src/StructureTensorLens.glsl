//@doc
 * @brief STRUCTURE TENSOR LENS: lenses that stretch the photo along its own grain -- three soft lenses drift over the
 * picture, and under each the picture is pulled out along the direction of its lines (the structure tensor's
 * orientation), so fibres lengthen, edges stream and the picture's own texture flows out of the lenses' centres like
 * combed hair.  The lenses' pull follows the bass.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass       -> how hard the lenses pull
 *   audioAdvance    -> the lenses and the photo drift (integrated)
 *
 * Knobs: sizeP (the lenses' size), pullP (the base pull), photoP (photo share), hueP.
//@params sizeP pullP photoP
//@audio audioBass
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.014 * sceneTime + 0.01 * audioAdvance), cos(0.011 * sceneTime));
    vec2 uv = p * 0.5 + 0.5 + drift;
    float R = 0.35 + 0.35 * clamp(sizeP, 0.0, 1.0);
    float pull = (0.01 + 0.025 * clamp(pullP, 0.0, 1.0)) * (0.5 + 1.2 * clamp(audioBass, 0.0, 1.0));
    // the grain's direction: the structure tensor, smoothed over a neighbourhood
    vec3 J = vec3(0.0);
    for (int k = 0; k < 5; ++k) {
        vec2 o = k == 0 ? vec2(0.0) : 0.01 * vec2(cos(1.5707963 * float(k)), sin(1.5707963 * float(k)));
        vec2 g = texGrad(uv + o, 2.0);
        J += vec3(g.x * g.x, g.y * g.y, g.x * g.y);
    }
    float th = 0.5 * atan(2.0 * J.z, J.x - J.y) + 1.5707963;   // along the lines, across the gradient
    vec2 along = vec2(cos(th), sin(th));
    float coh = sqrt((J.x - J.y) * (J.x - J.y) + 4.0 * J.z * J.z) / max(J.x + J.y, 1e-4);
    vec2 disp = vec2(0.0);
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        vec2 c = 0.8 * vec2(sin(0.07 * sceneTime + 2.1 * fi + 0.02 * audioAdvance), cos(0.053 * sceneTime + 1.3 * fi));
        vec2 d = p - c;
        float w = exp(-dot(d, d) / (R * R));
        disp += along * clamp(dot(d, along) * 8.0, -1.0, 1.0) * w;   // pulled out along the grain, away from the centre
    }
    vec3 col = vec3(0.0);
    for (int s = 0; s < 6; ++s) col += imgLod(uv - disp * pull * coh * (float(s) / 5.0) * 4.0, 0.4);
    col /= 6.0;
    col = mix(col, imgLod(uv, 0.0), 0.2 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.05);
}
