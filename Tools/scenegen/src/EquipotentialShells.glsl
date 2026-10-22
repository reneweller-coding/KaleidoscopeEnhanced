//@doc
 * @brief EQUIPOTENTIAL SHELLS: the equipotential surfaces of wandering charges, cut by the picture's plane, as thin
 * glowing shells: nested rings round each charge that bulge toward their neighbours, merge round charges of one sign
 * and squeeze apart between opposite ones, all flowing as the charges move; the number of charges follows the chord.
 * The potential is the sum of q / r over the charges (softened at the charges themselves); its level lines are drawn
 * at even steps of a compressed potential (asinh), so the shells near a charge and far from it are spaced alike, each
 * a pixel and a half wide by the gradient.  Positive and negative shells take two shades of one colour family from
 * the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> the number of charges: one for each strongly sounding note (each fades in and out)
 *   audioAdvance    -> the charges wander (integrated)
 *   audioSwell      -> the shells' glow
 *
 * Knobs: shellP (how close the shells lie), spreadP (how far the charges roam), hueP.
//@params shellP spreadP
//@audio audioChroma[12] audioSwell
//@body
/**  The compressed potential of the charges.
 *
 * @param p       The place. (in)
 * @param n       The number of charges (fractional: the last fades in). (in)
 * @param run     The charges' wandering. (in)
 * @param spread  How far they roam. (in)
 *
 * @return
 *   asinh of the potential.
 **/
float potential(vec2 p, float n, float run, float spread)
{
    float phi = 0.0;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        float w = clamp(n - fi, 0.0, 1.0);
        if (w <= 0.0) break;
        vec2 c = spread * vec2(0.75 * sin(run * (0.5 + 0.13 * fi) + 2.1 * fi), 0.4 * cos(run * (0.4 + 0.11 * fi) + 1.3 * fi));
        float q = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
        phi += w * q * 0.1 / sqrt(dot(p - c, p - c) + 0.0004);
    }
    return log(phi + sqrt(phi * phi + 1.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float nl = 0.0;
    for (int k = 0; k < 12; ++k) nl += smoothstep(0.45, 0.75, audioChroma[k]);
    float n = clamp(nl + 2.0, 3.0, 6.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float spread = 0.8 + 0.3 * clamp(spreadP, 0.0, 1.0);
    float stp = 0.12 + 0.12 * clamp(shellP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float f = potential(p, n, run, spread);
    const float e = 0.0015;
    vec2 gr = vec2(potential(p + vec2(e, 0.0), n, run, spread) - f, potential(p + vec2(0.0, e), n, run, spread) - f) / e;
    float u = f / stp;
    float d = abs(fract(u + 0.5) - 0.5) * stp / max(length(gr), 1e-3);
    float line = exp(-pow(d / (1.5 / resolution.y), 2.0)) + 0.15 * exp(-d / (6.0 / resolution.y));
    vec3 shade = f > 0.0 ? famLight(fh, 0.3, 0.4) : famLight(fh, 0.7, 0.4);
    vec3 col = famCol(fh, 0.45) * 0.015 + shade * line * glow;
    col += famCol(fh, f > 0.0 ? 0.3 : 0.7) * 0.06 * smoothstep(0.5, 2.5, abs(f));   // a faint fill near the charges
    finish(famExpose(col, 3.33, 0.70, 0.03, fh));
}
