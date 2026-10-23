//@doc
 * @brief PINCH POINT NET: a dozen Gaussian pin points that gather the photo like pins stuck into cloth, wandering on Lissajous paths; between the pins folds form where the pulls oppose.  Near each pin the photo is drawn in toward
 * it and shrunk, so the picture looks like a smocked fabric with moving pleats.  The pull follows the swell, the paths' frequency the chords of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the pull
 *   audioHarmAdvance -> the paths' frequency ratio drifts with the chords
 *
 * Knobs: pinP (the size of the pins' reach), hueP.
//@params pinP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.03 * sceneTime + 0.1 * audioAdvance;
    float fr = 1.0 + 0.25 * sin(0.45 * audioHarmAdvance);
    float sg = 0.18 + 0.12 * clamp(pinP, 0.0, 1.0);
    float pull = 0.5 + 1.3 * clamp(audioSwell, 0.0, 1.0);
    vec2 uvp = p;
    for (int i = 0; i < 12; ++i) {
        float fi = float(i);
        vec2 c = vec2(0.8 * sin(t * (1.0 + 0.13 * fi) * fr + 2.1 * fi), 0.4 * sin(t * (1.3 + 0.11 * fi) + 1.7 * fi));
        vec2 d = p - c;
        float g = exp(-dot(d, d) / (sg * sg));
        uvp += d * g * pull * 1.2;
    }
    finish(imgLod(uvp * 0.8 + 0.5, 0.7) * 1.08);
}
