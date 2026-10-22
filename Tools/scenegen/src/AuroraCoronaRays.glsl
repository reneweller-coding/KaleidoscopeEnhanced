//@doc
 * @brief AURORA CORONA RAYS: the aurora's corona seen straight overhead: rays of light run outward from one point high in
 * the sky in every direction, and round it curtains fold and unfold, their folds following the melody.  The rays are
 * noise that changes fast round the point and slowly along each ray (the angle enters as a point on a circle, so the
 * rays close without a seam); the curtains are bands at a radius that ripples round the point, lit from within by the
 * rays and fading outward.  The light is shades of one colour family from the photo, lighter low and deeper high.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the curtains' folding: deeper folds as the melody rises (smoothed)
 *   audioSwell      -> the light's strength
 *   audioAdvance    -> the rays flow outward and the curtains turn (integrated)
 *
 * Knobs: rayP (how fine the rays are), curtainP (how many curtains), hueP.
//@params rayP curtainP
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
    float K = 14.0 + 14.0 * clamp(rayP, 0.0, 1.0);
    float NC = floor(2.0 + 2.0 * clamp(curtainP, 0.0, 1.0));
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float fold = 0.04 + 0.12 * melodyMean();
    float glow = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec2 c = vec2(0.08 * sin(0.3 * run), 0.12 + 0.05 * cos(0.23 * run));
    vec2 d = p - c;
    float r = length(d), th = atan(d.y, d.x);
    vec2 ring = vec2(cos(th), sin(th));
    float rays = noise2(ring * K + vec2(0.0, 0.3 * log(r + 0.05) - 0.5 * run));
    rays = pow(smoothstep(0.3, 0.9, rays), 1.5) * (0.6 + 0.4 * noise2(ring * 2.0 * K + 13.0));
    vec3 col = famCol(fh, 0.45) * 0.02;
    col += famLight(fh, 0.35, 0.3) * rays * exp(-r / 0.6) * 0.5 * glow;
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        if (fk >= NC) break;
        float rc = 0.22 + 0.22 * fk + fold * sin(3.0 * th + run + 1.7 * fk) + 0.5 * fold * sin(7.0 * th - 1.3 * run + fk);
        float x = (r - rc) / (0.05 + 0.02 * fk);
        float band = exp(-x * x) * (0.4 + 0.6 * rays) + 0.4 * smoothstep(0.0, -1.0, x) * exp(x * 0.8) * rays;
        col += famCol(fh, 0.25 + 0.5 * fk / NC) * band * 0.7 * glow;
    }
    col += famLight(fh, 0.5, 0.8) * exp(-r * r / 0.002) * 0.4 * glow;
    finish(col);
}
