//@doc
 * @brief ALTERNATING WEDGE KALEIDO: a kaleidoscope whose wedges show the first and the second photo by turns, so that every seam is a contrast between the two; the wedges are mirrored as in any kaleidoscope, and their number changes
 * by gliding (the picture crosses over from one count to the next as the key changes).  The wedges turn with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of wedges (crossing over, 6 to 16)
 *   audioPhase      -> the turn (integrated)
 *
 * Knobs: zoomP (the zoom into the photos), hueP.
//@params zoomP
//@audio audioHarmAdvance
//@body
/**  The picture with a given number of wedges.
 *
 * @param p  The pixel. (in)
 * @param n  The wedges (even). (in)
 *
 * @return
 *   The colour.
 **/
vec3 wedges(vec2 p, float n)
{
    float r = length(p), a = atan(p.y, p.x) + 0.08 * audioPhase + 0.01 * sceneTime;
    float w = 6.2831853 / n;
    float s = floor(a / w);
    float fa = a - s * w;
    float fold = abs(fa - 0.5 * w);
    vec2 q = r * vec2(cos(fold), sin(fold)) * (0.6 + 0.8 * clamp(zoomP, 0.0, 1.0));
    vec2 uv = q * 0.8 + 0.5;
    float par = mod(s, 2.0);
    return par < 0.5 ? imgLod(uv, 0.7) : imgB(uv, 0.7);
}
void main()
{
    vec2 p = screenP();
    float n = 2.0 * (3.0 + 5.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance)));
    float n0 = 2.0 * floor(0.5 * n);
    finish(mix(wedges(p, n0), wedges(p, n0 + 2.0), smoothstep(0.0, 1.0, fract(0.5 * n))) * 1.05);
}
