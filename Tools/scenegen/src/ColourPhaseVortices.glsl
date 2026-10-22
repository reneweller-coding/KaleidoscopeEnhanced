//@doc
 * @brief COLOUR PHASE VORTICES: phase vortices made visible: round each singular point a phase runs once all the way
 * round, drawn as a spiral of light between two tones of the photo; the vortices come in pairs of opposite turn that
 * are born together out of nothing over each phrase, drift apart, circle and meet again to annihilate.  The phase is
 * the sum of the angles round the positive vortices minus those round the negative ones, plus a gentle radial winding
 * that twists the arms into spirals; a pair whose two points coincide cancels exactly, so birth and death are smooth.
 * The light dims to dark at every singular point.  Two tones of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the pairs are born over each phrase, drift apart and annihilate again (staggered)
 *   audioAdvance   -> the pairs drift and the phase runs (integrated)
 *   audioSwell     -> the light's strength
 *
 * Knobs: pairP (how many pairs), twistP (how tightly the arms wind), hueP.
//@params pairP twistP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(3.0 + 2.0 * clamp(pairP, 0.0, 1.0));
    float K = 8.0 + 14.0 * clamp(twistP, 0.0, 1.0);
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float phase = -3.0 * run, amp = 1.0;
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        vec2 c = vec2(0.65 * sin(run * (0.4 + 0.1 * fi) + 2.1 * fi), 0.35 * cos(run * (0.33 + 0.12 * fi) + 1.3 * fi));
        float s = 0.35 * sin(3.14159265 * fract(audioPhrasePos + fi / N));   // 0 at birth and at death
        float a = 0.5 * run + 1.7 * fi;
        vec2 dir = vec2(cos(a), sin(a));
        vec2 vp = c + 0.5 * s * dir, vm = c - 0.5 * s * dir;
        vec2 dp = p - vp, dm = p - vm;
        phase += atan(dp.y, dp.x) - atan(dm.y, dm.x);
        phase += 0.5 * K * (length(dp) + length(dm));                // the arms wind round both points of the pair
        amp *= smoothstep(0.0, 0.06, length(dp)) * smoothstep(0.0, 0.06, length(dm)) + (1.0 - smoothstep(0.0, 0.02, s));
    }
    float b = 0.5 + 0.5 * cos(phase);
    vec3 col = mix(famCol(fh, 0.2), famCol(fh, 0.8), b) * (0.15 + 0.7 * clamp(amp, 0.0, 1.0) * (0.4 + 0.6 * b)) * glow;
    finish(col);
}
