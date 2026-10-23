//@doc
 * @brief RISO SPOT LAYERS: risograph printing with two plates and a little misregistration: the warm places of the photo go onto one plate and the cool onto the other, each plate a grainy screen, in the photo's own saturated
 * colours; the plates drift slowly against each other and overprint on cream paper.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the misregistration (the plates' offset)
 *   audioAdvance    -> the plates drift (integrated)
 *
 * Knobs: grainP (the grain's size), hueP.
//@params grainP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.05 * sceneTime + 0.4 * audioAdvance;
    float mis = 0.004 + 0.02 * clamp(audioSwell, 0.0, 1.0);
    vec2 uvA = (p + mis * vec2(cos(t), sin(0.7 * t))) * 0.8 + 0.5;
    vec2 uvB = (p - mis * vec2(cos(0.8 * t), sin(t))) * 0.8 + 0.5;
    vec3 ca = imgLod(uvA, 0.8), cb = imgLod(uvB, 0.8);
    vec3 inkA = clamp(mix(vec3(luma(ca)), ca, 2.2), 0.0, 1.0) * 0.92;
    vec3 inkB = clamp(mix(vec3(luma(cb)), cb, 2.2), 0.0, 1.0) * 0.92;
    float wA = smoothstep(-0.04, 0.16, ca.r - ca.b);
    float wB = smoothstep(-0.04, 0.16, cb.b - cb.r);
    float covA = clamp(wA * (0.3 + 1.6 * satOf(ca) + 0.7 * (1.0 - luma(ca))), 0.0, 1.0);
    float covB = clamp(wB * (0.3 + 1.6 * satOf(cb)) + smoothstep(0.55, 0.1, luma(cb)) * (1.0 - wB) * 0.9, 0.0, 1.0);
    float g = 1.0 + 2.5 * clamp(grainP, 0.0, 1.0);
    vec2 q = floor(gl_FragCoord.xy / g);
    float nA = fract(52.9829189 * fract(dot(q, vec2(0.06711056, 0.00583715))));
    float nB = fract(52.9829189 * fract(dot(q + 17.0, vec2(0.06711056, 0.00583715))));
    float mA = smoothstep(nA - 0.05, nA + 0.05, covA), mB = smoothstep(nB - 0.05, nB + 0.05, covB);
    vec3 paper = vec3(0.97, 0.94, 0.86);
    vec3 col = paper * mix(vec3(1.0), inkA, mA) * mix(vec3(1.0), inkB, mB);
    finish(col * 1.1);
}
