//@doc
 * @brief HITOMEZASHI STITCH: Japanese hitomezashi sashiko embroidery,
 * endlessly re-stitching itself -- white running stitches on indigo cloth
 * along every row and column, each line starting on or off the grid
 * according to a pattern, so that the dashes lock together into
 * surprising closed shapes and labyrinths; the row patterns slowly change
 * (lines fade out and are re-stitched offset), and the regions they
 * enclose are tinted by the photograph beneath.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the re-stitching (integrated, jump-free)
 *   audioSpread     -> how many lines change at once
 *   audioKick       -> the thread brightens (light)
 *   audioMode       -> white on indigo in minor, red on cream in major (blend)
 *   audioRoughness  -> the stitches get uneven
 *   audioSwell      -> the photo tint (slow)
 *
 * Knobs: gridP (grid size), stitchP (stitch thickness), photoP (photo shading), hueP.
//@params gridP stitchP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.3, 0.7, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float S = 12.0 + 12.0 * (1.0 - clamp(gridP, 0.0, 1.0));
    vec2 g = p * S;
    vec2 gi = floor(g);
    vec2 f = fract(g);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float chg = 0.3 + 0.7 * clamp(audioSpread, 0.0, 1.0);
    // Each row/column's offset bit, cross-faded when it changes (continuous):
    // bit(k) = step on a slow per-line wave.
    // Horizontal stitches lie along row y = gi.y, dashes on even or odd x segments.
    float hRow = floor(g.y + 0.5), vCol = floor(g.x + 0.5);   // the nearest horizontal / vertical line
    float hPhase = sin(T * (0.5 + 0.5 * hash11(hRow * 1.3)) * chg + hash11(hRow * 2.7) * 6.28);
    float vPhase = sin(T * (0.5 + 0.5 * hash11(vCol * 1.9 + 7.0)) * chg + hash11(vCol * 3.1 + 7.0) * 6.28);
    float hBit = smoothstep(-0.15, 0.15, hPhase);                // 0..1
    float vBit = smoothstep(-0.15, 0.15, vPhase);
    // Dash on the horizontal line at the bottom edge of this cell: on if (gi.x + bit) is even.
    float hOnA = mod(gi.x, 2.0) < 0.5 ? 1.0 : 0.0;             // dash on segment gi.x of that row
    float hOn = mix(hOnA, 1.0 - hOnA, hBit);
    float vOnA = mod(gi.y, 2.0) < 0.5 ? 1.0 : 0.0;
    float vOn = mix(vOnA, 1.0 - vOnA, vBit);
    float w = (0.05 + 0.06 * clamp(stitchP, 0.0, 1.0)) * (1.0 + rough * 0.4 * (noise2(g * 3.0) - 0.5));
    float px = fwidth(g.x) * 1.2;
    // Stitch = a dash with rounded ends along the edge, leaving a small gap at the grid points.
    float hd = abs(g.y - hRow);
    float hEnds = smoothstep(0.02, 0.1, f.x) * smoothstep(0.98, 0.9, f.x);
    float hSt = smoothstep(w + px, w - px, hd) * hEnds * hOn;
    float vd = abs(g.x - vCol);
    float vEnds = smoothstep(0.02, 0.1, f.y) * smoothstep(0.98, 0.9, f.y);
    float vSt = smoothstep(w + px, w - px, vd) * vEnds * vOn;
    float thread = max(hSt, vSt);
    vec2 uv = p * 0.5 + 0.5;
    vec3 ph = imgLod(uv, 2.5);
    vec3 cloth = mix(vec3(0.07, 0.1, 0.25), vec3(0.93, 0.89, 0.8), mode);
    vec3 tone = mix(cloth, cloth * (0.7 + 0.6 * ph), (0.2 + 0.4 * swell) * clamp(photoP + 0.2, 0.0, 1.2));
    tone *= 0.95 + 0.05 * noise2(g * 12.0);                      // cloth weave
    vec3 threadC = mix(vec3(0.95, 0.95, 0.92), vec3(0.75, 0.1, 0.1), mode);
    threadC = mix(threadC, glowColour(ph, p, hueP * 0.159), 0.1);
    vec3 col = mix(tone, threadC * (1.0 + 0.4 * kick), thread);
    finish(col);
}
