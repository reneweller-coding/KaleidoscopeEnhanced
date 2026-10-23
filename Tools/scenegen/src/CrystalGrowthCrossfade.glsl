//@doc
 * @brief CRYSTAL GROWTH CROSSFADE: from seeds, crystals of the second photo grow in the first, the Voronoi cells filling from their seeds outward with a bright growth front; in the first half of the phrase the second photo takes the picture,
 * and at the end of it every cell is the second, before the first grows back out of its seeds in the second half.  The cells start at different moments, so the front is ragged.  The number of cells follows the spectral spread, the glow of the front
 * the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the growth (the second photo in the first half of the phrase, the first in the second)
 *   audioSpread     -> the number of crystals
 *   audioSwell      -> the glow of the growth front
 *
 * Knobs: cellP (the crystal size), hueP.
//@params cellP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float N = (5.0 + 6.0 * clamp(cellP, 0.0, 1.0)) * (0.85 + 0.3 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * N;
    vec2 g = floor(q);
    float d1 = 9.0, d2 = 9.0;
    vec2 pt = vec2(0.0);
    vec2 cg = vec2(0.0);
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 gg = g + vec2(float(i), float(j));
            vec2 ptt = gg + 0.15 + 0.7 * hash22(gg);
            float d = length(q - ptt);
            if (d < d1) { d2 = d1; d1 = d; pt = ptt; cg = gg; } else if (d < d2) d2 = d;
        }
    }
    float ph = rhyPhrase() * 2.0;
    float u = fract(ph);
    float first = ph < 1.0 ? 1.0 : 0.0;
    float h = hash21(cg + 7.3);
    float rc = clamp((u - 0.45 * h) / (1.0 - 0.45 * h), 0.0, 1.0) * 1.25;
    float dr = rc - d1;
    float grown = smoothstep(-0.02, 0.02, dr);
    float m = first > 0.5 ? grown : 1.0 - grown;
    float front = exp(-pow(dr / 0.06, 2.0)) * smoothstep(0.0, 0.05, rc) * smoothstep(1.25, 1.1, rc);
    float edge = smoothstep(0.0, 0.06, d2 - d1);
    vec3 col = mix(imgLod(uv, 0.7), imgB(uv, 0.7), m);
    col *= 0.6 + 0.4 * edge;
    col += front * (0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * mix(col, vec3(1.0), 0.5);
    finish(col * 1.08);
}
