//@doc
 * @brief FOCUS STACK FRINGES: a stack of five focus layers, sharp one after the other and mixed by a slowly wandering map of local sharpness; where the algorithm picks the wrong layer the typical fringes stand, bright and dark halos along the
 * seams between a sharp and a blurred layer.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the map of the focus wanders (integrated)
 *   audioRoughness -> how hard the layers are told apart
 *
 * Knobs: sizeP (the size of the focus patches), hueP.
//@params sizeP
//@audio audioAdvance audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5 + 0.04 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    float sc = 1.2 + 2.4 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float t = 0.03 * audioAdvance + 0.04 * sceneTime;
    float fm = 4.0 * fbm(p * sc + vec2(t, -0.7 * t));
    float beta = 5.0 + 9.0 * clamp(audioRoughness, 0.0, 1.0);
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int k = 0; k < 5; ++k) {
        float lod = 0.2 + 1.3 * abs(float(k) - 2.0);
        vec3 c = imgLod(uv, lod);
        float d = fm - float(k) + 0.5;
        float w = exp(-beta * d * d / 4.0);
        sum += c * w;
        ws += w;
    }
    finish(sum / max(ws, 1e-3) * 1.1);
}
