//@doc
 * @brief WATERED SILK PHOTO: moire silk: the photo lies on a cloth whose ribs are crossed by two wavy line sets, so the beating of the
 * lines throws watery bands of light and dark over the picture and a gloss band wanders across the folds.  Stuff and
 * colour are the photo's own.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of waves in the ribs
 *   audioPhase      -> the gloss band's travel and the waves' drift (integrated)
 *
 * Knobs: ribsP (the ribs' fineness), glossP (the gloss's strength), hueP.
//@params ribsP glossP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.3 + 2.0 * audioPhase;
    float N = 40.0 + 60.0 * clamp(ribsP, 0.0, 1.0);
    float k = 5.0 + 5.0 * clamp(audioSpread, 0.0, 1.0);
    float w1 = p.y + 0.02 * sin(k * p.x + t) + 0.01 * sin(2.3 * k * p.x - 0.5 * t);
    float w2 = p.y + 0.02 * sin(1.3 * k * p.x - 0.7 * t + 1.0) + 0.01 * sin(3.1 * k * p.x + 0.3 * t);
    float pat = 0.5 + 0.5 * cos(6.2831853 * N * (w1 - w2));
    float band = (p.x * 0.4 + p.y) - 0.5 * sin(0.15 * t);
    float gloss = exp(-pow(band / 0.22, 2.0)) * (0.2 + 0.8 * clamp(glossP, 0.0, 1.0));
    vec3 col = imgLod(uv, 0.5) * (0.5 + 0.55 * pat) + gloss * (0.12 + 0.3 * pat) * vec3(1.0, 0.97, 0.9);
    finish(col);
}
