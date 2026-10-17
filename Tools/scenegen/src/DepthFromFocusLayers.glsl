//@doc
 * @brief DEPTH FROM FOCUS LAYERS: a depth read off the photo's sharpness -- where it is crisp it stands near, where it
 * is soft it lies far -- and the picture lifted into that depth and seen through a slowly circling eye, by parallax
 * mapping: the crisp parts slide over the soft ones, edges reveal what lies behind them, and the flat photo becomes a
 * relief of layers floating at different distances.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the eye circles (integrated)
 *   audioSwell      -> the depth deepens
 *   audioAdvance    -> the photo drifts (integrated)
 *
 * Knobs: depthP (the base depth), focusP (how sharpness turns to depth), photoP (photo share), hueP.
//@params depthP focusP photoP
//@audio audioSwell
//@body
/**  The pseudo-depth from sharpness: the photo's local contrast against its blur, smoothed.
 *
 * @param uv     The point. (in)
 * @param gain   How sharpness turns to depth. (in)
 *
 * @return
 *   The height, 0 (far) .. 1 (near).
 **/
float focusDepth(vec2 uv, float gain)
{
    vec3 a = imgLod(uv, 1.0), b = imgLod(uv, 3.5);
    float s = length(a - b) + 0.5 * length(imgLod(uv, 2.0) - imgLod(uv, 4.5));
    return clamp(s * gain, 0.0, 1.0);
}

void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.014 * sceneTime + 0.01 * audioAdvance), cos(0.011 * sceneTime));
    vec2 uv = p * 0.5 + 0.5 + drift;
    float gain = 2.5 + 5.0 * clamp(focusP, 0.0, 1.0);
    float depth = (0.02 + 0.03 * clamp(depthP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float ang = 0.03 * audioPhase + 0.11 * sceneTime;
    vec2 view = vec2(cos(ang), sin(ang) * 0.7) + 0.4 * p;
    // parallax march: from the top of the relief down to where the ray meets it
    float layer = 1.0;
    vec2 cur = uv;
    float h = focusDepth(cur, gain);
    for (int i = 0; i < 20; ++i) {
        if (h >= layer) break;
        layer -= 0.05;
        cur += view * depth * 0.05;
        h = focusDepth(cur, gain);
    }
    vec3 col = imgLod(cur, 0.2);
    float shade = 0.65 + 0.45 * h;                              // the near layers lit, the far ones in shade
    col *= shade;
    col = mix(col, imgLod(uv, 0.0), 0.12 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.08);
}
