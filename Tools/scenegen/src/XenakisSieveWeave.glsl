//@doc
 * @brief XENAKIS SIEVE WEAVE: Xenakis' sieves: patterns of rhythm and pitch arise from superposed residue classes (modulo patterns); the picture is a weave of stripes that shine only where several sieves are open at once, with the photo as the colour.  Four sieves (two along the rows, two along
 * the columns, moduli between three and nine) are blended, and the moduli glide with the harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the moduli glide (integrated)
 *   audioAdvance     -> the phases of the sieves run on
 *
 * Knobs: sizeP (the cell size), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
float sieve(float i, float m, float ph, float w)
{
    float x = fract(i / m + ph);
    float d = min(x, 1.0 - x) * m;
    return 1.0 - smoothstep(w, w + 0.4, d);
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float C = (6.0 + 8.0 * clamp(sizeP, 0.0, 1.0)) * px;
    vec2 g = fc / C;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float t = 0.02 * audioHarmAdvance + 0.01 * sceneTime;
    float ph = 0.01 * audioAdvance;
    float m1 = 3.0 + 3.0 * (0.5 + 0.5 * sin(t));
    float m2 = 5.0 + 3.0 * (0.5 + 0.5 * sin(1.3 * t + 1.0));
    float m3 = 4.0 + 4.0 * (0.5 + 0.5 * sin(0.9 * t + 2.0));
    float m4 = 6.0 + 3.0 * (0.5 + 0.5 * sin(1.7 * t + 4.0));
    float s1 = sieve(ci.x, m1, ph, 0.9);
    float s2 = sieve(ci.x, m2, 0.31 + ph * 1.3, 0.9);
    float s3 = sieve(ci.y, m3, 0.17 - ph, 0.9);
    float s4 = sieve(ci.y, m4, 0.53 + ph * 0.7, 0.9);
    float cnt = s1 + s2 + s3 + s4;
    float lit = smoothstep(1.1, 1.9, cnt);
    vec2 uvp = (fc - 0.5 * resolution) / resolution.y * 0.85 + 0.5;
    vec3 c = imgLod(uvp, 0.5);
    float edge = smoothstep(0.0, 0.08, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec3 col = c * lit * (0.5 + 0.5 * edge) + imgLod(uvp, 2.5) * 0.1;
    finish(col * 1.3);
}
