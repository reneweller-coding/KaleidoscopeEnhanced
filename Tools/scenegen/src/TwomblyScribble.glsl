//@doc
 * @brief TWOMBLY SCRIBBLE: loops and scrawls in the manner of Cy Twombly's
 * blackboard paintings -- continuous looping white lines written across a
 * slate-grey ground, lines of chalk-like texture that loop, overlap and
 * drift, fading as they age, new rows of loops being written; the ground
 * holds the photograph as a smudged, erased memory.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the writing moves on (integrated, jump-free)
 *   audioSpread     -> the loop size
 *   audioKick       -> the chalk brightens (light)
 *   audioMode       -> the board: slate grey in minor, warm cream with graphite lines in major
 *   audioRoughness  -> the chalk breaks up
 *   audioSwell      -> the erased photo shows (slow)
 *
 * Knobs: rowP (rows of loops), loopP (loop tightness), lineP (line width), hueP.
//@params rowP loopP lineP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.25, 0.75, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 board = mix(vec3(0.24, 0.26, 0.27), vec3(0.9, 0.87, 0.8), mode);
    vec3 smudge = imgK(uv, 3.5);
    board = mix(board, board * (0.7 + 0.6 * smudge), 0.15 + 0.35 * swell);
    board *= 0.95 + 0.05 * fbm3(p * 20.0);
    // Half-erased chalk ghosts of the kaleidoscoped photo on the board.
    board = mix(board, board * (0.55 + 0.9 * imgKRelief(uv, 2.0, vec2(-0.6, 0.8))), 0.35 + 0.3 * swell);
    vec3 chalk = mix(vec3(0.92, 0.92, 0.9), vec3(0.12, 0.12, 0.14), mode);
    vec3 col = board;
    float T = 0.1 * sceneTime + 0.6 * audioAdvance;
    float nR = 3.0 + 4.0 * clamp(rowP, 0.0, 1.0);
    // Rows: y bands; within each, a looping line (a trochoid) advancing along x.
    float yb = p.y * nR * 0.5 + 0.5;
    float ri = floor(yb);
    float ink = 0.0;
    for (int k = -1; k <= 1; ++k) {
        for (int m = 0; m < 2; ++m) {                           // two scrawled lines per row
            float fm = float(m);
            float r = ri + float(k);
            float h = hash11(r * 1.7 + 3.0 + fm * 11.0);
            float yc = (r + 0.5 - 0.5) / (nR * 0.5) + 0.03 * sin(p.x * 2.0 + h * 6.0) + (fm - 0.5) * 0.04;
            // Loop size wanders along the line (the hand's rhythm).
            float R0 = (0.06 + 0.05 * clamp(audioSpread, 0.0, 1.0)) * (0.7 + 0.6 * h);
            float tight = 0.5 + 1.2 * clamp(loopP, 0.0, 1.0);
            float a = R0 / tight;
            float shift = T * (0.1 + 0.05 * h) + h * 10.0;
            float t0 = (p.x + shift) / a;
            float best = 1e3;
            for (int s = -9; s <= 9; ++s) {
                float t = t0 + float(s) * 0.4;
                float t2 = t + 0.4;
                float R1 = R0 * (0.6 + 0.8 * noise2(vec2(t * 0.15, h * 7.0)));
                float R2 = R0 * (0.6 + 0.8 * noise2(vec2(t2 * 0.15, h * 7.0)));
                vec2 q = vec2(a * t - R1 * 1.3 * sin(t) - shift, yc + R1 * cos(t) + 0.02 * sin(t * 0.37 + h * 5.0));
                vec2 q2 = vec2(a * t2 - R2 * 1.3 * sin(t2) - shift, yc + R2 * cos(t2) + 0.02 * sin(t2 * 0.37 + h * 5.0));
                best = min(best, sdSeg(p, q, q2));
            }
            float age = 0.5 + 0.5 * sin(T * 0.3 + h * 6.28);
            float w = (0.0015 + 0.0035 * clamp(lineP, 0.0, 1.0)) * (0.7 + 0.6 * h);
            float line = smoothstep(w + 0.0015, w - 0.0015, best);
            line *= 1.0 - (0.2 + 0.5 * rough) * smoothstep(0.45, 0.75, noise2(p * 300.0 + r + fm * 3.0));
            ink = max(ink, line * (0.25 + 0.75 * age));
        }
    }
    col = mix(col, chalk * (1.0 + 0.3 * kick), ink);
    col = mix(col, col * glowColour(smudge, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
