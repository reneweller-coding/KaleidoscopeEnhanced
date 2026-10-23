//@doc
 * @brief TONAL RANGE ORRERY: the photo split into shadows, midtones and highlights, and each range read from a place that
 * circles its own centre, the three orbits in golden ratios so they almost never coincide; only at the turn of a phrase do
 * all three come to rest and the photo stands whole.  The colours are the photo's.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the orbits' phases (integrated)
 *   audioPhrasePos  -> the radii close at the phrase's turn so the photo stands whole on the one
 *   audioSwell      -> the orbits' radius
 *
 * Knobs: radiusP (the orbits' radius), hueP.
//@params radiusP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.3 + 2.0 * audioPhase;
    float pp = clamp(audioPhrasePos, 0.0, 1.0);
    float close = smoothstep(0.0, 0.12, min(pp, 1.0 - pp));
    float R = (0.04 + 0.1 * clamp(radiusP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * close;
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int j = 0; j < 3; ++j) {
        float fj = float(j);
        float w = 0.3 * pow(1.618034, fj);
        vec2 o = R * vec2(cos(w * t + 2.0 * fj), sin(w * t * 1.1 + 2.0 * fj));
        vec3 c = imgLod(uv + o, 0.4);
        float L = luma(c);
        float m = j == 0 ? 1.0 - smoothstep(0.18, 0.5, L) : (j == 1 ? max(0.0, 1.0 - abs(L - 0.5) * 4.0) : smoothstep(0.5, 0.82, L));
        m += 0.02;
        sum += c * m;
        ws += m;
    }
    finish(sum / ws * 1.05);
}
