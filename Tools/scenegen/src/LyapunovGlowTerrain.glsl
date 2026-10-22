//@doc
 * @brief LYAPUNOV GLOW TERRAIN: Markus' Lyapunov fractal -- the logistic map x <- r x (1 - x), r switching between a and
 * b in a fixed sequence -- drawn as terraces of light with no ground: where the exponent is negative the map settles,
 * and these islands of stability glow in contour steps, brightest at their spines; where it is chaotic the field is
 * dark.  The (a, b) window is mirrored at its edges, so the terraces continue without end while the view drifts.
 * One colour family from the photo, a shade per terrace.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section turns to another A/B sequence (AB, AABAB, BBABA, AAAABBBB), over six
 *                         seconds, the light cross-faded
 *   audioHarmAdvance   -> the window over (a, b) glides with the chord changes
 *   audioAdvance       -> the drift across the terraces (integrated)
 *   audioSwell         -> the terraces' glow widens
 *
 * Knobs: zoomP (how much of the (a, b) plane the screen shows), stepP (how many terraces), hueP.
//@params zoomP stepP
//@audio audioSectionId audioSectionPrev audioSectionAge audioHarmAdvance audioSwell
//@body
/**  Whether step n of a sequence uses b (sequences AB, AABAB, BBABA, AAAABBBB).
 *
 * @param s  The sequence, 0..3. (in)
 * @param n  The step. (in)
 *
 * @return
 *   1 for b, 0 for a.
 **/
float useB(float s, float n)
{
    if (s < 0.5) return mod(n, 2.0);
    if (s < 1.5) { float k = mod(n, 5.0); return (k == 2.0 || k == 4.0) ? 1.0 : 0.0; }
    if (s < 2.5) { float k = mod(n, 5.0); return (k == 2.0 || k == 4.0) ? 0.0 : 1.0; }
    return step(4.0, mod(n, 8.0));
}

/**  The Lyapunov exponent of the logistic map driven by a sequence.
 *
 * @param ab  The two rates. (in)
 * @param s   The sequence. (in)
 *
 * @return
 *   The exponent (negative: stable).
 **/
float lyapunov(vec2 ab, float s)
{
    float x = 0.5, sum = 0.0;
    for (int n = 0; n < 72; ++n) {
        float r = mix(ab.x, ab.y, useB(s, float(n)));
        x = r * x * (1.0 - x);
        if (n >= 12) sum += log(max(abs(r * (1.0 - 2.0 * x)), 1e-6));
    }
    return sum / 60.0;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float sA = mod(max(audioSectionPrev, 0.0), 4.0), sB = mod(max(audioSectionId, 0.0), 4.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float zoom = 1.0 - 0.45 * clamp(zoomP, 0.0, 1.0);
    float steps = 3.0 + 4.0 * clamp(stepP, 0.0, 1.0);
    float width = 0.06 + 0.08 * clamp(audioSwell, 0.0, 1.0);
    float drift = 0.012 * sceneTime + 0.05 * audioAdvance;
    vec2 centre = vec2(3.05, 3.25) + vec2(0.25 * sin(0.7 * h) + 0.3 * sin(drift), 0.2 * cos(0.53 * h) + 0.3 * cos(0.8 * drift));
    vec2 ab = centre + rot2(0.1 * sin(0.4 * drift)) * p * zoom;
    // mirror the window into 2..4 without seams
    ab = 2.0 + 2.0 * (1.0 - abs(fract((ab - 2.0) / 4.0) * 2.0 - 1.0));
    float lA = lyapunov(ab, sA), lB = lyapunov(ab, sB);
    vec3 col = vec3(0.0);
    for (int k = 0; k < 2; ++k) {
        float l = k == 0 ? lA : lB;
        float w = k == 0 ? 1.0 - m : m;
        float v = max(-l, 0.0);                                  // how stable
        float terr = v * steps;
        float edge = abs(fract(terr) - 0.5) * 2.0;               // 1 on a terrace's edge
        float g = exp(-pow((1.0 - edge) / width, 2.0)) * smoothstep(0.0, 0.15, v);
        float body = smoothstep(0.0, 0.8, v) * 0.45;
        float chaos = 0.12 * exp(-6.0 * abs(l));                  // the islands' shores
        col += w * (famLight(fh, fract(0.17 * floor(terr)), 0.4 * g) * (g + body) + famCol(fh, 0.2) * chaos);
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(famExpose(col, 3.13, 1.00, 0.03, fh));
}
