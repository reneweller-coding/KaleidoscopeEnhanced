//@doc
 * @brief SECTOR TIME SHEAR KALEIDO: a kaleidoscope in which every sector shows the photo at another time: sector k lags k steps behind its neighbour (and the lag runs back down again round the other half, so the ring closes), so that the
 * photo's slow movement travels round the rosette as a wave and the symmetry holds in space and not in time.  The sectors are mirrored as in any kaleidoscope; the photo drifts and turns slowly in each.  The lag follows the tempo
 * of the music (the bar's phase), the number of sectors the key (crossing over from one count to the next).
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the lag between sectors is a fraction of the bar; the movement runs with the bar
 *   audioHarmAdvance -> the number of sectors (crossing over)
 *   audioPhase      -> the photo drifts in the sectors (integrated)
 *
 * Knobs: lagP (how large the lag is), hueP.
//@params lagP
//@audio audioHarmAdvance
//@body
/**  The kaleidoscope with a given number of sectors, each at its own time.
 *
 * @param p    The pixel. (in)
 * @param n    The number of sectors (even). (in)
 * @param lag  The time lag between neighbouring sectors. (in)
 *
 * @return
 *   The colour.
 **/
vec3 timeShearKaleido(vec2 p, float n, float lag)
{
    float r = length(p), a = atan(p.y, p.x);
    float w = 6.2831853 / n;
    float k = floor(a / w);
    float fa = a - k * w;
    float fold = abs(fa - 0.5 * w);
    float lagk = lag * n * (0.5 - 0.5 * cos(6.2831853 * k / n));
    float tt = 0.5 * sceneTime + 0.4 * audioPhase - lagk;
    vec2 q = r * vec2(cos(fold), sin(fold)) * 1.4;
    vec2 pan = 0.18 * vec2(sin(0.31 * tt), cos(0.23 * tt));
    return imgLod(rot2(0.12 * tt) * q * 0.8 + 0.5 + pan, 0.7);
}
void main()
{
    vec2 p = screenP();
    float n = 2.0 * (3.0 + 4.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance)));
    float n0 = 2.0 * floor(0.5 * n);
    float lag = (0.02 + 0.06 * clamp(lagP, 0.0, 1.0)) * (1.0 + 0.4 * sin(6.2831853 * rhyBar()));
    vec3 col = mix(timeShearKaleido(p, n0, lag), timeShearKaleido(p, n0 + 2.0, lag), smoothstep(0.0, 1.0, fract(0.5 * n)));
    finish(col * 1.05);
}
