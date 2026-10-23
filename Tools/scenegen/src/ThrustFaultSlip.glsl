//@doc
 * @brief THRUST FAULT SLIP: layers of the photo that slide along thrust faults against each other without a jump, with drag folds on the margins where the layers bend into the fault; the sliding runs in time with the bar:
 * every fault slips and returns once a bar, one after the other, so the picture is a blocks-and-layers puzzle that keeps shifting.  The slip follows the swell, the drag the phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the slip runs once a bar (continuous), each fault a little later than the last
 *   audioSwell      -> the amount of the slip
 *
 * Knobs: faultP (the number of faults), hueP.
//@params faultP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bar = rhyBar();
    float amp = 0.05 + 0.1 * clamp(audioSwell, 0.0, 1.0);
    vec2 uv = p;
    int nf = 3 + int(2.0 * clamp(faultP, 0.0, 1.0) + 0.5);
    for (int i = 0; i < 5; ++i) {
        if (i >= nf) break;
        float fi = float(i);
        float ang = 0.5 + 0.3 * sin(1.7 * fi + 0.3);
        vec2 n = vec2(-sin(ang), cos(ang));
        vec2 dir = vec2(cos(ang), sin(ang));
        float dd = dot(p, n) - (fi - 2.0) * 0.3 - 0.05 * sin(0.03 * sceneTime + fi);
        float slip = amp * (0.5 + 0.5 * sin(6.2831853 * (bar - 0.18 * fi)));
        float step0 = smoothstep(-0.05, 0.05, dd);
        float drag = 0.04 * exp(-dd * dd / 0.012) * sign(dd + 1e-4) * (0.5 + 0.5 * sin(6.2831853 * (bar - 0.18 * fi) + 1.0));
        uv += dir * (slip * step0 + drag * 0.5);
    }
    vec2 tuv = vec2(0.5 + 0.25 * sin(floor((0.5 - uv.y) * 24.0) * 1.3), uv.y * 0.8 + 0.5);
    vec3 c = mix(imgLod(uv * 0.8 + 0.5, 1.0), imgLod(tuv, 4.0), 0.3);
    float lay = fract((0.5 - uv.y) * 24.0);
    finish(c * (0.7 + 0.3 * smoothstep(0.0, 0.1, lay) * smoothstep(1.0, 0.9, lay)) * 1.15);
}
