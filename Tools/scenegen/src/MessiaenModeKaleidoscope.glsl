//@doc
 * @brief MESSIAEN MODE KALEIDOSCOPE: the modes of limited transposition: symmetric scales such as the whole tone scale or the diminished scale repeat themselves after a few transpositions; the picture is a kaleidoscope whose fold count equals the number of transpositions (2, 3, 4, 6), and the photo
 * sits in every segment.  The fold count changes by crossfading two neighbouring layers, and the whole turns slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mode changes: the fold counts cross-fade (integrated)
 *   audioAdvance     -> the kaleidoscope turns
 *
 * Knobs: sizeP (the zoom into the photo), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
vec3 kal(vec2 p, float N, float rot, float zoom)
{
    float r = length(p);
    float a = atan(p.y, p.x) - rot;
    float w = 6.2831853 / N;
    float af = abs(mod(a, w) - 0.5 * w);
    vec2 q = r * vec2(cos(af), sin(af));
    return imgLod(q * zoom + 0.5 + 0.06 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime)), 0.5);
}
void main()
{
    vec2 p = screenP();
    float rot = 0.03 * audioAdvance + 0.02 * sceneTime;
    float zoom = 0.7 + 0.5 * clamp(sizeP, 0.0, 1.0);
    float ph = 0.05 * audioHarmAdvance + 0.015 * sceneTime;
    vec4 Ns = vec4(2.0, 3.0, 4.0, 6.0);
    int i0 = int(mod(floor(ph), 4.0));
    int i1 = int(mod(floor(ph) + 1.0, 4.0));
    float f = smoothstep(0.15, 0.85, fract(ph));
    vec3 a = kal(p, Ns[i0] * 2.0, rot, zoom);
    vec3 b = kal(p, Ns[i1] * 2.0, rot, zoom);
    finish(mix(a, b, f) * 1.1);
}
