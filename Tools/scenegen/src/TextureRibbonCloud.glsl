//@doc
 * @brief TEXTURE RIBBON CLOUD: ribbons cut from the photo float through the dark at many depths, twisting as they go,
 * and wave with the melody: each ribbon's curve across the picture is the tune of the last seconds, the newest notes at
 * the right, the older ones streaming away to the left.  A ribbon's height at a place is its own slow wave plus the
 * melody's pitch of as long ago as the place lies to the left (the melody's ring of recent pitches, moving on smoothly
 * between its samples, measured from its recent mean in its recent spread, and averaged over a few samples); its width
 * swells and narrows as it twists, showing its face and its darker back.  The ribbons are the photo, calmed toward one
 * colour family, laid from the farthest to the nearest.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the ribbons wave with the melody: the last seconds' tune drawn across the picture
 *   audioAdvance    -> the ribbons twist and drift (integrated)
 *   audioSwell      -> the ribbons' glow
 *
 * Knobs: countP (how many ribbons), waveP (how far the melody bends them), hueP.
//@params countP waveP
//@audio audioMelody[96] audioMelodyHead audioMelodyPhase audioSwell
//@body
/**  The melody's recent mean pitch and spread, every sample weighted by a window over its age so that samples enter
 * and leave without a jump.
 *
 * @param hi  The ring's next write index. (in)
 * @param ph  The progress toward the next sample (0..1). (in)
 *
 * @return
 *   x the mean, y the spread (at least 0.03).
 **/
vec2 melodyFrame(int hi, float ph)
{
    float s = 0.0, s2 = 0.0, n = 0.0;
    for (int k = 0; k < 96; ++k) {
        float m = audioMelody[(hi + 95 - k) % 96];
        float w = sin(3.14159265 * clamp((float(k) + ph) / 96.0, 0.0, 1.0)) * step(0.001, m);
        s += w * m;
        s2 += w * m * m;
        n += w;
    }
    float mean = n > 0.01 ? s / n : 0.5;
    return vec2(mean, max(sqrt(max(s2 / max(n, 0.01) - mean * mean, 0.0)), 0.03));
}

/**  The melody's pitch so long ago, relative to its mean (0 where no note sounded), averaged over five samples.
 *
 * @param age  The age in samples. (in)
 * @param hi   The ring's next write index. (in)
 * @param ph   The progress toward the next sample. (in)
 * @param mf   The mean and spread. (in)
 *
 * @return
 *   The pitch, relative (about -1..1).
 **/
float melodyAt(float age, int hi, float ph, vec2 mf)
{
    float acc = 0.0;
    for (int t = -2; t <= 2; ++t) {
        float k = clamp(age - ph + 1.5 * float(t), 0.0, 93.99);
        int k0 = int(floor(k));
        float m0 = audioMelody[(hi + 95 - k0) % 96], m1 = audioMelody[(hi + 94 - k0) % 96];
        float r0 = m0 > 0.001 ? (m0 - mf.x) / (2.0 * mf.y) : 0.0, r1 = m1 > 0.001 ? (m1 - mf.x) / (2.0 * mf.y) : 0.0;
        acc += mix(r0, r1, fract(k)) * (3.0 - abs(float(t))) / 9.0;
    }
    return clamp(acc, -1.2, 1.2);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    int hi = int(audioMelodyHead * 96.0 + 0.5) % 96;
    float ph = clamp(audioMelodyPhase, 0.0, 1.0);
    vec2 mf = melodyFrame(hi, ph);
    float n = floor(6.0 + 3.0 * clamp(countP, 0.0, 1.0));
    float bend = 0.08 + 0.12 * clamp(waveP, 0.0, 1.0);
    float run = 0.1 * sceneTime + 0.4 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float age = clamp((0.95 - p.x) / 1.9, 0.0, 1.0) * 90.0;           // the right edge is now, the left the oldest
    float mel = melodyAt(age, hi, ph, mf);
    vec3 col = famCol(fh, 0.4) * 0.02;
    for (int k = 8; k >= 0; --k) {
        float i = float(k);
        if (i >= n) continue;
        float z = 1.0 + 0.35 * i;                                     // nearer ribbons are larger and higher in front
        float y0 = 0.42 * (fract(i * 0.618034 + 0.2) - 0.5) * 2.0;
        float y = y0 + 0.08 * sin(2.3 * p.x / z + run * (0.7 + 0.1 * i) + 1.7 * i) + bend * mel / z * (mod(i, 2.0) < 0.5 ? 1.0 : -0.7);
        float tw = cos(1.7 * p.x / z + run * 0.8 + 2.1 * i);          // the twist: face, edge, back
        float hw = (0.07 + 0.05 * hash11(i * 3.1)) / z * (0.15 + 0.85 * abs(tw));
        float d = abs(p.y - y) / hw;
        if (d > 1.0) continue;
        vec2 uv = vec2(0.5 + 0.4 * sin(p.x * 0.8 / z + i * 1.3 + 0.3 * run), 0.5 + 0.35 * (p.y - y) / hw);
        vec3 c = tone(imgLod(uv, 1.5), fh) * (tw > 0.0 ? 1.0 : 0.45);
        float edge = 1.0 - smoothstep(0.8, 1.0, d);
        col = mix(col, c * (0.7 + 0.3 * (1.0 - d * d)) * glow * (1.15 - 0.08 * i), edge);
    }
    finish(famExpose(col, 2.85, 1.00, 0.00, fh));
}
