//@doc
 * @brief PHOTO PHASE QUASICRYSTAL: five, seven or nine plane waves added into a quasicrystal, and the photo's brightness shifts the
 * phase of every wave: the picture appears as dislocations and faults of the pattern, drawn in the photo's own colours.  The
 * number of waves glides between five and nine as extra waves fade in.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of waves glides from five to nine with the harmony (integrated)
 *   audioAdvance    -> the waves' phase runs on (integrated)
 *   audioSwell      -> how far the photo shifts the phase
 *
 * Knobs: pitchP (the waves' wavelength), hueP.
//@params pitchP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float K = 6.2831853 * (5.0 + 8.0 * clamp(pitchP, 0.0, 1.0));
    float nf = 5.0 + 4.0 * (0.5 - 0.5 * cos(0.3 * audioHarmAdvance));
    float A = 6.2831853 * (0.5 + 1.8 * clamp(audioSwell, 0.0, 1.0));
    float S = 0.0, ws = 0.0;
    for (int j = 0; j < 9; ++j) {
        float w = clamp(nf - float(j), 0.0, 1.0);
        float a = 3.14159265 * float(j) / nf + 0.02 * t;
        vec2 k = K * vec2(cos(a), sin(a));
        vec2 uvj = uv + 0.0 * k;
        float L = luma(imgLod(uvj, 2.0 + 0.0));
        S += w * cos(dot(k, p) + A * L - 0.6 * t * float(j + 1) * 0.3);
        ws += w;
    }
    S /= max(ws, 1.0);
    vec3 c = imgLod(uv, 0.5);
    vec3 col = c * (0.35 + 1.0 * smoothstep(-0.5, 0.9, S * 1.4));
    finish(col);
}
