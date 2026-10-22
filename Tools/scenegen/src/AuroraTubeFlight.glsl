//@doc
 * @brief AURORA TUBE FLIGHT: curtains of aurora close round the flight path into a tube of light: bands of fine rays,
 * bright at their core and fading at their edges, winding round and along the tube, and the melody makes them wave -- each
 * curtain's sway at a depth is the melody's pitch of as long ago as that depth.  The curtains lie on the tube's wall at
 * their angles, each a soft band with fine rays along it and a halo; their sway follows the melody's ring of recent
 * pitches (moving on smoothly between its samples), measured from its recent mean in its recent spread, with a slow
 * drift of their own.  Two shades of one colour family from the photo, the core and the edge.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the curtains wave with the melody: nearer the newer notes, farther the older
 *   audioAdvance    -> the flight (integrated)
 *   audioSwell      -> the curtains' glow
 *
 * Knobs: curtainP (how many curtains), swayP (how far they wave), hueP.
//@params curtainP swayP
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

/**  The melody's pitch so long ago, relative to its mean (0 where no note sounded).
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
    float k = clamp(age - ph, 0.0, 93.99);
    int k0 = int(floor(k));
    float m0 = audioMelody[(hi + 95 - k0) % 96], m1 = audioMelody[(hi + 94 - k0) % 96];
    float r0 = m0 > 0.001 ? (m0 - mf.x) / (2.0 * mf.y) : 0.0, r1 = m1 > 0.001 ? (m1 - mf.x) / (2.0 * mf.y) : 0.0;
    return clamp(mix(r0, r1, fract(k)), -1.2, 1.2);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float Y = z + fly;
    float NC = floor(6.0 + 4.0 * clamp(curtainP, 0.0, 1.0));
    float sway = 0.2 + 0.3 * clamp(swayP, 0.0, 1.0);
    int hi = int(audioMelodyHead * 96.0 + 0.5) % 96;
    float ph = clamp(audioMelodyPhase, 0.0, 1.0);
    vec2 mf = melodyFrame(hi, ph);
    // nearer the newer notes, smoothed over a few samples so the notes' steps become waves
    float mel = 0.0;
    for (int t = -4; t <= 4; ++t) mel += melodyAt(z * 7.0 + 1.5 * float(t), hi, ph, mf) * (5.0 - abs(float(t))) / 25.0;
    mel *= 1.0 - smoothstep(6.0, 11.0, z);                            // far down the curtains hang still
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 core = famLight(fh, 0.3, 0.5), edge = famLight(fh, 0.75, 0.5);
    vec3 col = famCol(fh, 0.4) * 0.02;
    float px = 1.0 / (r * resolution.y);
    for (int c = 0; c < 10; ++c) {
        float fc = float(c);
        if (fc >= NC) break;
        float phi = fc * 6.2831853 / NC + 0.35 * Y + 0.3 * sin(0.21 * Y + 1.9 * fc + 0.05 * sceneTime)
                  + sway * mel * (fract(fc * 0.5) < 0.25 ? 1.0 : -1.0);
        float d = abs(mod(a - phi + 3.14159265, 6.2831853) - 3.14159265);
        float wB = 0.16 + 0.06 * sin(0.4 * Y + fc);
        float band = exp(-pow(d / wB, 2.0));
        float rays = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(a * 90.0 + 3.0 * sin(0.7 * Y + fc)), 3.0) * (1.0 - smoothstep(0.004, 0.02, px));
        float t = clamp(d / wB, 0.0, 1.0);
        col += mix(core, edge, t) * band * rays * 0.6 + core * exp(-d / (3.0 * wB)) * 0.06;
    }
    col += mix(core, edge, 0.5) * 0.05;                                // the veil between the curtains
    col *= glow * exp(-0.06 * z);
    col += famLight(fh, 0.5, 0.6) * exp(-r * 8.0) * 0.3;
    finish(col);
}
