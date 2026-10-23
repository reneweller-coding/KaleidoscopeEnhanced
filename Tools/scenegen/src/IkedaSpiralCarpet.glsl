//@doc
 * @brief IKEDA SPIRAL CARPET: the Ikeda map: a laser beam in a ring resonator with spiral arms; the photo lies as a carpet that runs through the map, and the spirals form whirls of photo colours.  The map z -> 1 + u z exp(i(0.4 - 6/(1+|z|^2))) is applied a gliding number of times to the point
 * under every pixel, and the photo is read where it lands; neighbouring numbers of steps are cross-faded.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread      -> the parameter u (how strongly the arms wind) (smoothed)
 *   audioHarmAdvance -> the number of steps glides (integrated)
 *   audioAdvance     -> the phase turns
 *
 * Knobs: sizeP (the zoom), hueP.
//@params sizeP
//@audio audioSpread audioAdvance audioHarmAdvance
//@body
/**  One step of the Ikeda map.
 *
 * @param z  The complex number. (in)
 * @param u  The parameter u. (in)
 * @param ph  The phase. (in)
 *
 * @return
 *   The next point.
 **/
vec2 ikeda(vec2 z, float u, float ph)
{
    float t = 0.4 + ph - 6.0 / (1.0 + dot(z, z));
    float c = cos(t);
    float s = sin(t);
    return vec2(1.0, 0.0) + u * vec2(z.x * c - z.y * s, z.x * s + z.y * c);
}
void main()
{
    vec2 p = screenP();
    float zoom = 1.6 + 1.6 * (1.0 - clamp(sizeP, 0.0, 1.0));
    vec2 z = p * zoom + vec2(0.3, 0.0);
    float u = 0.78 + 0.14 * clamp(audioSpread, 0.0, 1.0) + 0.02 * sin(0.03 * sceneTime);
    float ph = 0.05 * sin(0.02 * audioAdvance + 0.03 * sceneTime);
    float nf = 2.0 + 5.0 * (0.5 + 0.5 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime));
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int n = 0; n < 8; ++n) {
        float w = clamp(1.0 - abs(nf - float(n)), 0.0, 1.0);
        if (w > 0.0) {
            vec3 c = imgLod(z * 0.25 + 0.5, 0.6);
            sum += c * w;
            ws += w;
        }
        z = ikeda(z, u, ph);
        z = clamp(z, vec2(-8.0), vec2(8.0));
    }
    finish(sum / max(ws, 1e-3) * 1.15);
}
