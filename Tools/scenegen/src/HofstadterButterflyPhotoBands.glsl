//@doc
 * @brief HOFSTADTER BUTTERFLY PHOTO BANDS: Hofstadter's butterfly: the spectrum of electrons in a lattice at rational magnetic flux, a fractal of bands and gaps; the picture shows the butterfly of bands in the photo's colours, and the flux wanders through the rationals.  For every pixel the nearest rational p/q
 * (q up to sixteen) is taken, and the band is drawn where the trace of the transfer matrices of Harper's equation lies in the allowed range; the photo colours the bands.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the flux window wanders through the rationals (integrated)
 *   audioSpread      -> the resolution (the largest denominator) (smoothed)
 *
 * Knobs: sizeP (the width of the flux window), hueP.
//@params sizeP
//@audio audioSpread audioHarmAdvance
//@body
/**  The trace of the product of the transfer matrices of Harper's equation for the flux p/q at an energy.
 *
 * @param E  The energy. (in)
 * @param p  The numerator of the flux. (in)
 * @param q  The denominator of the flux. (in)
 *
 * @return
 *   The trace in x.
 **/
vec2 harper(float E, float p, float q)
{
    vec2 u0 = vec2(1.0, 0.0);
    vec2 v0 = vec2(0.0, 1.0);
    vec2 U = u0;
    vec2 V = v0;
    for (int n = 0; n < 17; ++n) {
        if (float(n) >= q) break;
        float v = E - 2.0 * cos(6.2831853 * p / q * float(n));
        vec2 nU = vec2(v * U.x - U.y, U.x);
        vec2 nV = vec2(v * V.x - V.y, V.x);
        U = nU; V = nV;
    }
    return vec2(U.x + V.y, 0.0);
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float wd = 0.35 + 0.45 * clamp(sizeP, 0.0, 1.0);
    float ac = 0.5 + 0.35 * sin(0.03 * audioHarmAdvance + 0.015 * sceneTime);
    float alpha = clamp(ac + p.x / asp * wd, 0.0, 1.0);
    float E = p.y * 8.4;
    float Q = 6.0 + 10.0 * clamp(audioSpread, 0.0, 1.0);
    float bestD = 9.0;
    float bestP = 0.0;
    float bestQ = 1.0;
    for (int q = 1; q <= 16; ++q) {
        float fq = float(q);
        if (fq > Q) break;
        float pp = floor(alpha * fq + 0.5);
        float dd = abs(alpha - pp / fq);
        if (dd < bestD - 1e-5) { bestD = dd; bestP = pp; bestQ = fq; }
    }
    float tr = harper(E, bestP, bestQ).x;
    float best = 1.0 - smoothstep(3.8, 4.15, abs(tr));
    vec3 c = imgLod(vec2(alpha, p.y + 0.5) * 0.85 + 0.075, 0.8);
    c = mix(vec3(luma(c)), c, 1.45);
    float br = best * (0.55 + 0.7 * (1.0 - bestQ / 17.0));
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.08 + vec3(0.01, 0.01, 0.025);
    vec3 col = bg + c * br * 1.5;
    finish(col);
}
