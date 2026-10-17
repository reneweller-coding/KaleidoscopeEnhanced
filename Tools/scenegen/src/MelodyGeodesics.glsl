//@doc
 * @brief MELODY GEODESICS: the photo flowing along geodesics on a bumpy surface, steered by the melody -- the
 * surface's hills and hollows bend every straight line the way lenses bend light, so a field of parallel paths
 * converges, crosses and spreads again; the melody turns the direction they set out in, higher notes one way, lower
 * notes the other (its pitch smoothed over the last notes).  The photo streams along the bent paths and the hills
 * wander slowly, so the flow keeps finding new courses.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody     -> the paths' heading follows the smoothed melody
 *   audioAdvance    -> the photo streams (integrated)
 *   audioKick       -> the hilltops flash (light)
 *
 * Knobs: hillsP (the hills' strength), streakP (the streaks' length), photoP (photo share), hueP.
//@params hillsP streakP photoP
//@audio audioMelody[96] audioMelodyHead audioKick
//@body
/**  The melody, smoothed: a triangle-weighted mean of the newest samples of the ring that hold a pitch.
 *
 * @return
 *   The smoothed pitch (0..1), or 0.5 when none sounds.
 **/
float smoothNote()
{
    int hi = int(audioMelodyHead * 96.0);
    float s = 0.0, w = 0.0;
    for (int j = 0; j < 24; ++j) {
        float m = audioMelody[(hi + 95 - j) % 96];
        float wj = (24.0 - float(j)) * step(0.001, m);
        s += wj * m;
        w += wj;
    }
    return w > 0.0 ? s / w : 0.5;
}

/**  The direction of the paths at a point: a heading bent by the hills' slopes (a geodesic's turn follows the
 * curvature it crosses).
 *
 * @param x       The point. (in)
 * @param head    The heading angle. (in)
 * @param hills   The hills' strength. (in)
 *
 * @return
 *   The unit direction.
 **/
vec2 pathDir(vec2 x, float head, float hills)
{
    vec2 d = vec2(cos(head), sin(head));
    vec2 g = vec2(0.0);
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        vec2 c = vec2(0.6 * sin(0.031 * sceneTime + 2.1 * fi), 0.35 * cos(0.027 * sceneTime + 1.7 * fi));
        vec2 q = x - c;
        float r2 = dot(q, q);
        g += (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0) * q * exp(-r2 / 0.03);   // hills and hollows
    }
    return normalize(d + hills * vec2(-g.y, g.x) * 8.0 + hills * g * 3.0);
}

void main()
{
    vec2 p = screenP();
    float head = 3.14159265 * (smoothNote() - 0.5) * 1.6;
    float hills = 0.3 + 0.7 * clamp(hillsP, 0.0, 1.0);
    float streak = 0.002 + 0.005 * clamp(streakP, 0.0, 1.0);
    float T = 0.15 * sceneTime + 0.4 * audioAdvance;
    vec3 col = vec3(0.0);
    for (int ph = 0; ph < 2; ++ph) {
        float f = fract(T + 0.5 * float(ph));
        float w = 1.0 - abs(2.0 * f - 1.0);
        vec2 x = p;
        vec3 acc = vec3(0.0);
        float ws = 0.0;
        for (int s = 0; s < 10; ++s) x -= pathDir(x, head, hills) * 0.014 * f;   // back along the bent path
        for (int s = 0; s < 3; ++s) {                           // and a short streak behind it
            acc += imgLod(x * 0.55 + 0.5, 0.4) * (1.0 - 0.25 * float(s));
            ws += 1.0 - 0.25 * float(s);
            x -= pathDir(x, head, hills) * streak;
        }
        col += w * acc / ws;
    }
    // the hilltops, faintly
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    float tops = 0.0;
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        vec2 c = vec2(0.6 * sin(0.031 * sceneTime + 2.1 * fi), 0.35 * cos(0.027 * sceneTime + 1.7 * fi));
        tops += exp(-dot(p - c, p - c) / 0.004) * (mod(fi, 2.0) < 0.5 ? 1.0 : 0.0);
    }
    col = mix(col * tone * 1.6, col, 0.6 + 0.4 * clamp(photoP, 0.0, 1.0));
    col += tone * tops * 0.2 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col * 1.08);
}
