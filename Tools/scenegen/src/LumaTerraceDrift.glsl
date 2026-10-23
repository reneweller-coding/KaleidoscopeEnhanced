//@doc
 * @brief LUMA TERRACE DRIFT: the photo stepped by brightness into five to twelve terraces, and every terrace drifts over the
 * others with a vector of its own, the offsets joined softly at the terrace edges where a thin shade falls: a landscape of
 * tones that slides.  Where the offsets agree the photo stands whole; the colours are its own.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> how many terraces (five to twelve, blended: terraces appear continuously)
 *   audioSwell      -> how far the terraces drift apart
 *   audioPhase      -> every terrace's own clock, faster for the higher ones (integrated)
 *
 * Knobs: countP (the base number of terraces), reachP (how far they drift), hueP.
//@params countP reachP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    float N = 5.0 + 7.0 * clamp(0.5 * countP + 0.5 * clamp(audioSpread, 0.0, 1.0), 0.0, 1.0);
    float amp = (0.5 + 0.9 * clamp(reachP, 0.0, 1.0)) * (0.5 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float L = clamp(luma(imgLod(uv, 2.0)), 0.0, 0.999);
    float bp = L * N;
    vec2 off = vec2(0.0);
    float ws = 0.0;
    for (int i = 0; i < 13; ++i) {
        float fi = float(i);
        float w = max(0.0, 1.0 - abs(bp - fi - 0.5)) * clamp(N - fi, 0.0, 1.0);
        float a = 2.399 * fi;
        off += w * 0.09 * amp * vec2(cos(a + 0.2 * (1.0 + 0.35 * fi) * t), sin(1.3 * a + 0.17 * (1.0 + 0.3 * fi) * t));
        ws += w;
    }
    off /= max(ws, 1e-3);
    vec3 col = imgLod(uv + off, 0.4);
    float edge = 1.0 - smoothstep(0.0, 0.14, min(fract(bp), 1.0 - fract(bp)));
    col *= 1.0 - 0.22 * edge;
    finish(col * 1.08);
}
