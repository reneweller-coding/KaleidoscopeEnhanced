//@doc
 * @brief ANTISYMMETRY NEGATIVE KALEIDO: colour-changing symmetry (antisymmetry): a kaleidoscope in which every mirroring also turns the photo into its negative, so that the cells stand in turn positive and negative like Escher's
 * black-and-white patterns, only with all the colours of the photo.  The strength of the reversal glides with the swell, from the plain photo to the full negative; the number of cells follows the key and the turning the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the reversal (from positive to negative, continuously)
 *   audioHarmAdvance -> the number of cells (crossing over)
 *   audioPhase      -> the turning (integrated)
 *
 * Knobs: zoomP (the zoom into the photo), hueP.
//@params zoomP
//@audio audioSwell audioHarmAdvance
//@body
/**  The antisymmetric kaleidoscope with a given number of cells.
 *
 * @param p  The pixel. (in)
 * @param n  The number of cells (even). (in)
 *
 * @return
 *   The colour.
 **/
vec3 antiKaleido(vec2 p, float n)
{
    float r = length(p), a = atan(p.y, p.x) + 0.08 * audioPhase + 0.01 * sceneTime;
    float w = 6.2831853 / n;
    float k = floor(a / w);
    float fa = a - k * w;
    float fold = abs(fa - 0.5 * w);
    vec2 q = r * vec2(cos(fold), sin(fold)) * (0.8 + 0.9 * clamp(zoomP, 0.0, 1.0));
    vec3 c = imgLod(q * 0.8 + 0.5, 0.7);
    float par = mod(k, 2.0);
    float amt = 0.15 + 0.85 * clamp(audioSwell, 0.0, 1.0);
    return mix(c, vec3(1.0) - c, par * amt);
}
void main()
{
    vec2 p = screenP();
    float n = 2.0 * (3.0 + 4.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance)));
    float n0 = 2.0 * floor(0.5 * n);
    finish(mix(antiKaleido(p, n0), antiKaleido(p, n0 + 2.0), smoothstep(0.0, 1.0, fract(0.5 * n))) * 1.05);
}
