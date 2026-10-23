//@doc
 * @brief BIT DEPTH POSTER BANDS: bit depth: the photo loses its resolution bit by bit, the tones snap into flat areas, and the areas pass into one another in bands; the number of bits glides steadily between one and eight, and two neighbouring depths are
 * blended so no jump appears.  The rougher the music, the more noise is dithered into the steps.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the depth (full structure is eight bits)
 *   audioRoughness -> the amount of dither
 *
 * Knobs: sizeP (the softness of the steps), hueP.
//@params sizeP
//@audio audioSwell audioRoughness
//@body
/**  Soft quantisation of the three channels to L steps, with soft edges.
 *
 * @param x  The argument. (in)
 * @param L  The number of levels. (in)
 * @param soft  The softness of the steps. (in)
 *
 * @return
 *   The quantised colour.
 **/
vec3 quant(vec3 x, float L, float soft)
{
    vec3 y = x * L;
    return (floor(y) + smoothstep(0.5 - soft, 0.5 + soft, fract(y))) / L;
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5 + 0.03 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    vec3 c = imgLod(uv, 0.4);
    float bits = 1.3 + 5.5 * (0.5 + 0.5 * sin(0.06 * sceneTime + 2.0 * clamp(audioSwell, 0.0, 1.0)));
    float b0 = floor(bits);
    float fb = smoothstep(0.0, 1.0, fract(bits));
    float soft = 0.02 + 0.3 * clamp(sizeP, 0.0, 1.0);
    float dn = (hash21(floor(gl_FragCoord.xy / (resolution.y / 270.0))) - 0.5) * (0.1 + 0.8 * clamp(audioRoughness, 0.0, 1.0));
    float L0 = exp2(b0) - 1.0;
    float L1 = exp2(b0 + 1.0) - 1.0;
    vec3 q0 = quant(c + dn / L0, L0, soft);
    vec3 q1 = quant(c + dn / L1, L1, soft);
    finish(mix(q0, q1, fb) * 1.08);
}
