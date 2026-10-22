//@doc
 * @brief VENUS GIRDLE RIBBONS: long transparent ribbons -- Venus' girdles, the ribbon-shaped comb jellies -- drift across
 * the dark, waving and winding round one another, their edges lined with a fine iridescent fringe.  A ribbon is a wide
 * band along a curve whose waves come from the melody (the smoothed pitches of the last moments laid along it); it
 * twists as it goes, narrowing where it turns its edge to the eye, and its two edges shine while its clear body barely
 * shows.  Pairs of ribbons share a path and cross as their twists differ.  The ribbons are shades of one colour family
 * from the photo; the fringe's hue slides a little round it, more with brighter sound.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the ribbons' waves follow the melody (smoothed over eight ages)
 *   audioRolloff    -> the shimmer of the edges: brighter sound, wider fringe colours
 *   audioAdvance    -> the ribbons drift and twist (integrated)
 *
 * Knobs: ribbonP (how many ribbons), waveP (how far the melody waves them), hueP.
//@params ribbonP waveP
//@audio audioMelody[96] audioMelodyHead audioRolloff
//@body
vec4 gMelA = vec4(0.5);    // the melody at ages 0..3, smoothed
vec4 gMelB = vec4(0.5);    // the melody at ages 4..7

/**  The melody at eight ages: triangle-weighted means over the ring, the sounding samples only.
 **/
void melodyControls()
{
    int hi = int(audioMelodyHead * 96.0);
    float g[8];
    for (int k = 0; k < 8; ++k) {
        float s = 0.0, w = 0.0;
        for (int j = 0; j < 12; ++j) {
            int age = k * 12 + j;
            float m = audioMelody[(hi + 96 - age) % 96];
            float wj = (6.5 - abs(float(j) - 5.5)) * step(0.001, m);
            s += wj * m;
            w += wj;
        }
        g[k] = w > 0.0 ? s / w : 0.5;
    }
    gMelA = vec4(g[0], g[1], g[2], g[3]);
    gMelB = vec4(g[4], g[5], g[6], g[7]);
}

/**  The smoothed melody at one of the eight ages.
 *
 * @param i  The age's number, 0..7. (in)
 *
 * @return
 *   The pitch.
 **/
float melAge(int i)
{
    vec4 v = i < 4 ? gMelA : gMelB;
    int j = i < 4 ? i : i - 4;
    return j == 0 ? v.x : j == 1 ? v.y : j == 2 ? v.z : v.w;
}

/**  The melody along a ribbon: the eight ages joined smoothly, mirrored so the ribbon has no seam.
 *
 * @param u  The place (any value). (in)
 *
 * @return
 *   The pitch, 0..1.
 **/
float melodyAt(float u)
{
    float x = (1.0 - abs(fract(u * 0.5) * 2.0 - 1.0)) * 7.0;
    int i = int(min(floor(x), 6.0));
    return mix(melAge(i), melAge(i + 1), smoothstep(0.0, 1.0, x - float(i)));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    melodyControls();
    float N = floor(6.0 + 2.0 * clamp(ribbonP, 0.0, 1.0));
    float wav = 0.08 + 0.12 * clamp(waveP, 0.0, 1.0);
    float run = 0.04 * sceneTime + 0.16 * audioAdvance;
    float spread = 0.06 + 0.2 * clamp(audioRolloff, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float pair = floor(fi * 0.5);
        float hi = fract(sin(pair * 12.9898) * 43758.5453);
        vec2 q = rot2(0.6 * (hi - 0.5) + 0.1 * sin(0.3 * run + pair)) * p;
        // the shared path: drifting sideways, waved by the melody laid along it
        float x = q.x + run * (0.5 + 0.3 * hi);
        float y = ((pair + 0.5) / max(0.5 * N, 1.0) - 0.5) * 0.95 + wav * (melodyAt(x * 0.6 + pair) - 0.5) * 2.0 + 0.06 * sin(2.3 * x + 3.0 * hi);
        float slope = wav * 0.6 + 0.14;
        // each ribbon of the pair twists at its own rate: narrow where it turns its edge to the eye
        float tw = cos(x * (2.0 + 0.7 * mod(fi, 2.0)) + run * 2.0 + 3.0 * fi);
        float hw = 0.055 * (0.25 + 0.75 * abs(tw));
        float d = (q.y - y) / sqrt(1.0 + slope * slope);
        float edge = exp(-pow((abs(d) - hw) / 0.003, 2.0));
        float body = smoothstep(hw, hw * 0.8, abs(d)) * 0.08;
        vec3 fringe = hsv2rgb(vec3(fract(fh + spread * sin(9.0 * x + 2.0 * fi + 6.0 * d / max(hw, 1e-3))), 0.7, 1.0));
        col += mix(famLight(fh, 0.5, 0.6), fringe, 0.7) * edge * 0.9 + famCol(fh, 0.4 + 0.1 * fi) * body;
    }
    finish(col);
}
