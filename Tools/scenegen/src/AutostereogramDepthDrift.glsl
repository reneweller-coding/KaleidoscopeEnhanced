//@doc
 * @brief AUTOSTEREOGRAM DEPTH DRIFT: a random-dot stereogram, the "magic eye": the photo's brightness is the hidden depth, encoded in a repeating random pattern; with relaxed eyes the photo stands out as relief, and the random pattern itself drifts slowly
 * sideways, so the relief stays while its dots flow.  Each pixel looks back by one pattern period, corrected by the depth, until it lands in the first strip.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the depth spread (how far the relief stands out)
 *   audioAdvance     -> the dot pattern drifts (integrated)
 *   audioHarmAdvance -> the colour of the noise follows the key
 *
 * Knobs: sizeP (the period of the pattern), hueP.
//@params sizeP
//@audio audioSwell audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float T = (22.0 + 25.0 * clamp(sizeP, 0.0, 1.0)) * px;
    float k = T * (0.14 + 0.1 * clamp(audioSwell, 0.0, 1.0));
    float pos = fc.x;
    for (int i = 0; i < 40; ++i) {
        if (pos < T) break;
        vec2 pc = vec2(pos, fc.y);
        float d = luma(imgLod((pc - 0.5 * resolution) / resolution.y * 0.8 + 0.5, 3.0));
        pos -= T - k * (d - 0.5);
    }
    float drift = 0.6 * sceneTime + 0.5 * audioAdvance;
    vec2 g = vec2(pos + drift, fc.y);
    float h = hash21(floor(g / (1.5 * px)));
    float h2 = hash21(floor(g / (1.5 * px)) + 17.0);
    vec3 pal = hsv2rgb(vec3(fract(0.08 * audioHarmAdvance + 0.55 * h2), 0.55, 1.0));
    vec3 col = pal * (0.25 + 0.9 * h);
    finish(col);
}
