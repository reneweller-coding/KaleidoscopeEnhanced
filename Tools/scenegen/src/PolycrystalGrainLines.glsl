//@doc
 * @brief POLYCRYSTAL GRAIN LINES: a polycrystal: grains, each with a lattice of lines running along the direction of the photo's edges at the grain's heart, so that at the grain boundaries the lines bend away to another direction;
 * the line colour is the photo's, on a dark ground.  The grain size follows the spectral spread (bigger grains with more spread), the lattice turns with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the grain size
 *   audioPhase      -> the lattice turns (integrated)
 *
 * Knobs: lineP (how fine the lines are), hueP.
//@params lineP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float N = (4.0 + 6.0) * (1.0 - 0.5 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * N;
    vec2 g = floor(q);
    float d1 = 9.0, d2 = 9.0;
    vec2 pt = vec2(0.0);
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 gg = g + vec2(float(i), float(j));
            vec2 ptt = gg + 0.15 + 0.7 * hash22(gg);
            float d = length(q - ptt);
            if (d < d1) { d2 = d1; d1 = d; pt = ptt; } else if (d < d2) d2 = d;
        }
    }
    vec2 cuv = pt / N * 0.8 + 0.5;
    float e = 0.01;
    vec2 gr = vec2(luma(imgLod(cuv + vec2(e, 0.0), 3.0)) - luma(imgLod(cuv - vec2(e, 0.0), 3.0)),
                   luma(imgLod(cuv + vec2(0.0, e), 3.0)) - luma(imgLod(cuv - vec2(0.0, e), 3.0)));
    float ang = atan(gr.y, gr.x) + 1.5707963 + 0.15 * audioPhase + 0.4 * hash21(pt);
    float M = 22.0 + 30.0 * clamp(lineP, 0.0, 1.0);
    float s = dot(p, vec2(cos(ang), sin(ang))) * M;
    float line = smoothstep(0.5, 0.25, abs(fract(s) - 0.5) * 2.0 - 0.25 + 0.0);
    float b = smoothstep(0.0, 0.08, d2 - d1);
    vec3 c = imgLod(p * 0.8 + 0.5, 1.0);
    finish(mix(vec3(0.04) + 0.12 * imgLod(p * 0.8 + 0.5, 4.0), c * 1.3, line) * (0.5 + 0.5 * b));
}
