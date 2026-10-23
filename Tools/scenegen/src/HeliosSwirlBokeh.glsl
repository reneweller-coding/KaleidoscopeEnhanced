//@doc
 * @brief HELIOS SWIRL BOKEH: the swirling bokeh of old lenses: the photo's bright places become discs of light that are clipped to cat's eyes towards the edge and turned round the centre, so the whole picture looks through a vortex of
 * little lenses.  Gathered from twenty-four taps on a turned and squeezed disc, weighted towards the lights; the swirl turns slowly with the harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the swirl turns with the harmony (integrated)
 *   audioSwell       -> the size of the discs
 *
 * Knobs: sizeP (the disc radius), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    vec2 uv = p * 0.8 + 0.5 + 0.04 * vec2(sin(0.07 * sceneTime), cos(0.05 * sceneTime));
    float R = (0.004 + 0.02 * clamp(sizeP, 0.0, 1.0)) * (0.3 + 1.7 * r) * (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    float sw = atan(p.y, p.x) + 1.5708 + 0.25 * audioHarmAdvance + 0.04 * sceneTime;
    float squeeze = 1.0 - 0.65 * smoothstep(0.15, 0.85, r);
    mat2 M = rot2(sw);
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 24; ++i) {
        float a = 2.39996323 * float(i);
        float rr = sqrt((float(i) + 0.5) / 24.0);
        vec2 o = M * (vec2(cos(a), sin(a) * squeeze) * rr * R);
        vec3 c = imgLod(uv + o, 0.5);
        float w = 0.2 + 5.0 * pow(luma(c), 4.0);
        sum += c * w;
        ws += w;
    }
    vec3 col = sum / ws;
    finish(col * 1.25);
}
