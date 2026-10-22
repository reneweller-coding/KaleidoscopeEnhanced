//@doc
 * @brief HERTZ DIPOLE LOOPS: the field lines of an oscillating electric dipole, as Hertz drew them: near the dipole they
 * reach from pole to pole, then they pinch off into closed loops that travel outward as waves, loop after loop, filling
 * the picture; the melody sets the frequency.  The lines are the level lines of sin^2(theta) (cos(k r - w t) / (k r) -
 * sin(k r - w t)), the classic solution, drawn at even steps a pixel and a half wide by the function's gradient; loops of
 * opposite sign take two shades of one colour family from the photo; the dipole itself glows at the centre.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the wave number: the loops are closer as the melody rises (smoothed)
 *   audioAdvance    -> the oscillation runs (integrated): the loops travel outward
 *   audioSwell      -> the lines' glow
 *
 * Knobs: lineP (how many lines), scaleP (the waves' size), hueP.
//@params lineP scaleP
//@audio audioMelody[96] audioMelodyHead audioSwell
//@body
/**  The melody's recent mean: the sounding samples of the ring, triangle-weighted toward the newest.
 *
 * @return
 *   The pitch, 0..1 (0.5 when nothing sounds).
 **/
float melodyMean()
{
    int hi = int(audioMelodyHead * 96.0);
    float s = 0.0, w = 0.0;
    for (int j = 0; j < 48; ++j) {
        float m = audioMelody[(hi + 96 - j) % 96];
        float wj = (48.0 - float(j)) * step(0.001, m);
        s += wj * m;
        w += wj;
    }
    return w > 0.0 ? s / w : 0.5;
}

/**  The dipole's field-line function.
 *
 * @param p   The place (the dipole at 0, its axis along y). (in)
 * @param k   The wave number. (in)
 * @param wt  The oscillation's phase. (in)
 *
 * @return
 *   sin^2(theta) (cos(k r - wt) / (k r) - sin(k r - wt)).
 **/
float fieldF(vec2 p, float k, float wt)
{
    float r = max(length(p), 1e-3);
    float s2 = p.x * p.x / (r * r);
    float ph = k * r - wt;
    return s2 * (cos(ph) / max(k * r, 0.35) - sin(ph));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float k = (8.0 + 10.0 * melodyMean()) / (0.7 + 0.6 * clamp(scaleP, 0.0, 1.0));
    float stp = 0.35 / (1.0 + 2.0 * clamp(lineP, 0.0, 1.0));
    float wt = 0.6 * sceneTime + 2.4 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float f = fieldF(p, k, wt);
    const float e = 0.0015;
    vec2 gr = vec2(fieldF(p + vec2(e, 0.0), k, wt) - f, fieldF(p + vec2(0.0, e), k, wt) - f) / e;
    float u = f / stp;
    float d = abs(fract(u + 0.5) - 0.5) * stp / max(length(gr), 1e-3);
    float line = exp(-pow(d / (1.5 / resolution.y), 2.0)) + 0.12 * exp(-d / (6.0 / resolution.y));
    float r = length(p);
    vec3 shade = f > 0.0 ? famLight(fh, 0.3, 0.45) : famLight(fh, 0.7, 0.45);
    vec3 col = famCol(fh, 0.45) * 0.015 + shade * line * glow * smoothstep(0.02, 0.08, r);
    col += famLight(fh, 0.5, 0.9) * exp(-r * r / 0.0006) * 0.8;        // the dipole
    finish(famExpose(col, 1.55, 1.00, 0.00, fh));
}
