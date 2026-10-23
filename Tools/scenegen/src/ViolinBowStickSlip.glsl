//@doc
 * @brief VIOLIN BOW STICK SLIP: the violin bow: sticking and slipping of the string produces the Helmholtz motion, a sawtooth wave; the photo is pushed over the surface in strips that stick and slip, without anything jolting (the teeth are soft).  Each strip follows a smooth sawtooth built from six
 * harmonics, with its own phase, and the photo is drawn along with it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the bow speed: the sawtooth's phase runs (integrated)
 *   audioSwell   -> the bow pressure: the amplitude of the sticking
 *
 * Knobs: sizeP (the number of strips), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
float helm(float ph)
{
    float s = 0.0;
    for (int n = 1; n <= 6; ++n) s += sin(6.2831853 * float(n) * ph) / float(n);
    return 0.5 - s / 3.1415927;
}
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float N = 14.0 + 30.0 * clamp(sizeP, 0.0, 1.0);
    float row = floor(q.y * N);
    float fy = fract(q.y * N);
    float h = hash21(vec2(row, 3.0));
    float ph = 0.015 * audioAdvance + 0.02 * sceneTime + h;
    float A = 0.05 + 0.1 * clamp(audioSwell, 0.0, 1.0);
    float off = A * (helm(ph) - 0.5) * 2.0;
    vec2 p = vec2((q.x - 0.5) * resolution.x / resolution.y + off, (q.y - 0.5));
    vec3 c = imgLod(p * 0.85 + 0.5, 0.5);
    float edge = smoothstep(0.0, 0.08, fy) * (1.0 - smoothstep(0.92, 1.0, fy));
    float sheen = 0.9 + 0.2 * (1.0 - abs(2.0 * fy - 1.0));
    finish(c * (0.5 + 0.5 * edge) * sheen * 1.1);
}
