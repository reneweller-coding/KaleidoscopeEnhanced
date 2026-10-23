//@doc
 * @brief THREE GRATING TRIPLES: three gratings at 0, 60 and 120 degrees in front of the photo; their product is a honeycomb whose
 * every cell is a window onto the picture, bent by the gratings' own refraction.  A small angle error between the three
 * stretches the honeycomb into a slow superstructure, and closes up when the music is consonant.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the angle error opens and closes with the harmony (integrated)
 *   audioSwell      -> the grating constant breathes with it
 *   audioPhase      -> the honeycomb turns (integrated)
 *
 * Knobs: pitchP (the grating constant), refractP (how strongly the cells bend the picture), hueP.
//@params pitchP refractP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 2.0 * audioPhase;
    float K = 6.2831853 * (7.0 + 12.0 * clamp(pitchP, 0.0, 1.0)) * (1.0 + 0.06 * clamp(audioSwell, 0.0, 1.0));
    float err = 0.06 * (0.5 + 0.5 * sin(0.6 * audioHarmAdvance));
    float S = 0.0;
    vec2 g = vec2(0.0);
    for (int i = 0; i < 3; ++i) {
        float a = 1.0471976 * float(i) + 0.03 * t + err * float(i);
        vec2 k = K * vec2(cos(a), sin(a));
        float ph = dot(k, p);
        S += cos(ph);
        g -= sin(ph) * k;
    }
    S /= 3.0;
    vec2 uv = p * 0.8 + 0.5 + g / K * (0.01 + 0.03 * clamp(refractP, 0.0, 1.0));
    vec3 col = imgLod(uv, 0.5) * (0.5 + 0.75 * smoothstep(-0.4, 0.9, S));
    finish(col);
}
