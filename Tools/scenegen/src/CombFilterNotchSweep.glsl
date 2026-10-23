//@doc
 * @brief COMB FILTER NOTCH SWEEP: a comb filter: the photo is laid over a delayed copy of itself, and in the picture stripes of extinction and reinforcement arise; the delay glides and the stripes run along.  Eight copies with falling weights and alternating signs make
 * a feedback comb, so edges get echoes that fade away in the direction of the delay.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the delay glides and turns (integrated)
 *   audioSwell   -> the feedback
 *
 * Knobs: sizeP (the longest delay), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float ang = 0.4 + 0.02 * audioAdvance + 0.02 * sceneTime;
    vec2 dir = vec2(cos(ang), sin(ang));
    float dl = (0.004 + 0.02 * clamp(sizeP, 0.0, 1.0)) * (0.6 + 0.4 * sin(0.05 * audioAdvance + 0.04 * sceneTime));
    float g = 0.45 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    float sgn = sin(0.07 * sceneTime + 0.04 * audioAdvance) > 0.0 ? 1.0 : -1.0;
    sgn = tanh(8.0 * sin(0.07 * sceneTime + 0.04 * audioAdvance));
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    float w = 1.0;
    for (int k = 0; k < 8; ++k) {
        sum += w * imgLod(uv - dir * dl * float(k), 0.4);
        ws += abs(w);
        w *= -g * sgn * -1.0;
        w *= 1.0;
    }
    vec3 col = sum / ws;
    col = 0.5 + (col - 0.5) * 1.6 * (sgn < 0.0 ? 1.0 : 1.0);
    vec3 base = imgLod(uv, 0.4);
    finish(mix(base, clamp(col, 0.0, 1.5), 0.85) * 1.05);
}
