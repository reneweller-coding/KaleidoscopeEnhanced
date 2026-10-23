//@doc
 * @brief TUNING FORK BEAT MOIRE: two almost equal tuning forks make a beat; in the picture two gratings of almost equal pitch lie on top of each other, and their moiré pulses with the difference.  The photo is the surface through which both gratings are seen; the detuning follows the roughness, and the
 * gratings turn slowly against each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> the detuning of the second grating (glides)
 *   audioAdvance   -> the gratings turn and run (integrated)
 *
 * Knobs: sizeP (the grating pitch), hueP.
//@params sizeP
//@audio audioRoughness audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float f1 = 30.0 + 40.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float det = 0.02 + 0.07 * clamp(audioRoughness, 0.0, 1.0);
    float a1 = 0.02 * audioAdvance + 0.03 * sceneTime;
    float a2 = a1 + 0.05 + 0.04 * sin(0.05 * sceneTime);
    float g1 = 0.5 + 0.5 * cos(6.2831853 * f1 * dot(p, vec2(cos(a1), sin(a1))) + 0.4 * sceneTime);
    float g2 = 0.5 + 0.5 * cos(6.2831853 * f1 * (1.0 + det) * dot(p, vec2(cos(a2), sin(a2))) - 0.3 * sceneTime);
    float T = smoothstep(0.15, 0.6, g1) * smoothstep(0.15, 0.6, g2);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.5);
    vec3 col = c * (0.12 + 1.0 * T) + imgLod(p * 0.85 + 0.5, 3.0) * 0.1;
    finish(col * 1.25);
}
