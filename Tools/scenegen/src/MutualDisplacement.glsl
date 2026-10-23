//@doc
 * @brief MUTUAL DISPLACEMENT: each photo pushes the other by its brightness, and both results are mixed: a double picture made of mutual deformation, the first photo's pixels slid along by the second's bright places and the second's by
 * the first's, so that the shapes of each are drawn into the other.  The pushing follows the swell of the music, the mixture (which photo leads) the phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the pushing
 *   audioPhase      -> the mixture's balance (integrated, a slow swing)
 *
 * Knobs: pushP (the base strength), hueP.
//@params pushP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float k = (0.04 + 0.1 * clamp(pushP, 0.0, 1.0)) * (0.5 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    float la = luma(imgLod(uv, 2.0)) - 0.5, lb = luma(imgB(uv, 2.0)) - 0.5;
    vec2 dA = k * lb * vec2(1.0, 0.6), dB = -k * la * vec2(0.6, 1.0);
    vec3 a = imgLod(uv + dA, 0.7), b = imgB(uv + dB, 0.7);
    float m = 0.5 + 0.35 * sin(0.3 * audioPhase + 0.05 * sceneTime);
    finish(mix(a, b, m) * 1.05);
}
