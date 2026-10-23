//@doc
 * @brief OOLITE CONCENTRIC GRAINS: ooids: close-packed grains of concentric shells, every shell in a colour taken from the photo, the grains growing from their cores and being overlaid by new shells at the rim; thin dark
 * seams between the grains.  The number of shells follows the spectral spread, the growth (how many shells each grain has at the moment) the swell; the shells grow outward steadily with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the number of shells
 *   audioSwell      -> the growth of the grains
 *   audioAdvance    -> the shells grow outward (integrated)
 *
 * Knobs: grainP (the grain size), hueP.
//@params grainP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float N = 4.0 + 7.0 * (1.0 - clamp(grainP, 0.0, 1.0));
    vec2 q = p * N;
    vec2 g = floor(q);
    float d1 = 9.0, d2 = 9.0;
    vec2 pt = vec2(0.0), cg = vec2(0.0);
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 gg = g + vec2(float(i), float(j));
            vec2 ptt = gg + 0.2 + 0.6 * hash22(gg);
            float d = length(q - ptt);
            if (d < d1) { d2 = d1; d1 = d; pt = ptt; cg = gg; } else if (d < d2) d2 = d;
        }
    }
    float K = 2.0 + 5.0 * clamp(audioSpread, 0.0, 1.0);
    float grow = 0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0);
    float u = d1 * K * 1.6 - 0.04 * audioAdvance - 0.01 * sceneTime + hash21(cg) * 6.0;
    float sh = floor(u), f = fract(u);
    vec3 c = imgLod((pt / N + vec2(0.04 * sin(sh * 1.9), 0.04 * cos(sh * 2.3))) * 0.8 + 0.5, 2.0);
    float rim = smoothstep(0.0, 0.1, f) * smoothstep(1.0, 0.9, f);
    float seam = smoothstep(0.0, 0.07, d2 - d1);
    float inGrain = smoothstep(grow * 0.8 + 0.3, grow * 0.8, d1);
    finish(c * (0.7 + 0.3 * rim) * (0.35 + 0.65 * seam) * (0.5 + 0.5 * inGrain) * 1.2);
}
