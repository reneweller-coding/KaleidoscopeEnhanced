//@doc
 * @brief METACHRONAL CILIA WAVES: a field of countless rows of beating cilia running every which way, metachronal waves
 * rolling over them -- each cilium beating a little after its neighbour, so the beats travel along the rows like wind
 * over grass -- and where a cilium sweeps through its stroke the light breaks into a fine iridescent fringe, as on a
 * comb jelly's combs.  The field is a patchwork of plates, each with its rows in its own direction; a cilium is a thin
 * line standing on its row, leaning by the wave's phase; the fringe's hue slides a little round the photo's colour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the beat (integrated): the waves roll along the rows with the music's drive
 *   audioPhrasePos -> the waves' length: they stretch and shorten over each phrase
 *   audioSwell     -> the shimmer's strength
 *
 * Knobs: rowP (the rows' spacing), patchP (the plates' size), hueP.
//@params rowP patchP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float rs = 0.045 + 0.025 * clamp(rowP, 0.0, 1.0);
    float dc = rs * 0.35;                                             // the cilia's spacing along a row
    float beat = 0.4 * sceneTime + 1.6 * audioAdvance;
    float lam = 0.08 + 0.12 * (0.5 + 0.5 * cos(6.2831853 * audioPhrasePos));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the plates: the nearest site of a jittered lattice, and how close the next one is
    float S = 0.3 + 0.2 * clamp(patchP, 0.0, 1.0);
    vec2 g = p / S, gi = floor(g);
    float d1 = 9.0, d2 = 9.0;
    vec2 best = vec2(0.0), bs = vec2(0.0);
    for (int k = 0; k < 9; ++k) {
        vec2 cell = gi + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        vec2 site = cell + 0.2 + 0.6 * hash22(cell);
        float dd = length(g - site);
        if (dd < d1) { d2 = d1; d1 = dd; best = cell; bs = site; }
        else if (dd < d2) d2 = dd;
    }
    float seam = smoothstep(0.0, 0.08, d2 - d1);
    float hc = hash21(best);
    vec2 uv = rot2(6.2831853 * hc + 0.2 * sin(0.05 * sceneTime + 6.0 * hc)) * (p - bs * S);
    float row = floor(uv.y / rs + 0.5);
    float vv = uv.y - row * rs;
    // the metachronal wave: each cilium beats a little after the one before it
    float ph = 6.2831853 * uv.x / lam - beat * (1.0 + 0.2 * hc) + 1.7 * row;
    float s = clamp((vv + 0.5 * rs) / rs, 0.0, 1.0);                // 0 at the row's base, 1 at the cilia's tips
    float u = uv.x - s * rs * 0.9 * sin(ph);                        // the lean shifts the cilium's upper part
    float du = (fract(u / dc + 0.5) - 0.5) * dc;
    float line = exp(-pow(du / 0.0024, 2.0)) * (0.35 + 0.65 * s);
    // the effective stroke: where the cilium sweeps fastest, the light breaks into a fringe
    float shimmer = smoothstep(0.55, 1.0, cos(ph - 0.5));
    vec3 fringe = hsv2rgb(vec3(fract(fh + 0.12 * sin(ph + 3.0 * s)), 0.7, 1.0));
    vec3 c = mix(famLight(fh, 0.4 + 0.2 * hc, 0.5), fringe, shimmer);
    vec3 col = famCol(fh, 0.5) * 0.03;
    col += c * line * (0.6 + 1.6 * shimmer * glow) * seam;
    col += famCol(fh, 0.45) * exp(-pow((vv + 0.5 * rs) / 0.002, 2.0)) * 0.2 * seam;   // the row's base plate
    finish(col);
}
