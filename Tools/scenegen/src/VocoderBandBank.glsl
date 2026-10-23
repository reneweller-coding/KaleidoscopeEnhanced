//@doc
 * @brief VOCODER BAND BANK: a vocoder filter bank: the photo is taken apart into ten bands of the picture's own scales (from coarse tones to fine grain); every band drifts at its own speed and direction, and the sum puts the photo together again whenever the bands meet.  Each band is
 * the difference of two blur levels, and the bands' gains follow the music in level only.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the common phase of the drift (integrated): where it passes a whole number the bands meet
 *   audioBass, audioMid, audioHigh -> the gain of coarse, middle and fine bands (light only)
 *
 * Knobs: sizeP (how far the bands drift apart), hueP.
//@params sizeP
//@audio audioBass audioMid audioHigh audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float ph = 0.012 * audioAdvance + 0.015 * sceneTime;
    float sw = sin(3.1415927 * ph);
    float D = (0.025 + 0.05 * clamp(sizeP, 0.0, 1.0)) * sw;
    vec3 col = vec3(0.0);
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        float l0 = 0.8 * fk;
        float ang = 1.7 * fk + 0.5;
        vec2 sh = D * (0.6 + 0.12 * fk) * vec2(cos(ang), sin(ang)) * (fk - 4.5) / 4.5;
        vec3 a = imgLod(uv + sh, l0);
        vec3 b = imgLod(uv + sh, l0 + 0.8);
        float aud = fk < 3.0 ? audioHigh : (fk < 7.0 ? audioMid : audioBass);
        float g = 1.0 + 0.5 * (clamp(aud, 0.0, 1.0) - 0.4);
        col += (a - b) * g;
    }
    col += imgLod(uv, 8.0);
    finish(col * 1.05);
}
