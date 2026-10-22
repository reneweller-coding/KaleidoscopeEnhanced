//@doc
 * @brief LUMIA WILFRED: soft folded veils of light drift on a dark screen, as in Thomas Wilfred's Lumia: sheets of
 * light turning in space so that where they fold over and are seen edge on they gather into bright creases, and where
 * they face the eye they are faint and wide; the veils fold with the melody and glow brighter as the music swells.
 * A veil is a ribbon across the screen whose middle line and width wander slowly; within it the sheet is a surface of
 * two slow waves, and it shines by how steeply it stands -- seen edge on it gathers its light into long creases; the
 * waves' phase is a slow drift plus the melody's mean pitch over the last seconds, so the folds move with the tune.  Three veils in shades of one colour family from the
 * photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the veils fold with the melody (its mean over the last seconds)
 *   audioSwell      -> the veils' glow
 *   audioAdvance    -> the veils drift (integrated)
 *
 * Knobs: veilP (the veils' width), foldP (how often they fold), hueP.
//@params veilP foldP
//@audio audioMelody[96] audioMelodyHead audioMelodyPhase audioSwell
//@body
/**  The melody's recent mean pitch, every sample weighted by a window over its age so that samples enter and leave
 * without a jump.
 *
 * @param hi  The ring's next write index. (in)
 * @param ph  The progress toward the next sample (0..1). (in)
 *
 * @return
 *   The mean (0.5 where no melody sounded).
 **/
float melodyMean(int hi, float ph)
{
    float s = 0.0, n = 0.0;
    for (int k = 0; k < 96; ++k) {
        float m = audioMelody[(hi + 95 - k) % 96];
        float w = sin(3.14159265 * clamp((float(k) + ph) / 96.0, 0.0, 1.0)) * step(0.001, m);
        s += w * m;
        n += w;
    }
    return n > 0.01 ? s / n : 0.5;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    int hi = int(audioMelodyHead * 96.0 + 0.5) % 96;
    float mel = melodyMean(hi, clamp(audioMelodyPhase, 0.0, 1.0));
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float wv = 0.18 + 0.15 * clamp(veilP, 0.0, 1.0);
    float nfold = 1.5 + 2.0 * clamp(foldP, 0.0, 1.0);
    float glow = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.015;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float x = p.x;
        float mid = 0.25 * sin(0.9 * x + run * (0.7 + 0.2 * fk) + 2.1 * fk) + 0.12 * sin(2.3 * x - run * 0.5 + fk) + (fk - 1.0) * 0.18;
        float w = wv * (0.8 + 0.4 * sin(1.7 * x + run + 3.0 * fk));
        float v = (p.y - mid) / w;
        float mask = exp(-v * v * 1.2);
        // the veil's surface: where it stands steep it is seen edge on and gathers its light into creases
        float ph = run * (0.5 + 0.15 * fk) + 6.0 * (mel - 0.5) + 1.3 * fk;
        float a1 = 2.0 * nfold, b1 = 0.8 * nfold, a2 = 1.3 * nfold, b2 = 1.7 * nfold;
        float c1 = cos(a1 * p.x + b1 * p.y + ph), c2 = cos(a2 * p.x - b2 * p.y - 0.7 * ph + 1.9 * fk);
        vec2 g = (2.0 / a1) * c1 * vec2(a1, b1) + (1.5 / a2) * c2 * vec2(a2, -b2);
        float steep = dot(g, g);
        float crease = pow(steep / (1.0 + steep), 6.0);
        vec3 c = famLight(fh, 0.25 + 0.25 * fk, 0.25 + 0.35 * crease);
        col += c * mask * (0.05 + 0.85 * crease) * glow;
    }
    finish(col);
}
