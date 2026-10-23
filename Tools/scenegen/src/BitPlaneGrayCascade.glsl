//@doc
 * @brief BIT PLANE GRAY CASCADE: the eight Gray-code bit planes of the photo's brightness, each shifted by its own motion
 * (the finer the plane, the faster it runs), and joined again by Gray decoding.  Where the planes agree the photo stands
 * whole; where they slip it breaks into bands and clots of brightness.  At the start and end of every phrase all motions
 * die away and the photo closes up, then the planes are released again.  The photo's colours are kept.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the planes' motions die at the phrase's ends and rise between them (continuous)
 *   audioPhase      -> the planes' directions turn (integrated)
 *   audioSwell      -> the planes' reach
 *
 * Knobs: reachP (how far the planes drift), planesP (how many planes slip), hueP.
//@params reachP planesP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.3 + 2.0 * audioPhase;
    float pp = clamp(audioPhrasePos, 0.0, 1.0);
    float live = smoothstep(0.0, 0.2, min(pp, 1.0 - pp) * 2.0);
    float reach = (0.5 + 0.9 * clamp(reachP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * live;
    int nSlip = 3 + int(4.99 * clamp(planesP, 0.0, 1.0));
    float prev = 0.0;
    float rec = 0.0;
    for (int k = 1; k <= 8; ++k) {
        float fk = float(k);
        vec2 sh = (float(k >= 9 - nSlip ? 1 : 0) + 0.6) * reach * 0.03 * fk * vec2(cos(0.7 * fk + 0.3 * t), sin(0.9 * fk + 0.25 * t));
        float L = clamp(luma(imgLod(uv + sh, 0.6)), 0.0, 0.999);
        float g = step(0.5, fract(L * exp2(fk - 1.0) * 0.5 + 0.25));
        float b = k == 1 ? g : abs(prev - g);
        prev = b;
        rec += b * exp2(-fk);
    }
    rec += 0.5 / 256.0;
    vec3 c = imgLod(uv, 0.5);
    vec3 col = c * (rec / max(luma(c), 0.04));
    finish(col * 1.05);
}
