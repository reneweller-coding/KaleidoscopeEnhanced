//@doc
 * @brief DETAIL TIDE BREAKDOWN: the photo's level of detail follows the arc of the music's energy: in a break it blurs into broad fields of colour (the coarse levels of the pyramid), with the build-up the detail comes back,
 * and in the drop it is sharp down to the grain.  The tide is the slow energy (arousal, swell and build-up), never a raw signal, so the picture sharpens and softens like breathing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioArousal    -> the slow level of the energy
 *   audioSwell      -> the swell on top of it
 *   audioBuildUp    -> the sharpening toward the drop
 *
 * Knobs: depthP (how deep the blur goes), hueP.
//@params depthP
//@audio audioArousal audioSwell audioBuildUp
//@body
void main()
{
    vec2 p = screenP();
    float E = clamp(0.2 + 0.55 * clamp(audioArousal, 0.0, 1.0) + 0.5 * clamp(audioSwell, 0.0, 1.0) + 0.45 * clamp(audioBuildUp, 0.0, 1.0), 0.0, 1.0);
    float lod = (3.0 + 4.0 * clamp(depthP, 0.0, 1.0)) * (1.0 - E);
    vec2 uv = (p + 0.03 * vec2(sin(0.06 * sceneTime + 0.1 * audioAdvance), cos(0.05 * sceneTime))) * 0.8 + 0.5;
    vec3 c = imgLod(uv, lod);
    float grain = (hash21(gl_FragCoord.xy + 17.0 * fract(sceneTime)) - 0.5) * 0.12 * smoothstep(0.6, 1.0, E);
    finish(c * (0.9 + 0.2 * E) + grain);
}
