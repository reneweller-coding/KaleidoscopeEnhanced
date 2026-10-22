//@doc
 * @brief LISSAJOUS CURVE TABLE: the Lissajous table: a grid of figures, each drawn by a point whose x follows its
 * column's frequency and whose y follows its row's, so every cell holds the figure of its row and column ratio; a
 * bright point runs along each, and the curves glow behind it.  The figures are closed curves x = sin(a t + d),
 * y = sin(b t), sampled and drawn; the header row and column hold the generating circles with their running points.
 * The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the rows' and columns' frequencies follow the chord changes (the light cross-faded)
 *   audioAdvance     -> the points run and the phase d drifts (integrated)
 *   audioSwell       -> the curves' glow
 *
 * Knobs: gridP (how many rows and columns), lineP (the lines' width), hueP.  Distinct from LissajousOrbits, which shows
 * paths in space.
//@params gridP lineP
//@audio audioHarmAdvance audioSwell
//@body
/**  A figure's distance.
 *
 * @param q   The point (cell units, -0.5..0.5). (in)
 * @param a   The column's frequency. (in)
 * @param b   The row's frequency. (in)
 * @param d   The phase. (in)
 *
 * @return
 *   The distance.
 **/
float figure(vec2 q, float a, float b, float d)
{
    float best = 1e9;
    vec2 prev = 0.38 * vec2(sin(d), 0.0);
    for (int i = 1; i <= 100; ++i) {
        float t = 6.2831853 * float(i) / 100.0;
        vec2 cur = 0.38 * vec2(sin(a * t + d), sin(b * t));
        vec2 e = cur - prev;
        best = min(best, length(q - prev - e * clamp(dot(q - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0)));
        prev = cur;
    }
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float cells = floor(5.0 + 2.0 * clamp(gridP, 0.0, 1.0));
    float w = 0.006 + 0.006 * clamp(lineP, 0.0, 1.0);
    float run = 0.4 * sceneTime + 1.6 * audioAdvance;
    float d = 0.3 * run;
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float S = 1.0 / cells;
    vec2 g = (p + vec2(0.5 * 1.7777778, 0.5)) / S;
    vec2 cid = floor(g);
    vec2 q = g - cid - 0.5;
    vec3 col = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        float wj = j == 0 ? 1.0 - hm : hm;
        if (wj < 0.002) continue;
        float base = mod(hk + float(j), 3.0);
        float a = cid.x + 1.0 + base, b = cid.y + 1.0;          // the column's and the row's frequency
        if (cid.x < 0.5 && cid.y < 0.5) continue;
        float dist;
        vec2 pt;
        if (cid.y < 0.5) {                                      // the header row: the columns' circles
            dist = abs(length(q) - 0.38);
            pt = 0.38 * vec2(cos(a * run * 0.25 + d), sin(a * run * 0.25 + d));
        } else if (cid.x < 0.5) {                               // the header column: the rows' circles
            dist = abs(length(q) - 0.38);
            pt = 0.38 * vec2(cos(b * run * 0.25), sin(b * run * 0.25));
        } else {
            dist = figure(q, a, b, d);
            pt = 0.38 * vec2(sin(a * run * 0.25 + d), sin(b * run * 0.25));
        }
        float gl = exp(-pow(dist * S / w * 2.0, 2.0)) * 0.7 + 0.12 * exp(-dist * S / (w * 3.0));
        float dot_ = exp(-pow(length(q - pt) * S / 0.012, 2.0));
        col += (famLight(fh, fract(0.13 * (cid.x + cid.y)), 0.3) * gl + famLight(fh, 0.5, 0.85) * dot_) * wj;
    }
    finish(col * glow);
}
