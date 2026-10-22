//@doc
 * @brief BLACKLIGHT STRING SCULPTURE: string art under black light: taut threads spanned between two moving rails form
 * curved surfaces of glowing lines -- hyperbolic sheets and twisted bands -- several of them in depth, re-spanning
 * themselves as the rails twist.  Each sheet is up to forty-eight threads from anchors spread round a lower rail to
 * the anchors of an upper rail turned against it (the twist makes the hyperboloid's waist), projected in
 * perspective, the threads fluorescing in shades of one colour family against the dark; nearer sheets brighter.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the rails' twist and tilt wander with the chord changes: the sheets re-span
 *   audioAdvance     -> the sculpture turns slowly (integrated)
 *   audioSwell       -> the threads' fluorescence
 *
 * Knobs: threadP (how many threads per sheet), sheetP (how many sheets), hueP.  Distinct from StringArtChords, which
 * is a flat chord picture.
//@params threadP sheetP
//@audio audioHarmAdvance audioSwell
//@body
/**  A point of an anchor rail: an ellipse at its own height, tilted, its anchors spread round it.
 *
 * @param s     The rail parameter (0..1). (in)
 * @param top   1 for the upper rail, -1 for the lower. (in)
 * @param seed  The sheet's own shape. (in)
 * @param h     The harmony's wander. (in)
 *
 * @return
 *   The 3D point.
 **/
vec3 anchor(float s, float top, float seed, float h)
{
    float t = 6.2831853 * s + top * (1.2 + 0.6 * sin(0.5 * h + seed));   // the twist between the rails
    vec3 a = vec3(0.85 * cos(t), 0.55 * top, 0.6 * sin(t));
    a.yz = rot2(0.3 * sin(seed + 0.2 * h)) * a.yz;
    return a;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float threads = floor(24.0 + 24.0 * clamp(threadP, 0.0, 1.0));
    float sheets = 2.0 + 2.0 * clamp(sheetP, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.12 * audioAdvance;
    float glowK = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.015;
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        float on = clamp(sheets - fk, 0.0, 1.0);
        if (on <= 0.0) break;
        float best = 1e9;
        for (int i = 0; i < 48; ++i) {
            if (float(i) >= threads) break;
            float s = (float(i) + 0.5) / threads;
            vec3 A = anchor(s, -1.0, 1.7 * fk, h), B = anchor(s, 1.0, 1.7 * fk, h);
            A.xz = rot2(turn + fk) * A.xz;
            B.xz = rot2(turn + fk) * B.xz;
            vec2 off = 0.35 * vec2(sin(1.9 * fk), cos(2.7 * fk));
            vec2 a = A.xy / (1.6 + A.z) + off, b = B.xy / (1.6 + B.z) + off;
            vec2 e = b - a;
            float t = clamp(dot(p - a, e) / dot(e, e), 0.0, 1.0);
            best = min(best, length(p - a - e * t));
        }
        float g = exp(-pow(best / 0.0028, 2.0)) + 0.25 * exp(-best / 0.012);
        col += famLight(fh, fk / 3.0, 0.15) * g * glowK * on * (1.0 - 0.15 * fk);
    }
    finish(col);
}
