//@doc
 * @brief MINIATURE FOCUS BAND SWEEP: the focus plane of a tilt-shift lens as a narrow band that wanders through the picture, blurred outside it and with raised saturation inside: the photo becomes a miniature, and the band turns slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the width of the sharp band
 *   audioAdvance   -> the band wanders and turns (integrated)
 *
 * Knobs: sizeP (the blur outside the band), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float a = 0.6 + 0.015 * audioAdvance + 0.03 * sceneTime;
    vec2 n = vec2(-sin(a), cos(a));
    float pos = 0.28 * sin(0.04 * sceneTime + 0.02 * audioAdvance);
    float dist = abs(dot(p, n) - pos);
    float w = 0.1 + 0.12 * clamp(audioSwell, 0.0, 1.0);
    float k = smoothstep(w, w + 0.28, dist);
    float lod = 0.3 + (1.5 + 3.5 * clamp(sizeP, 0.0, 1.0)) * k;
    vec3 c = imgLod(uv, lod);
    float g = luma(c);
    float sat = 1.0 + 0.55 * (1.0 - k);
    finish(mix(vec3(g), c, sat) * (1.1 - 0.15 * k));
}
