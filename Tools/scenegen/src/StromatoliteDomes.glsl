//@doc
 * @brief STROMATOLITE DOMES: layered domes: every layer lies over the one before as a dome, the photo standing in the layers, which grow upward as the picture runs on; the domes are broad at the base and narrow at the crest, the
 * layers between them thin, dark at the joints and bright on the crowns.  The number of layers follows the spectral spread, the rise the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of layers
 *   audioAdvance    -> the layers rise (integrated)
 *
 * Knobs: domeP (the height of the domes), hueP.
//@params domeP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float W = 0.38;
    float dx = abs(fract(p.x / (2.0 * W) + 0.5) - 0.5) * 2.0;
    float dome = 1.0 - dx * dx;
    float H = 0.12 + 0.28 * clamp(domeP, 0.0, 1.0);
    float up = (0.5 - p.y);
    float shape = up + H * dome * exp(-1.4 * up);
    float N = (12.0 + 16.0 * clamp(audioSpread, 0.0, 1.0));
    float s = shape * N - 0.03 * audioAdvance - 0.01 * sceneTime;
    float b = floor(s), f = fract(s);
    vec2 uv = vec2(p.x * 0.8 + 0.5, (shape - 0.5 * 0.0) * 0.8 * 0.6 + 0.35);
    vec3 c = imgLod(uv, 1.5);
    vec3 band = imgLod(vec2(0.5 + 0.3 * sin(b * 1.7), 0.4 + 0.3 * sin(b * 0.9)), 3.5);
    float joint = smoothstep(0.0, 0.1, f) * smoothstep(1.0, 0.9, f);
    float crown = 0.8 + 0.4 * dome;
    finish(mix(c, band, 0.35) * crown * (0.5 + 0.5 * joint) * 1.15);
}
