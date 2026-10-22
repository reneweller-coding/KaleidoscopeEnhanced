//@doc
 * @brief ARPEGGIO SPIRAL STEPS: the melody climbs and descends a spiral staircase of light: every step is a note of the
 * last few seconds, set at the height of its pitch on a slowly turning helix, so arpeggios run up and down the winding
 * stair while silent moments leave dark gaps; the newest steps glow brightest, the oldest fade at the far end.  The
 * steps come from the melody's ring of recent pitches, one tread for every sample, moving on smoothly between the
 * samples; a pitch's height is measured from the melody's recent mean in its recent spread, so every tune fills the
 * stair.  Each tread is a short glowing arc along the helix with a faint riser down to the next.  The light is shades
 * of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the steps: each recent note a tread at its pitch's height
 *   audioAdvance    -> the staircase turns (integrated)
 *   audioSwell      -> the steps' glow
 *
 * Knobs: turnP (how tightly the stair winds), heightP (how far the pitches rise), hueP.
//@params turnP heightP
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

/**  A tread's place on the helix.
 *
 * @param age   The tread's age in samples. (in)
 * @param rel   Its pitch, relative (about -1..1). (in)
 * @param dth   The turn per sample. (in)
 * @param rise  How far the pitches rise. (in)
 * @param spin  The staircase's turning. (in)
 *
 * @return
 *   The place in view space.
 **/
vec3 treadAt(float age, float rel, float dth, float rise, float spin)
{
    float th = -age * dth + spin;
    return vec3(0.55 * cos(th), 0.28 * rise * rel, 0.55 * sin(th) + 1.5);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float dth = 0.07 + 0.05 * clamp(turnP, 0.0, 1.0);
    float rise = 0.7 + 0.5 * clamp(heightP, 0.0, 1.0);
    float spin = 0.05 * sceneTime + 0.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    int hi = int(audioMelodyHead * 96.0 + 0.5) % 96;
    float ph = clamp(audioMelodyPhase, 0.0, 1.0);
    vec2 mf = melodyFrame(hi, ph);
    vec3 col = famCol(fh, 0.45) * 0.015;
    float hl = 0.4 * 0.55 * dth;                                     // a tread's half length, under the spacing
    for (int k = 0; k < 95; ++k) {
        float age = float(k) + ph;
        float m = audioMelody[(hi + 95 - k) % 96];
        float mn = audioMelody[(hi + 94 - k) % 96];
        if (m < 0.001) continue;
        float rel = clamp((m - mf.x) / (2.0 * mf.y), -1.2, 1.2), reln = clamp((mn - mf.x) / (2.0 * mf.y), -1.2, 1.2);
        vec3 x = treadAt(age, rel, dth, rise, spin);
        vec3 tg = normalize(vec3(-x.z + 1.5, 0.0, x.x)) * hl;
        vec2 a = (x - tg).xy / (x - tg).z * 1.5, b = (x + tg).xy / (x + tg).z * 1.5;
        vec2 ab = b - a, ap = p - a;
        float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
        float tread = exp(-pow(d / (0.006 / x.z), 2.0)) + 0.3 * exp(-d / (0.02 / x.z));
        // the riser down to the next (older) step
        vec2 c = treadAt(age + 1.0, reln, dth, rise, spin).xy / treadAt(age + 1.0, reln, dth, rise, spin).z * 1.5;
        vec2 cd = c - b, cp = p - b;
        float dr = length(cp - cd * clamp(dot(cp, cd) / max(dot(cd, cd), 1e-8), 0.0, 1.0));
        float riser = exp(-pow(dr / 0.0015, 2.0)) * step(0.001, mn) * 0.25;
        float life = smoothstep(0.0, 1.0, age) * (1.0 - smoothstep(90.0, 95.0, age)) * (1.0 - 0.8 * age / 96.0);
        col += famLight(fh, 0.3 + 0.4 * clamp(0.5 + 0.5 * rel, 0.0, 1.0), 0.4 + 0.4 * (1.0 - age / 96.0)) * (tread + riser) * life * glow;
    }
    finish(col);
}
