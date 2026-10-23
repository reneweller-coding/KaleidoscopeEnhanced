//@doc
 * @brief POLLEN TUBE GROWTH TIPS: pollen tubes: tubes grow from pollen grains through the tissue towards the ovules, with a calcium pulse at the tip; the photo is the tissue, and the tubes grow with the advance and branch.  Fourteen tubes rise from the lower edge on wavy paths, each growing to its tip (and then
 * restarting from the bottom, slowly faded), a branch splits off higher up, and a ring of light pulses at every tip.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the tubes grow (integrated)
 *   audioSwell   -> the growth rate (the length reached) and the pulse
 *
 * Knobs: sizeP (the thickness of the tubes), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec3 tissue = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 col = tissue * 0.5;
    float g = 0.012 * audioAdvance + 0.018 * sceneTime;
    float th = 0.004 + 0.006 * clamp(sizeP, 0.0, 1.0);
    float swl = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    for (int k = 0; k < 14; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 6.1));
        float x0 = (h.x - 0.5) * asp * 0.95;
        float cyc = fract(g * (0.6 + 0.6 * h.y) + h.x);
        float ytip = -0.5 + 1.15 * cyc * swl + 0.0;
        float ph = 6.2831853 * h.y;
        float kx = 3.0 + 4.0 * h.x;
        float y = p.y;
        float xc = x0 + 0.07 * sin(kx * y + ph) + 0.03 * sin(2.3 * kx * y + 2.0 * ph);
        float ybr = -0.5 + 0.55 * (0.3 + 0.5 * h.x);
        float xb = xc + (y > ybr ? 0.35 * (h.y - 0.5) * (y - ybr) : 0.0);
        float d = abs(p.x - xc);
        float on = step(-0.5, y) * step(y, ytip);
        float db = abs(p.x - xb);
        float onb = step(ybr, y) * step(y, ytip) * (y > ybr ? 1.0 : 0.0);
        float tube = (1.0 - smoothstep(th * 0.6, th, d)) * on;
        tube = max(tube, (1.0 - smoothstep(th * 0.5, th * 0.8, db)) * onb * step(0.5, h.y + 0.2));
        float tipd = length(vec2(p.x - (xc + (y > ybr ? 0.0 : 0.0)), p.y - ytip));
        float tip = exp(-tipd * tipd / 0.0004);
        float ring = (1.0 - smoothstep(0.0, 0.01, abs(tipd - 0.03 - 0.02 * sin(6.0 * g * 3.0 + fk)))) * 0.5;
        vec3 tc = mix(vec3(luma(tissue)), tissue, 1.4) * 1.5 + 0.1;
        col = mix(col, tc, tube * 0.85);
        col += vec3(1.0, 0.9, 0.5) * (tip + ring * step(p.y, ytip + 0.05)) * 0.7 * swl;
    }
    finish(col);
}
