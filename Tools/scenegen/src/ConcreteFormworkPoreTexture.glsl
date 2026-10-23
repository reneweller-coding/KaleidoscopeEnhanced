//@doc
 * @brief CONCRETE FORMWORK PORE TEXTURE: exposed concrete: pores, formwork joints and clouds in the cement; the photo sets the tones of the clouds, and the raking light wanders.  A grid of panels with tie holes and thin joints, a cloudy tone, small round pores that are dark and have a lit lower edge, all lit by a
 * low sun that moves.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the raking light moves (integrated)
 *   audioSpread  -> the pore density (smoothed)
 *
 * Knobs: sizeP (the size of the panels), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float P = 0.35 + 0.3 * clamp(sizeP, 0.0, 1.0);
    vec2 gp = p / P;
    vec2 pi = floor(gp);
    vec2 pf = fract(gp);
    float joint = 1.0 - smoothstep(0.0, 0.012, min(min(pf.x, 1.0 - pf.x), min(pf.y, 1.0 - pf.y)));
    float tie = 1.0 - smoothstep(0.015, 0.03, length(vec2(abs(pf.x - 0.5) - 0.3, abs(pf.y - 0.5) - 0.3)));
    float cloud = fbm(p * 2.5 + vec2(3.0, 1.0)) * 0.6 + fbm(p * 7.0) * 0.4;
    vec3 c = imgLod(p * 0.85 + 0.5, 1.5);
    c = mix(vec3(luma(c)), c, 1.1);
    vec3 conc = mix(vec3(0.55, 0.55, 0.53), c * 1.1, 0.35) * (0.7 + 0.5 * cloud);
    float la = 0.02 * audioAdvance + 0.04 * sceneTime;
    vec2 ld = vec2(cos(la), sin(la));
    float dens = 0.2 + 0.4 * clamp(audioSpread, 0.0, 1.0);
    float pores = 0.0;
    float lit = 0.0;
    for (int layer = 0; layer < 2; ++layer) {
        float fl = float(layer);
        float S = 0.012 * (1.0 + 0.8 * fl);
        vec2 g = p / S + 0.3 * fl;
        vec2 gi = floor(g);
        vec2 f = fract(g) - 0.5;
        float h = hash21(gi + fl * 3.0);
        vec2 jit = (hash22(gi + 5.0) - 0.5) * 0.4;
        float r = 0.15 + 0.2 * hash21(gi + 9.0);
        float d = length(f - jit);
        float on = step(h, dens * 0.5);
        float hole = (1.0 - smoothstep(r * 0.8, r, d)) * on;
        float rim = on * smoothstep(r * 0.7, r, d) * (1.0 - smoothstep(r, r * 1.35, d));
        pores = max(pores, hole);
        lit += rim * (0.5 + 0.5 * dot(normalize(f - jit + 1e-4), -ld));
    }
    vec3 col = conc * (1.0 - 0.7 * pores) + vec3(1.0) * lit * 0.12;
    col *= 1.0 - 0.45 * joint - 0.4 * tie;
    finish(col * 1.1);
}
