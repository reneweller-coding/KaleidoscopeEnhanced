//@doc
 * @brief WOODBLOCK BOKASHI: a woodcut print in the Japanese manner: blocks of colour with the grain of the wood and soft gradations (bokashi), slightly out of register with one
 * another; the colour blocks drift.  The photo gives the blocks: its brightness cut into a few steps, each step in the photo's colour there.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the misregistration of the blocks
 *   audioAdvance    -> the blocks drift (integrated)
 *
 * Knobs: stepsP (how many blocks), hueP.
//@params stepsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.05 * sceneTime + 0.4 * audioAdvance;
    float S = 3.0 + 4.0 * clamp(stepsP, 0.0, 1.0);
    float mis = 0.003 + 0.012 * clamp(audioSwell, 0.0, 1.0);
    vec3 acc = vec3(1.0);
    vec3 paper = vec3(0.95, 0.91, 0.82);
    vec3 col = paper;
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        vec2 off = mis * vec2(cos(t + 1.7 * fk), sin(0.8 * t + 2.3 * fk));
        vec2 uv = (p + off) * 0.8 + 0.5;
        vec3 c = imgLod(uv, 2.0);
        float L = luma(c) * S;
        float band = floor(L);
        float grad = fract(L);
        float grain = 0.88 + 0.2 * noise2(vec2(p.x * 4.0 + fk, p.y * 160.0 + t));
        float cover = k == 0 ? smoothstep(2.0, 0.0, L) : (k == 1 ? smoothstep(0.0, 1.5, S - L) * 0.7 : (k == 2 ? smoothstep(0.5, 2.5, L) * smoothstep(S, 1.0, L) : smoothstep(S - 2.0, S, L) * 0.6));
        vec3 ink = c * 0.9 + 0.1 * vec3(0.2 * fk);
        col *= mix(vec3(1.0), ink * grain, clamp(cover * (0.5 + 0.5 * grad), 0.0, 1.0));
    }
    finish(col * 1.35);
}
