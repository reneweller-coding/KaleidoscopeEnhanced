//@doc
 * @brief LUMA MASK INTERLEAVE: the two photos in alternating stripes, but the width of every stripe is steered by the brightness of the other photo: where the second is dark the first widens, where it is bright the second takes the
 * stripe, so the stripes bend round the shapes of the other photo and the picture is a weave of both.  The number of stripes follows the spectral spread and the stripes run with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of stripes
 *   audioPhase      -> the stripes run (integrated)
 *
 * Knobs: stripeP (how fine the stripes are), hueP.
//@params stripeP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec3 a = imgLod(uv, 0.7), b = imgB(uv, 0.7);
    float la = luma(imgLod(uv, 2.5)), lb = luma(imgB(uv, 2.5));
    float N = (18.0 + 30.0 * clamp(stripeP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    float s = p.x * N + 0.6 * audioPhase + 0.05 * sceneTime;
    float wA = clamp(0.5 + 0.7 * (la - lb), 0.08, 0.92);
    float m = smoothstep(wA + 0.04, wA - 0.04, fract(s));
    finish(mix(b, a, m) * 1.05);
}
