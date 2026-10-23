//@doc
 * @brief FROSTED GLASS FOCUS RACK: ground glass that goes from clear to opaque with distance: the photo shows only where the pane touches it and blurs behind; the point of
 * contact wanders slowly over the picture and the grain of the glass breaks the sharp area into a soft speckle.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the contact point follows the melody (smoothed)
 *   audioPhase      -> the point drifts (integrated)
 *   audioSwell      -> how far the clear area reaches
 *
 * Knobs: frostP (the base frost), hueP.
//@params frostP
//@audio audioSwell audioMelodyPitch
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.08 + 0.6 * audioPhase;
    vec2 c = vec2(0.5 * sin(0.7 * t), 0.3 * sin(0.5 * t + 1.0)) + vec2(0.0, 0.15 * (clamp(audioMelodyPitch, 0.0, 1.0) - 0.5));
    float reach = 0.28 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    float d = length(p - c) / reach;
    float lod = 0.3 + (2.0 + 4.0 * clamp(frostP, 0.0, 1.0)) * smoothstep(0.0, 1.4, d);
    vec2 g = (vec2(noise2(p * 90.0), noise2(p * 90.0 + 7.0)) - 0.5) * 0.02 * smoothstep(0.1, 1.2, d) * (0.5 + clamp(frostP, 0.0, 1.0));
    vec3 col = imgLod(uv + g, lod);
    col = mix(col, vec3(luma(col)) * 1.05 + 0.04, 0.25 * smoothstep(0.5, 1.6, d));
    finish(col * 1.05);
}
