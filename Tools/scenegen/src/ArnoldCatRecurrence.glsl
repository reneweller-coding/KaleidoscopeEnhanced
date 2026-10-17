//@doc
 * @brief ARNOLD CAT RECURRENCE: the photo, cut into N x N tiles on a torus, under Arnold's cat map (x, y) -> (2x + y,
 * x + y) -- chaos in its purest form: within a few steps the picture is noise.  But on a finite grid the map is a
 * permutation, so it must come back: after its recurrence period (12 steps for 144 tiles, 22 for 89, 14 for 377)
 * every tile is home again and the photo stands complete (Poincare recurrence).  Between the steps the tiles slide
 * in the map's two shears, continuously.  The period is one musical phrase: on the phrase's one the photo is whole.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the progress through the period: scrambled mid-phrase, whole on the one (continuous)
 *   audioSwell      -> how much of the tile grout shows
 *   audioKick       -> the grout flashes (light)
 *
 * Knobs: gridP (the grid: 89, 144 or 377 tiles a side), tilesP (how many tori across the screen), hueP.
//@params gridP tilesP
//@audio audioSwell audioKick audioPhrasePos
//@body
/**  A coordinate wrapped into 0..n.
 *
 * @param v  The coordinate. (in)
 * @param n  The period. (in)
 *
 * @return
 *   v modulo n, never negative.
 **/
float wrapN(float v, float n) { return v - n * floor(v / n); }

void main()
{
    vec2 p = screenP();
    int g = int(floor(clamp(gridP, 0.0, 0.999) * 3.0));
    float n = g == 0 ? 89.0 : (g == 1 ? 144.0 : 377.0);
    float period = g == 0 ? 22.0 : (g == 1 ? 12.0 : 14.0);
    // the progress through the period: the phrase position, or a 16-second clock when the music gives none
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float t = prog * period;
    float steps = floor(t), f = fract(t);
    // the screen shows the torus (one unit high) a few times across
    float tor = 1.0 + floor(clamp(tilesP, 0.0, 0.999) * 2.0);
    vec2 q = (p * tor + vec2(0.5)) * n;                         // in tiles
    // undo the partial step: the step is a shear y += x, then a shear x += y (the cat map is their product);
    // whole rows and columns of tiles slide, so at the step's end every tile sits exactly where the map puts it
    float s1 = clamp(2.0 * f, 0.0, 1.0), s2 = clamp(2.0 * f - 1.0, 0.0, 1.0);
    q.x = wrapN(q.x - s2 * floor(q.y), n);
    q.y = wrapN(q.y - s1 * floor(q.x), n);
    vec2 cell = floor(q), sub = q - cell;
    // undo the full steps exactly on the integer grid: the inverse map (x, y) -> (x - y, 2y - x)
    for (int i = 0; i < 22; ++i) {
        if (float(i) >= steps) break;
        cell = vec2(wrapN(cell.x - cell.y, n), wrapN(2.0 * cell.y - cell.x, n));
    }
    vec2 uv = (cell + sub) / n;
    vec3 photo = imgLod(uv, 0.0);
    // the grout between the tiles: none when the photo is whole, more while it is scrambled
    float scr = sin(3.14159265 * prog);
    vec2 e = min(sub, 1.0 - sub);
    float grout = 1.0 - smoothstep(0.0, 0.08 + 0.1 * clamp(audioSwell, 0.0, 1.0), min(e.x, e.y));
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * 0.45 + tone * 0.2 * (0.5 + clamp(audioKick, 0.0, 1.0)), grout * scr * 0.8);
    finish(col);
}
