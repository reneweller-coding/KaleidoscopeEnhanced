//@doc
 * @brief LENS BLUR GHOST BOKEH: the photo through an objective with aperture blades whose shape turns: every bright point becomes a polygon (a bokeh disc), and the number
 * of blades glides continuously (the polygon's corners round or sharpen) while the photo's dark parts stay soft.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of blades glides from three to nine with the harmony (integrated)
 *   audioSwell      -> the size of the discs
 *   audioPhase      -> the polygon turns (integrated)
 *
 * Knobs: sizeP (the base size of the discs), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.3 * sceneTime + 2.0 * audioPhase;
    float n = 3.5 + 5.0 * (0.5 - 0.5 * cos(0.25 * audioHarmAdvance));
    float R = (0.012 + 0.035 * clamp(sizeP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 28; ++i) {
        float fi = float(i);
        float rr = sqrt((fi + 0.5) / 28.0);
        float a = 2.399963 * fi + 0.1 * t;
        float sec = 6.2831853 / n;
        float edge = cos(3.14159265 / n) / cos(mod(a, sec) - 0.5 * sec);
        vec2 off = rr * edge * R * vec2(cos(a), sin(a)) * 1.0;
        vec3 c = imgLod(uv + off, 1.0);
        float w = 0.3 + 4.0 * pow(luma(c), 3.0);
        sum += c * w;
        ws += w;
    }
    finish(sum / ws * 1.05);
}
