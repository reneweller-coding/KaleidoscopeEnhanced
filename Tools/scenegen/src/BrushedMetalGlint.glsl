//@doc
 * @brief BRUSHED METAL GLINT: brushed metal: concentric brush tracks as on the bottom of a pan throw a bow-tie of light (anisotropic gloss) that circles with the light source; the
 * photo colours the metal and the band wanders over it, with the fine grain of the brushing across it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light circles (integrated)
 *   audioSwell      -> the band's width
 *
 * Knobs: grainP (the brushing's grain), hueP.
//@params grainP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.12 * sceneTime + 1.0 * audioPhase;
    vec2 c = 0.15 * vec2(sin(0.2 * t), cos(0.17 * t));
    vec2 d = p - c;
    float th = atan(d.y, d.x);
    float w = 0.25 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float s1 = sin(th - t), s2 = sin(th - t + 3.14159265);
    float I = exp(-pow(s1 / w, 2.0)) + exp(-pow(s2 / w, 2.0)) + 0.15;
    float r = length(d);
    float brush = 0.9 + 0.1 * noise2(vec2(r * (250.0 + 400.0 * clamp(grainP, 0.0, 1.0)), 3.0)) + 0.06 * noise2(vec2(r * 900.0, th * 3.0));
    vec3 col = imgLod(uv, 1.5) * (0.28 + 0.95 * I) * brush;
    col += 0.1 * I * vec3(1.0, 0.97, 0.92) * brush;
    finish(col);
}
