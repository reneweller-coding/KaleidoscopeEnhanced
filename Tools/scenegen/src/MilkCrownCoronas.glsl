//@doc
 * @brief MILK CROWN CORONAS: the milk crown impact: a drop hits a surface and throws up a crown of spikes; the picture shows many superposed crowns that grow from the points of impact and close again.  A jittered lattice of impacts, each with its own phase of the phrase: a ring that grows, a crown whose spikes are
 * the ring's bulges, droplets at the tips, and ripples spreading outside; the photo is the surface the crowns stand in.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the rate of the impacts (the cycle runs once over the phrase) (periodic)
 *   audioHarmAdvance -> the number of spikes glides (integrated)
 *
 * Knobs: sizeP (the spacing of the impacts), hueP.
//@params sizeP
//@audio audioPhrasePos audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.28 + 0.2 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    vec3 surf = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 col = surf * 0.8;
    float lum = 0.0;
    vec2 disp = vec2(0.0);
    float nsp = 9.0 + 4.0 * sin(0.05 * audioHarmAdvance);
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 cen = cj + 0.5 + 0.3 * (h - 0.5) * 2.0;
            float ph = fract(audioPhrasePos * 2.0 + h.x);
            float R = (0.05 + 0.5 * pow(ph, 0.6)) * 0.9;
            vec2 d = g - cen;
            float r = length(d);
            float a = atan(d.y, d.x);
            float spike = 0.5 + 0.5 * cos(nsp * a + 6.28 * h.y);
            float crown = exp(-pow((r - R) / (0.025 + 0.02 * spike), 2.0)) * (0.35 + 0.65 * spike) * (1.0 - ph);
            float tipdot = exp(-pow((r - R - 0.06 * spike) / 0.012, 2.0)) * pow(spike, 6.0) * (1.0 - ph);
            float rip = sin(36.0 * (r - R)) * exp(-3.0 * max(r - R, 0.0)) * exp(-pow(max(R - r, 0.0) * 0.0, 2.0)) * smoothstep(R * 0.9, R * 1.05, r) * (1.0 - ph) * 0.5;
            lum += crown * 1.2 + tipdot;
            disp += normalize(d + 1e-4) * rip * 0.01;
        }
    vec3 c = imgLod((p + disp) * 0.85 + 0.5, 0.6);
    c = mix(vec3(luma(c)), c, 1.2);
    vec3 col2 = c * 0.9 + vec3(1.0, 0.97, 0.9) * lum * 0.8;
    finish(col2 * 1.1);
}
