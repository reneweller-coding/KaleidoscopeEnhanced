//@doc
 * @brief LIGHT SCORE FLYTHROUGH: a score laid out in space and coming toward the eye: every note played appears at the
 * far end of a dark plane, at a lane set by its pitch, and travels toward the viewer as it ages -- long notes drawn as
 * bands of light, short ones as sparks -- so the last seconds of the melody stream past underfoot, over the faint staff
 * lines and the bar lines of the plane.  The notes come from the melody's ring of recent pitches, moving on smoothly
 * between its samples: consecutive samples of nearly the same pitch join into a band, others stand alone as sparks;
 * their depth is their age, their lane their pitch measured from the melody's recent mean in its recent spread.
 * Distinct from PianoRollWaterfall, which is flat.  The light is shades of one colour family from the photo, by pitch.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the notes: bands and sparks at their pitches' lanes, streaming toward the eye
 *   audioOnset      -> the far end flashes softly where new notes enter (light)
 *   audioSwell      -> the notes' glow
 *
 * Knobs: laneP (how wide the lanes spread), heightP (the eye's height over the plane), hueP.
//@params laneP heightP
//@audio audioMelody[96] audioMelodyHead audioMelodyPhase audioOnset audioSwell
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float spread = 0.9 + 0.6 * clamp(laneP, 0.0, 1.0);
    float eye = 0.3 + 0.25 * clamp(heightP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    int hi = int(audioMelodyHead * 96.0 + 0.5) % 96;
    float ph = clamp(audioMelodyPhase, 0.0, 1.0);
    vec2 mf = melodyFrame(hi, ph);
    const float HZ = 0.05, F = 1.4, DZ = 0.09;                         // horizon, focal length, depth per sample
    vec3 col = famCol(fh, 0.45) * 0.015;
    // the plane's horizon glow, flashing softly as notes enter
    col += famCol(fh, 0.5) * exp(-pow((p.y - HZ) / 0.04, 2.0)) * (0.06 + 0.2 * clamp(audioOnset, 0.0, 1.0));
    // the plane: five staff lines along the depth and a bar line every second, flowing toward the eye with the notes
    if (p.y < HZ - 0.002) {
        float z = eye * F / (HZ - p.y);
        float x = p.x * z / F;
        float pw = 1.5 * z / F / resolution.y;
        float lane = 0.25 * spread;
        float staff = exp(-pow((abs(fract(x / lane + 0.5) - 0.5) * lane) / pw, 2.0)) * step(abs(x), 2.1 * lane);
        float u = (z + 12.5 * DZ * sceneTime) / (12.5 * DZ);
        float du = z * z / (eye * F) / resolution.y / (12.5 * DZ);        // a pixel in u (no fwidth inside the branch)
        float barl = exp(-pow((0.5 - abs(fract(u) - 0.5)) / (1.5 * du), 2.0)) * step(abs(x), 2.1 * lane);
        col += famCol(fh, 0.5) * (staff * 0.12 + barl * 0.06) * smoothstep(9.0, 3.0, z) * smoothstep(0.3, 1.0, z);
    }
    vec2 prev = vec2(0.0);
    float mprev = 0.0;
    for (int k = 0; k < 96; ++k) {
        float age = float(k) + ph;
        float m = audioMelody[(hi + 95 - k) % 96];
        float rel = clamp((m - mf.x) / (2.0 * mf.y), -1.2, 1.2);
        float z = 9.0 - age * DZ;                                       // newest far, oldest near
        vec2 sp = vec2(rel * 0.5 * spread, -eye) / z * F + vec2(0.0, HZ);
        float fade = smoothstep(0.4, 1.2, z) * smoothstep(0.0, 1.0, age) * (0.35 + 0.65 * age / 96.0);
        if (k > 0 && m > 0.001 && mprev > 0.001) {
            bool band = abs(m - mprev) < 0.03;
            vec2 ab = sp - prev, ap = p - prev;
            float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
            float w = 0.012 / z;
            float g = band ? exp(-pow(d / w, 2.0)) + 0.3 * exp(-d / (3.0 * w)) : 0.0;
            col += famLight(fh, 0.3 + 0.4 * clamp(0.5 + 0.5 * rel, 0.0, 1.0), 0.4) * g * fade * glow;
        }
        if (m > 0.001 && (mprev < 0.001 || abs(m - mprev) >= 0.03)) {   // a change of note: a spark
            float d = length(p - sp);
            float w = 0.02 / z;
            col += famLight(fh, 0.3 + 0.4 * clamp(0.5 + 0.5 * rel, 0.0, 1.0), 0.8) * (exp(-pow(d / w, 2.0)) * 1.4 + 0.2 * exp(-d / (3.0 * w))) * fade * glow;
        }
        prev = sp;
        mprev = m;
    }
    finish(famExpose(col, 7.00, 0.70, 0.05, fh));
}
