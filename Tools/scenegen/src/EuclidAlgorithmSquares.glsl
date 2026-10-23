//@doc
 * @brief EUCLID ALGORITHM SQUARES: a rectangle with the side ratio x cut into squares by Euclid's algorithm -- the largest square off one end, then the largest off what is left, and so on -- until the ratio is a fraction in lowest terms;
 * each square carries the photo.  The ratio x glides from rational to rational with the chords of the music (the intervals' ratios of three to two, four to three, five to four) and passes the golden section, where the squares
 * wind into the eternal spiral.  The squares change continuously: the little new squares that arise are born at nothing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the ratio x glides through the intervals and the golden section
 *   audioSwell      -> the light on the squares
 *
 * Knobs: sizeP (the size of the rectangle), hueP.
//@params sizeP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float Hr = 0.82 + 0.17 * clamp(sizeP, 0.0, 1.0);
    float ratio = 1.2 + 0.78 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance + 0.01 * sceneTime));
    float Wr = min(Hr * ratio, 0.98 * asp);
    vec2 lo = vec2(-0.5 * Wr, -0.5 * Hr);
    vec2 sz = vec2(Wr, Hr);
    vec3 col = imgLod(p * 0.8 + 0.5, 4.0) * 0.2;
    float idx = 0.0;
    float found = 0.0;
    vec2 qs = vec2(0.0);
    float side = 1.0;
    for (int i = 0; i < 14; ++i) {
        float fi = float(i);
        float s = min(sz.x, sz.y);
        vec2 sq = lo;
        vec2 sqSize = vec2(s);
        bool horiz = sz.x >= sz.y;
        float par = mod(fi, 4.0);
        vec2 slo = lo;
        if (horiz) { if (par > 1.5) slo.x = lo.x + sz.x - s; } else { if (par > 1.5) slo.y = lo.y + sz.y - s; }
        if (all(greaterThanEqual(p, slo)) && all(lessThan(p, slo + vec2(s)))) {
            found = 1.0; idx = fi; qs = (p - slo) / s; side = s;
            break;
        }
        if (horiz) { if (par > 1.5) { sz.x -= s; } else { lo.x += s; sz.x -= s; } }
        else { if (par > 1.5) { sz.y -= s; } else { lo.y += s; sz.y -= s; } }
        if (min(sz.x, sz.y) < 0.004) break;
    }
    if (found > 0.5) {
        vec2 uv = 0.1 + 0.8 * (idx > 0.5 && mod(idx, 2.0) > 0.5 ? qs.yx : qs) + 0.05 * vec2(sin(idx), cos(1.7 * idx));
        vec3 c = imgLod(uv, 0.6 + 2.0 * clamp(0.1 - side * 0.5, 0.0, 1.0));
        float edge = smoothstep(0.0, 0.012 / max(side, 0.02), min(min(qs.x, 1.0 - qs.x), min(qs.y, 1.0 - qs.y)));
        col = c * (0.6 + 0.4 * edge) * (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0)) * 1.1;
    }
    finish(col);
}
