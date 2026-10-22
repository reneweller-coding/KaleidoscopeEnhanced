//@doc
 * @brief MOTIF MIRROR HALL: every section of the music draws its own figures of light -- looping curves whose shapes
 * belong to that section -- and when a section comes back, its figures return multiplied in a hall of mirrors, the
 * remembered shapes reflected round and round.  A section's figures are Lissajous curves whose frequencies and phases
 * come from the section's number, so a returning section brings back the same figures; a recognised section folds the
 * picture into a mirrored kaleidoscope that opens as the section begins, a new one shows its figures plainly.  The
 * light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age  -> every section draws its own figures (cross-faded over six seconds)
 *   audioSectionKnown   -> a returning section's figures come back in the hall of mirrors
 *   audioAdvance        -> the figures drift and turn (integrated)
 *   audioSwell          -> the figures' glow
 *
 * Knobs: formP (how many figures), mirrorP (how many mirrors the hall has), hueP.
//@params formP mirrorP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSectionKnown audioSwell
//@body
/**  A section's figures at a place: the glow of its Lissajous curves.
 *
 * @param p    The place. (in)
 * @param sid  The section's number. (in)
 * @param N    The number of figures. (in)
 * @param run  The drift's progress. (in)
 *
 * @return
 *   The glow.
 **/
float figures(vec2 p, float sid, float N, float run)
{
    float g = 0.0;
    for (int f = 0; f < 4; ++f) {
        float ff = float(f);
        if (ff >= N) break;
        float h1 = hash21(vec2(sid + 1.0, ff * 7.3)), h2 = hash21(vec2(ff * 3.1, sid + 2.0));
        vec2 fr = vec2(1.0 + floor(4.0 * h1), 1.0 + floor(4.0 * h2));
        vec2 c = vec2(0.5 * (h1 - 0.5), 0.3 * (h2 - 0.5));
        float best = 9.0;
        vec2 prev = vec2(0.0);
        for (int k = 0; k <= 64; ++k) {
            float t = 6.2831853 * float(k) / 64.0;
            vec2 pt = c + vec2(0.45 * sin(fr.x * t + run + 6.0 * h2), 0.32 * sin(fr.y * t + 0.7 * run));
            if (k > 0) {
                vec2 ab = pt - prev, ap = p - prev;
                best = min(best, length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0)));
            }
            prev = pt;
        }
        g += exp(-pow(best / 0.003, 2.0)) + 0.2 * exp(-best / 0.015);
    }
    return g;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(2.0 + 2.0 * clamp(formP, 0.0, 1.0));
    float nm = floor(5.0 + 4.0 * clamp(mirrorP, 0.0, 1.0));
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float known = clamp(audioSectionKnown, 0.0, 1.0) * m;            // the hall opens as a known section begins
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float sidA = max(audioSectionPrev, 0.0), sidB = max(audioSectionId, 0.0);
    float plain = 0.0, hall = 0.0;
    if (known < 0.999) {
        plain = m * figures(p, sidB, N, run);
        if (m < 0.999) plain += (1.0 - m) * figures(p, sidA, N, run);
    }
    if (known > 0.001) {
        // the hall of mirrors: the place folded into one mirrored sector
        float sec = 6.2831853 / nm;
        float a = abs(mod(atan(p.y, p.x) + 0.1 * run, sec) - 0.5 * sec);
        hall = figures(length(p) * vec2(cos(a), sin(a)) * 1.6 - vec2(0.3, 0.0), sidB, N, run);
    }
    float g = mix(plain, hall, known);
    vec3 col = famCol(fh, 0.45) * (0.015 + 0.02 * fbm(1.5 * p + 0.02 * run)) + famLight(fh, 0.4 + 0.2 * known, 0.5) * g * glow;
    finish(col);
}
