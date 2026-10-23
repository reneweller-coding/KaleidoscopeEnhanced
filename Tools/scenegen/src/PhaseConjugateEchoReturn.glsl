//@doc
 * @brief PHASE CONJUGATE ECHO RETURN: phase conjugation: a wave that returns to its source as a mirror image in time and removes all distortions; the picture shows a distorted photo that clears on the return.  A distortion field (a few low waves and noise) bends the photo, its strength follows a triangular course over the
 * phrase (distorting on the way out, clearing on the way back), and a ring wave marks the turning point.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the return: the distortion rises and falls with the phrase (periodic)
 *   audioAdvance   -> the distortion field itself drifts (integrated)
 *
 * Knobs: sizeP (the size of the distortion), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    float tau = audioPhrasePos;
    float s = 1.0 - abs(2.0 * tau - 1.0);
    float A = 0.04 + 0.16 * clamp(sizeP, 0.0, 1.0);
    float sc = 2.0 + 3.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    vec2 D = vec2(fbm(p * sc + vec2(t, 0.0)), fbm(p * sc + vec2(5.0, -t))) - 0.5;
    D += 0.25 * vec2(sin(3.0 * p.y + t * 3.0), cos(3.0 * p.x - t * 2.0));
    vec2 uv = p * 0.85 + 0.5 + A * D * 2.0 * s;
    vec3 c = imgLod(uv, 0.5 + 1.5 * s);
    float R = 0.8 * s;
    float ring = exp(-pow((length(p) - R) / 0.02, 2.0)) * smoothstep(0.0, 0.05, s);
    float clear = 1.0 - s;
    vec3 col = c * (0.9 + 0.2 * clear) + vec3(0.8, 0.9, 1.0) * ring * 0.2;
    finish(col * 1.1);
}
