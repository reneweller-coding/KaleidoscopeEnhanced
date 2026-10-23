//@doc
 * @brief INVERSE CAUSTIC PLATE: a transparent plate whose surface is shaped so that the caustic it casts is the photo: light from the side wanders and the photo appears from light and
 * shade on a floor before it falls into lines of light; the plate is the photo's blurred brightness read as a height, the light bent by its slope and gathered
 * where the surface curves up.  The photo's colours light the floor.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light's angle (integrated)
 *   audioSwell      -> the plate's height: how far the picture dissolves into lines
 *
 * Knobs: heightP (the base height), hueP.
//@params heightP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.1 * sceneTime + 0.8 * audioPhase;
    vec2 L = 0.7 * vec2(cos(0.5 * t), sin(0.5 * t));
    float e = 0.008;
    float k = (0.4 + 1.0 * clamp(heightP, 0.0, 1.0)) * (0.35 + 1.0 * clamp(audioSwell, 0.0, 1.0));
    vec2 s = uv;
    float J = 1.0;
    for (int i = 0; i < 2; ++i) {
        float Lh = luma(imgLod(s, 3.0));
        vec2 g = vec2(luma(imgLod(s + vec2(e, 0.0), 3.0)) - luma(imgLod(s - vec2(e, 0.0), 3.0)),
                      luma(imgLod(s + vec2(0.0, e), 3.0)) - luma(imgLod(s - vec2(0.0, e), 3.0))) / (2.0 * e);
        s = uv + (L * 0.06 + g * 0.01) * k;
    }
    float lap = luma(imgLod(uv + vec2(e, 0.0), 3.0)) + luma(imgLod(uv - vec2(e, 0.0), 3.0)) + luma(imgLod(uv + vec2(0.0, e), 3.0)) + luma(imgLod(uv - vec2(0.0, e), 3.0)) - 4.0 * luma(imgLod(uv, 3.0));
    J = 1.0 / clamp(1.0 + k * 18.0 * lap, 0.3, 3.0);
    vec3 col = imgLod(s, 0.6) * (0.35 + 0.65 * clamp(J, 0.0, 2.5));
    finish(col * 1.05);
}
