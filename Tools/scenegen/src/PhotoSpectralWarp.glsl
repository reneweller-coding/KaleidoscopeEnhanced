//@doc
 * @brief PHOTO SPECTRAL WARP: the photo pulled apart by its own colours -- every hue has a direction, red one way, blue
 * another, green a third, and each point of the picture is carried, step by step, along the direction of the colour
 * it meets, so the colours separate into streams that run out of the picture's coloured regions.  The compass of
 * directions turns slowly, so the streams swing round.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the compass of hues turns (integrated)
 *   audioSwell      -> how far the streams run
 *   audioAdvance    -> the photo drifts (integrated)
 *
 * Knobs: runP (the base run), saturP (how much a colour must be coloured to pull), photoP (photo share), hueP.
//@params runP saturP photoP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.015 * sceneTime + 0.01 * audioAdvance), cos(0.012 * sceneTime));
    vec2 uv = p * 0.5 + 0.5 + drift;
    float run = (0.004 + 0.008 * clamp(runP, 0.0, 1.0)) * (0.5 + 1.2 * clamp(audioSwell, 0.0, 1.0));
    float compass = 0.02 * audioPhase + 0.03 * sceneTime;
    float satMin = 0.05 + 0.3 * clamp(saturP, 0.0, 1.0);
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    vec2 x = uv;
    for (int s = 0; s < 10; ++s) {
        vec3 c = imgLod(x, 1.5);
        float h = hue_of(c), sat = satOf(c);
        float pullW = smoothstep(satMin, satMin + 0.25, sat);
        vec2 dir = vec2(cos(6.2831853 * h + compass), sin(6.2831853 * h + compass));
        x -= dir * run * pullW;                                 // back along the stream to where the colour came from
        float w = 1.0 - float(s) / 12.0;
        acc += imgLod(x, 0.3) * w;
        wsum += w;
    }
    vec3 col = acc / wsum;
    col = mix(col, imgLod(uv, 0.0), 0.2 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.08);
}
