//@doc
 * @brief PARABOLIC DISH FIELD: a field of parabolic mirrors that gather the photo's light into focal points: every dish shows its piece of the picture only as a bright
 * spot and rings at its focus, so the picture is made of points and circles of light; the focal length follows the swell and the dish count the spectrum.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the focal length
 *   audioSpread     -> the number of dishes
 *   audioAdvance    -> the dishes drift (integrated)
 *
 * Knobs: cellsP (the base count), hueP.
//@params cellsP
//@audio audioSwell audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.03 * sceneTime + 0.4 * audioAdvance;
    float N = (6.0 + 8.0 * clamp(cellsP, 0.0, 1.0)) * (0.85 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * N + vec2(sin(t), cos(0.8 * t));
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    vec3 c = imgLod((cell + 0.5 - vec2(sin(t), cos(0.8 * t))) / N * 0.8 + 0.5, 1.5);
    float r = length(f);
    float focal = 0.1 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    float spot = exp(-pow(r / (0.04 + 0.4 * (focal - 0.1)), 2.0));
    float ring = exp(-pow((r - focal) / 0.035, 2.0)) * 0.7 + exp(-pow((r - 2.0 * focal) / 0.04, 2.0)) * 0.35;
    float dish = smoothstep(0.48, 0.42, r) * 0.4;
    vec3 col = c * (dish + 1.6 * spot + 0.9 * ring);
    finish(col);
}
