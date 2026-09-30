//@doc
 * @brief RECURSIVE RECT SUBDIVISION: a breathing Mondrian -- the plane is
 * split into rectangles, and those again, and again, by black bars, each
 * split line sliding slowly back and forth so the rectangles swell and
 * shrink against each other; some rectangles are flat primary colours,
 * others are windows onto the photograph, each showing its own crop of
 * the picture.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the split lines slide (integrated, jump-free)
 *   audioSpread     -> how far the splits swing
 *   audioKick       -> the colour fields brighten (light)
 *   audioMode       -> palette: Mondrian primaries in major, blue-grey in minor (tint)
 *   audioRoughness  -> the bars get irregular
 *   audioSwell      -> the photo windows glow (slow)
 *
 * Knobs: depthP (subdivision depth), barP (bar width), photoP (share of photo windows), hueP.
//@params depthP barP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.1 * sceneTime + 0.8 * audioAdvance;
    float swing = 0.15 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    vec2 g = p * 1.1 + vec2(0.01 * sceneTime, 0.0);
    vec2 cell = floor(g);
    vec2 lo = cell, hi = cell + 1.0;
    vec2 id = cell;
    float minEdge = 9.0;                                        // distance to the nearest bar
    float depth = 3.0 + 3.0 * clamp(depthP, 0.0, 1.0);
    for (int k = 0; k < 6; ++k) {
        if (float(k) >= depth) break;
        float h = hash21(id + float(k) * 7.1);
        bool vertical = mod(float(k) + floor(h * 2.0), 2.0) < 0.5;
        float s = 0.5 + swing * sin(T * (0.5 + h) + h * 6.28);
        if (vertical) {
            float x = mix(lo.x, hi.x, s);
            minEdge = min(minEdge, abs(g.x - x));
            if (g.x < x) { hi.x = x; id = id * 2.0 + vec2(1.0, 0.0); } else { lo.x = x; id = id * 2.0 + vec2(2.0, 0.0); }
        } else {
            float y = mix(lo.y, hi.y, s);
            minEdge = min(minEdge, abs(g.y - y));
            if (g.y < y) { hi.y = y; id = id * 2.0 + vec2(0.0, 1.0); } else { lo.y = y; id = id * 2.0 + vec2(0.0, 2.0); }
        }
        id = mod(id, 997.0);
    }
    minEdge = min(minEdge, min(min(g.x - cell.x, cell.x + 1.0 - g.x), min(g.y - cell.y, cell.y + 1.0 - g.y)));
    // Fill: flat colour or a photo window.
    float h = hash21(id + 3.0);
    vec3 c[5];
    c[0] = vec3(0.95, 0.93, 0.88); c[1] = vec3(0.85, 0.12, 0.1); c[2] = vec3(0.1, 0.2, 0.65); c[3] = vec3(0.98, 0.82, 0.1); c[4] = vec3(0.92, 0.9, 0.85);
    int ci = int(floor(hash21(id + 5.0) * 5.0));
    vec3 flat_ = c[0];
    for (int n = 1; n < 5; ++n) if (n == ci) flat_ = c[n];
    flat_ *= mix(vec3(0.85, 0.9, 1.05), vec3(1.05, 1.0, 0.95), mode);
    vec2 local = (g - lo) / max(hi - lo, 1e-3);
    vec2 cuv = hash22(id) * 0.6 + 0.2 + (local - 0.5) * 0.35 + vec2(0.003, 0.002) * sceneTime;
    vec3 win = imgLod(cuv, 1.0) * (0.9 + 0.4 * swell);
    win = mix(win, win * glowColour(imgLod(cuv, 5.0), id * 0.01, hueP * 0.159) * 1.3, 0.2);
    vec3 col = h < 0.25 + 0.5 * clamp(photoP, 0.0, 1.0) ? win : flat_ * (1.0 + 0.3 * kick);
    // Black bars.
    float bw = 0.006 + 0.012 * clamp(barP, 0.0, 1.0);
    bw *= 1.0 + 0.5 * clamp(audioRoughness, 0.0, 1.0) * (noise2(g * 30.0) - 0.5);
    float px = fwidth(g.x) * 1.2;
    float bar = smoothstep(bw + px, bw - px, minEdge);
    col = mix(col, vec3(0.03), bar);
    finish(col);
}
