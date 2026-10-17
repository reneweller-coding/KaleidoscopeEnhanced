//@doc
 * @brief CADENCE GRAVITY: a field of gravity whose wells are the steps of the key -- the tonic's well in the middle,
 * the deepest, the other six steps round it, the fifth and the fourth deeper than the rest.  The music's tension (how
 * far the sounding chord stands from the tonic triad) tilts the field toward the tonic: under a dominant the photo is
 * drawn hard into the middle, on the resolution it springs back into its own shape.  The key itself is found on the
 * state pass (the chroma held against the twenty-four key profiles), so the wells glide round with every change
 * of key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma     -> the key (found on the state pass) and the tension of the chord
 *   audioPhase      -> the field turns slowly (integrated)
 *   audioKick       -> the wells flash (light)
 *
 * Knobs: pullP (how hard the tension pulls), wellP (the wells' width), photoP (photo share), hueP.
//@params pullP wellP photoP
//@audio audioChroma[12] audioKick
//@state 2 1 30
//@body
/**  The Krumhansl-Kessler major (or minor) profile for a step above the tonic.
 *
 * @param s      The step in semitones (0..11). (in)
 * @param minor  True for the minor profile. (in)
 *
 * @return
 *   The weight.
 **/
float kkProfile(int s, bool minor)
{
    if (!minor) {
        if (s == 0) return 6.35; if (s == 1) return 2.23; if (s == 2) return 3.48; if (s == 3) return 2.33;
        if (s == 4) return 4.38; if (s == 5) return 4.09; if (s == 6) return 2.52; if (s == 7) return 5.19;
        if (s == 8) return 2.39; if (s == 9) return 3.66; if (s == 10) return 2.29; return 2.88;
    }
    if (s == 0) return 6.33; if (s == 1) return 2.68; if (s == 2) return 3.52; if (s == 3) return 5.38;
    if (s == 4) return 2.60; if (s == 5) return 3.53; if (s == 6) return 2.54; if (s == 7) return 4.75;
    if (s == 8) return 3.98; if (s == 9) return 2.69; if (s == 10) return 3.34; return 3.17;
}

/**  The state pass: texel 0 holds the key (tonic, minor) found by profile correlation, held unless another key wins
 * clearly; texel 1 the smoothed tension and the wells' angle, gliding the short way round to the key.
 *
 * @return
 *   Texel 0: the tonic (r), minor (g), the score (b); texel 1: the tension (r), the angle (g).
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    vec4 c = texelFetch(texState, ivec2(i, 0), 0);
    float sum = 0.0;
    for (int k = 0; k < 12; ++k) sum += clamp(audioChroma[k], 0.0, 1.0);
    if (i == 0) {
        float best = -1e9, bt = 0.0, bm = 0.0;
        for (int m = 0; m < 2; ++m) for (int t = 0; t < 12; ++t) {
            float sc = 0.0;
            for (int k = 0; k < 12; ++k) sc += clamp(audioChroma[k], 0.0, 1.0) * kkProfile((k - t + 12) % 12, m == 1);
            if (sc > best) { best = sc; bt = float(t); bm = float(m); }
        }
        if (stateFrame < 0.5) return vec4(bt, bm, best, 1.0);
        float held = 0.0;
        for (int k = 0; k < 12; ++k) held += clamp(audioChroma[k], 0.0, 1.0) * kkProfile((k - int(c.r) + 12) % 12, c.g > 0.5);
        if (sum > 0.5 && best > held * 1.08) return vec4(bt, bm, best, 1.0);   // a clear new key
        return vec4(c.r, c.g, held, 1.0);
    }
    vec4 key = texelFetch(texState, ivec2(0, 0), 0);
    int t = int(key.r);
    int third = key.g > 0.5 ? 3 : 4;
    float triad = clamp(audioChroma[t], 0.0, 1.0) + clamp(audioChroma[(t + third) % 12], 0.0, 1.0) + clamp(audioChroma[(t + 7) % 12], 0.0, 1.0);
    float tension = sum > 0.3 ? clamp(1.0 - triad / max(sum * 0.5, 0.3), 0.0, 1.0) : 0.0;
    float target = 6.2831853 * key.r / 12.0;
    if (stateFrame < 0.5) return vec4(tension, target, 0.0, 1.0);
    float dA = target - c.g;
    dA -= 6.2831853 * floor(dA / 6.2831853 + 0.5);            // the short way round
    return vec4(mix(c.r, tension, 0.05), c.g + 0.04 * dA, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec4 key = texelFetch(texState, ivec2(0, 0), 0);
    vec4 tk = texelFetch(texState, ivec2(1, 0), 0);
    float tension = tk.r;
    float pull = (0.8 + 1.2 * clamp(pullP, 0.0, 1.0)) * (0.45 + tension);
    float wd = 0.08 + 0.08 * clamp(wellP, 0.0, 1.0);
    float rot = 0.01 * audioPhase + tk.g;
    // the wells: the tonic in the middle, the other six steps on a ring; depth by stability
    vec2 disp = vec2(0.0);
    float glowW = 0.0;
    for (int k = 0; k < 7; ++k) {
        float fk = float(k);
        vec2 c = k == 0 ? vec2(0.0) : 0.3 * vec2(cos(rot + 6.2831853 * (fk - 1.0) / 6.0), sin(rot + 6.2831853 * (fk - 1.0) / 6.0));
        float depth = k == 0 ? 1.0 : ((k == 4 || k == 5) ? 0.6 : 0.35);   // the tonic, then the fifth and fourth
        vec2 d = p - c;
        float r2 = dot(d, d);
        disp += depth * d * exp(-r2 / (wd * wd * 4.0)) * (k == 0 ? 1.0 + tension : 1.0);
        glowW += depth * exp(-r2 / (wd * wd * 0.3));
    }
    vec2 uv = p * 0.55 + 0.5 + disp * pull * 0.5 + 0.02 * vec2(sin(0.02 * sceneTime), cos(0.017 * sceneTime));
    vec3 col = imgLod(uv, 0.3);
    vec3 tone = imgPalette(tk.g / 6.2831853 + 0.03 * audioPhase);
    col = mix(col * tone * 1.6, col, 0.6 + 0.4 * clamp(photoP, 0.0, 1.0));
    col *= 0.85 + 0.35 * glowW;                                 // the wells shine through
    col += mix(tone, vec3(1.0), 0.5) * glowW * 0.12 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col * 1.05);
}
