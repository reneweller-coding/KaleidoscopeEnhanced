//@doc
 * @brief SALP CHAIN SPIRALS: chains of transparent salps drift through dark water, curling into arcs, rings and spirals:
 * each salp a clear barrel with faint muscle bands and a glowing organ at one end, pumping as it swims, the pumping
 * running down the chain.  A chain is laid out by walking along it: every salp turns the chain's heading by its
 * curvature, which itself grows along the chain, so a strongly curled chain rolls up into a spiral and a weakly curled
 * one into a loose arc.  The salps are clear glass in shades of one colour family from the photo, their organs warm.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the chains' curl glides with the chords: arcs roll up into rings and spirals and open again
 *   audioAdvance     -> the pumping (integrated) and the chains' drift
 *   audioSwell       -> the organs' glow
 *
 * Knobs: chainP (how many chains), sizeP (the salps' size), hueP.
//@params chainP sizeP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float curl = 0.5 + 0.5 * sin(0.6 * h);
    float pump = 0.3 * sceneTime + 1.2 * audioAdvance;
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float NC = floor(4.0 + 2.0 * clamp(chainP, 0.0, 1.0));
    float sz = 0.05 + 0.025 * clamp(sizeP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float stp = 2.1 * sz;
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int c = 0; c < 6; ++c) {
        float fc = float(c);
        if (fc >= NC) break;
        vec2 pos = vec2(0.75 * sin(0.7 * drift + 2.1 * fc), 0.35 * cos(0.5 * drift + 1.3 * fc));
        float head = 6.2831853 * fract(0.37 * fc) + 0.3 * drift;
        float sgn = mod(fc, 2.0) < 0.5 ? 1.0 : -1.0;
        float k = sgn * (0.8 + 2.4 * curl) * (0.6 + 0.1 * fc) / (sz * 20.0);
        float kGrow = sgn * 0.08 * curl / (sz * sz * 400.0);
        for (int i = 0; i < 24; ++i) {
            float fi = float(i);
            head += k * stp;
            k += kGrow * stp;
            pos += stp * vec2(cos(head), sin(head));
            vec2 dv = p - pos;
            if (dot(dv, dv) > 6.0 * sz * sz) continue;
            float pumpI = 1.0 + 0.08 * sin(pump - 0.5 * fi);          // the pumping runs down the chain
            vec2 e = rot2(head) * dv / (vec2(sz, 0.55 * sz) * pumpI);
            float r = length(e);
            float inside = smoothstep(1.0, 0.9, r);
            float body = exp(-pow((r - 1.0) / 0.08, 2.0)) * 0.7 + 0.1 * inside;
            float bands = 0.15 * smoothstep(0.85, 1.0, cos(9.4 * e.x)) * inside;
            float organ = exp(-dot(e - vec2(-0.6, 0.0), e - vec2(-0.6, 0.0)) / 0.025);
            col += famLight(fh, 0.35 + 0.3 * fract(fi * 0.17), 0.4) * (body + bands);
            col += famLight(fh, 0.75, 0.5) * organ * glow * 0.9;
        }
    }
    finish(col);
}
