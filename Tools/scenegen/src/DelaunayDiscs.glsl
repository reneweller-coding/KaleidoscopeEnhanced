//@doc
 * @brief DELAUNAY DISCS: Robert Delaunay's "simultaneous contrasts" set in
 * motion -- great discs of concentric rings, each ring split into
 * quarter-sectors of bold contrasting colour, overlap across the whole
 * picture; the rings turn slowly, neighbouring rings in opposite
 * directions, so the colours slide past each other and the discs seem to
 * pulse and vibrate; the colours are drawn from the photograph, with a
 * painted, brushed surface.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rings turn (integrated, jump-free)
 *   audioSpread     -> the discs grow (more overlap)
 *   audioMode       -> palette: cool contrasts in minor, warm in major
 *   audioKick       -> the colours brighten (light)
 *   audioRoughness  -> the brushed paint texture
 *   audioHarmChange -> the discs drift to new places (slow, smoothed)
 *
 * Knobs: ringP (ring count), sectorP (sectors per ring), photoP (photo colours), hueP.
//@params ringP sectorP photoP
//@audio audioSpread audioMode audioKick audioRoughness audioHarmChange
//@body
// One rich palette of eight Delaunay colours; the mode only warms or cools it.
vec3 delaunayPal(float k, float mode)
{
    vec3 c[8];
    c[0] = vec3(0.9, 0.25, 0.15); c[1] = vec3(1.0, 0.75, 0.15); c[2] = vec3(0.15, 0.3, 0.75); c[3] = vec3(0.3, 0.65, 0.45);
    c[4] = vec3(0.95, 0.5, 0.6);  c[5] = vec3(0.55, 0.3, 0.65); c[6] = vec3(0.95, 0.92, 0.85); c[7] = vec3(0.08, 0.08, 0.12);
    int i = int(mod(k, 8.0));
    vec3 r = c[0];
    for (int n = 1; n < 8; ++n) if (n == i) r = c[n];
    return r * mix(vec3(0.9, 0.95, 1.1), vec3(1.1, 1.0, 0.9), mode);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.1 * sceneTime + 0.8 * audioAdvance;
    float drift = 0.01 * sceneTime + 0.2 * clamp(audioHarmChange, 0.0, 1.0);
    // Discs on a jittered grid; the one whose rim is furthest away on top.
    float S = 1.6;
    vec2 g = p * S;
    vec2 gi = floor(g);
    float best = -9.0; vec2 bid = vec2(0.0); vec2 bl = vec2(0.0); float bR = 1.0;
    float grow = 0.75 + 0.3 * clamp(audioSpread, 0.0, 1.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 c = id + 0.5 + 0.3 * vec2(sin(drift + hash21(id) * 6.28), cos(drift * 0.8 + hash21(id + 1.0) * 6.28));
        float R = grow * (0.6 + 0.35 * hash21(id + 2.0));
        float d = length(g - c);
        float sc = R - d;
        if (sc > best) { best = sc; bid = id; bl = g - c; bR = R; }
    }
    // Rings and sectors of the chosen disc.
    float nR = 3.0 + 4.0 * clamp(ringP, 0.0, 1.0);
    float rr = length(bl) / bR;                                 // 0..1 inside, >1 outside (background arcs)
    float ring = floor(rr * nR);                                // (space)
    float dir = mod(ring, 2.0) < 0.5 ? 1.0 : -1.0;
    float ang = atan(bl.y, bl.x) + dir * T * (0.3 + 0.2 * hash21(bid + ring)) + hash21(bid + ring * 3.0) * 6.28;
    float nS = 2.0 * floor(1.0 + 2.0 * clamp(sectorP, 0.0, 1.0));   // 2, 4 or 6 sectors
    float sa = ang * nS / 6.2831853;
    float sector = mod(floor(sa), nS);
    float k = floor(hash21(bid * 1.7 + vec2(ring, sector)) * 8.0);
    vec3 c = delaunayPal(k, mode);
    // Photo colours mixed in.
    vec3 pc = glowColour(imgLod(vec2(hash21(bid + ring), hash21(bid + sector + 4.0)), 4.0), bid + ring, hueP * 0.159);
    c = mix(c, pc * 0.9, 0.25 * clamp(photoP, 0.0, 1.0));
    // Brushed paint: strokes following the ring direction.
    float brush = noise2(vec2(ang * 8.0, rr * 60.0) + bid * 3.0);
    c *= 0.95 + (0.04 + 0.1 * rough) * (brush - 0.5) * 2.0;
    // Thin dark lines between rings and sectors, a little irregular.
    float pxR = fwidth(rr * nR) + 1e-4;
    float ringLine = smoothstep(pxR * 1.5, 0.0, abs(fract(rr * nR) - 0.5) - 0.5 + pxR * 1.5 + 0.0);
    float pxS = length(fwidth(vec2(cos(ang), sin(ang)))) * nS / 6.2831853 * 4.0 + 1e-4;
    float secLine = smoothstep(pxS, 0.0, min(fract(sa), 1.0 - fract(sa)) * rr);
    c *= 1.0 - 0.35 * max(ringLine, secLine) * step(rr, 1.0);
    // Outside all discs: large faint arcs of the background.
    if (rr > 1.0) c = mix(c, c * 0.55, 0.5);
    finish(c * (1.0 + 0.3 * kick));
}
