//@doc
 * @brief EXPOSURE BRACKET GHOSTS: three exposures (minus two, zero and plus two stops) of the same photo are merged to an HDR with a small, slowly orbiting offset, so that every edge has ghosts in three brightnesses.  The merge weights are the
 * well-exposedness of each pixel, as in exposure fusion.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the offset of the three exposures orbits (integrated)
 *   audioSpread  -> the spacing of the exposures
 *
 * Knobs: sizeP (the offset), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.02 * audioAdvance + 0.12 * sceneTime;
    float off = 0.006 + 0.02 * clamp(sizeP, 0.0, 1.0);
    float stops = 1.4 + 1.2 * clamp(audioSpread, 0.0, 1.0);
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int e = -1; e <= 1; ++e) {
        float fe = float(e);
        vec2 o = off * vec2(cos(t + 2.1 * fe), sin(t + 2.1 * fe));
        vec3 c = clamp(imgLod(uv + o, 0.3) * exp2(fe * stops), 0.0, 1.0);
        float l = luma(c);
        float w = exp(-pow(l - 0.65, 2.0) / 0.1) + 0.03;
        sum += c * w;
        ws += w;
    }
    vec3 base = imgLod(uv, 0.3);
    finish(mix(base, sum / ws, 0.6) * 1.1);
}
