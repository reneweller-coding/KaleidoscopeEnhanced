//@doc
 * @brief GLOW DISCHARGE VEILS: a glow discharge between unseen curved electrodes: soft violet veils of light fill the
 * space, layer over layer, crossed by the discharge's striations -- dark and bright bands that travel along it in time
 * with the music, closer together as the melody rises.  The veils are soft bands round a few gently bending surfaces
 * over a faint haze; the striations are a travelling wave along the discharge's curved axis, its spacing taken from the
 * melody's recent mean.  The violet is pulled a little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the striations travel (integrated: with the music's drive)
 *   audioMelody[96] -> the striations' spacing: closer as the melody rises (smoothed)
 *   audioSwell      -> the veils' glow
 *
 * Knobs: veilP (how many veils), bandP (how dark the striations are), hueP.
//@params veilP bandP
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float vh = fract(0.78 + 0.3 * (fract(fh - 0.78 + 0.5) - 0.5));
    float NV = floor(3.0 + 2.0 * clamp(veilP, 0.0, 1.0));
    float dark = 0.4 + 0.45 * clamp(bandP, 0.0, 1.0);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float spacing = 0.05 + 0.1 * (1.0 - melodyMean());
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(vh, 0.45) * 0.06 * (0.6 + 0.8 * fbm(1.5 * p + 0.1 * drift));   // the haze
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        if (fk >= NV) break;
        float w = p.y - 0.8 * ((fk + 0.5) / NV - 0.5) + 0.12 * sin(1.3 * p.x + drift + 2.0 * fk) + 0.08 * (fbm(vec2(1.2 * p.x, fk) + 0.3 * drift) - 0.5);
        float veil = exp(-pow(w / (0.05 + 0.03 * sin(fk + drift)), 2.0));
        col += famLight(vh, 0.3 + 0.4 * fk / NV, 0.25) * veil * 0.35;
    }
    // the striations: a travelling wave along the discharge's curved axis
    float u = p.x + 0.08 * sin(2.0 * p.y + 0.5 * drift);
    float band = smoothstep(0.25, 0.75, 0.5 + 0.5 * cos(6.2831853 * (u / spacing - 0.2 * run)));
    col *= (1.0 - dark) + dark * band;
    col *= glow;
    finish(col);
}
