//@doc
 * @brief DIN RECTANGLE BISECTION: the paper sizes: a sheet of ratio the square root of two cut in two, each half again a sheet of the same shape turned
 * a quarter, and so on without end; every sheet shows the photo in a window of its own, and the depth of the cutting flows with the phrase:
 * one more halving fades in and the finest one fades out, so the sheets seem to stream through the picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the depth of the cutting flows with the phrase (cross-faded, continuous)
 *   audioAdvance    -> the whole picture turns slowly (integrated)
 *   audioSwell      -> the windows' zoom
 *
 * Knobs: baseP (the depth the cutting oscillates around), hueP.
//@params baseP
//@audio audioPhrasePos audioSwell
//@body
/**  The sheet of the bisection that holds a place, to a given depth, and the photo in it.
 *
 * @param q      The place in the first sheet (width 1.414, height 1). (in)
 * @param depth  The number of halvings. (in)
 * @param seed   A number that sets the windows. (in)
 *
 * @return
 *   The colour.
 **/
vec3 dinSheet(vec2 q, int depth, float seed)
{
    vec2 size = vec2(1.4142136, 1.0);
    vec2 o = vec2(0.0);
    float path = 0.0;
    for (int i = 0; i < 10; ++i) {
        if (i >= depth) break;
        bool wide = size.x > size.y;
        if (wide) {
            size.x *= 0.5;
            if (q.x >= o.x + size.x) { o.x += size.x; path = path * 2.0 + 1.0; } else path = path * 2.0;
        } else {
            size.y *= 0.5;
            if (q.y >= o.y + size.y) { o.y += size.y; path = path * 2.0 + 1.0; } else path = path * 2.0;
        }
    }
    vec2 l = (q - o) / size;
    vec2 win = (hash22(vec2(mod(path, 997.0), seed)) - 0.5) * 0.3;
    vec3 col = imgLod((l - 0.5) * 0.8 + 0.5 + win, 0.3 + 0.55 * float(depth)) * (0.82 + 0.25 * hash21(vec2(mod(path, 991.0), seed + 1.0)));
    col *= 0.85 + 0.2 * smoothstep(0.0, 0.03, min(min(l.x, l.y), min(1.0 - l.x, 1.0 - l.y)));
    return col;
}
void main()
{
    vec2 p = screenP();
    float t = 0.03 * sceneTime + 0.2 * audioAdvance;
    vec2 q = rot2(t) * p * 1.1;
    q = abs(fract(q * 0.5 / vec2(1.4142136, 1.0) + 0.5) * 2.0 - 1.0) * vec2(1.4142136, 1.0);
    float d = 2.5 + 3.0 * clamp(baseP, 0.0, 1.0) + 1.5 * sin(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    int di = int(floor(d));
    float f = smoothstep(0.55, 1.0, fract(d));
    vec3 col = mix(dinSheet(q, di, 1.0), dinSheet(q, di + 1, 1.0), f);
    finish(col * (0.95 + 0.15 * clamp(audioSwell, 0.0, 1.0)));
}
