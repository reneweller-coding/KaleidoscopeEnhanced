//@doc
 * @brief WHISTLER MODE SPIRALS: whistler waves running along the magnetic field lines of a planet: from a glowing arc of
 * the planet below, nested field-line arches span the sky, and along each one a packet of spiralling wave travels from
 * one foot to the other, its wiggles drawing out as it goes -- the falling tone of a whistler made visible; the melody
 * sets their pitch.  The field lines are those of a dipole, r = L cos^2(latitude); along each, a packet's envelope
 * slides with the music's drive while its local wavelength stretches from the start to the end (the dispersion);
 * the wave is the line displaced sideways by the packet, drawn as sixty-four segments per line.  The light is shades of
 * one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the packets' pitch: their wiggles are finer as the melody rises (smoothed)
 *   audioAdvance    -> the packets travel along the lines (integrated)
 *   audioSwell      -> the waves' glow
 *
 * Knobs: lineP (how many field lines), packetP (how long the packets are), hueP.
//@params lineP packetP
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
    float N = floor(4.0 + 3.0 * clamp(lineP, 0.0, 1.0));
    float plen = 0.15 + 0.15 * clamp(packetP, 0.0, 1.0);
    float k0 = 40.0 + 60.0 * melodyMean();
    float run = 0.05 * sceneTime + 0.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    const vec2 E = vec2(0.0, -0.75);                                  // the planet's centre
    const float RE = 0.28;
    vec3 col = famCol(fh, 0.45) * 0.015;
    float dE = length(p - E);
    col += famLight(fh, 0.5, 0.7) * exp(-pow((dE - RE) / 0.004, 2.0)) * 0.6 + famCol(fh, 0.4) * 0.05 * step(dE, RE);
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float L = RE * (1.6 + 0.75 * fi);
        float lmax = acos(sqrt(RE / L));                               // where the line meets the planet
        float sc = fract(0.13 * run * (1.0 + 0.1 * fi) + 0.37 * fi);   // the packet's place along the line
        float best = 9.0, env = 0.0;
        vec2 prev = vec2(0.0);
        for (int k = 0; k <= 64; ++k) {
            float s = float(k) / 64.0;
            float lam = mix(-lmax, lmax, s);
            float rr = L * cos(lam) * cos(lam);
            vec2 base = E + rr * vec2(sin(lam), cos(lam));
            vec2 tng = normalize(vec2(cos(lam) * cos(lam) * cos(lam) - 2.0 * sin(lam) * sin(lam) * cos(lam),
                                      -3.0 * cos(lam) * cos(lam) * sin(lam)));
            vec2 nrm = vec2(-tng.y, tng.x);
            float e = exp(-pow((s - sc) / plen, 2.0));
            float kk = k0 * (1.0 - 0.6 * s);                          // the wiggles draw out as the packet goes
            vec2 pt = base + nrm * 0.02 * e * sin(kk * s * L - 6.0 * run);
            if (k > 0) {
                vec2 ab = pt - prev, ap = p - prev;
                float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
                if (d < best) { best = d; env = e; }
            }
            prev = pt;
        }
        float line = exp(-pow(best / 0.0022, 2.0)) * (0.3 + 1.4 * env) + 0.25 * exp(-best / 0.012) * (0.2 + env);
        col += famLight(fh, 0.3 + 0.08 * fi, 0.4 + 0.4 * env) * line * glow;
    }
    finish(col);
}
