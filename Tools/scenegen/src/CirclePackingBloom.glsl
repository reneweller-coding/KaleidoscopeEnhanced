//@doc
 * @brief CIRCLE PACKING BLOOM: a breathing circle packing -- large discs
 * swell and shrink slowly, and in the gaps between them smaller discs
 * grow to fill every space they can, and still smaller ones in the gaps
 * between those, never overlapping, so the whole plane stays densely
 * packed while its sizes keep shifting.  Each disc holds a piece of the
 * photograph, magnified and ringed with concentric bands, with a bright
 * rim.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the discs breathe (integrated, jump-free)
 *   audioSpread     -> the big discs grow, pushing the small ones out
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> fill: cool photo tint in minor, warm in major
 *   audioRoughness  -> the concentric bands
 *   audioSwell      -> the discs' inner glow (slow)
 *
 * Knobs: sizeP (scale), gapP (gap between discs), bandP (band count), hueP.
//@params sizeP gapP bandP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
float gGap, gT, gSpread;
// Level-0 disc of cell c (units: level-0 cells).
vec3 disc0(vec2 c)
{
    vec2 ctr = c + 0.5 + 0.18 * (hash22(c) - 0.5);
    float h = hash21(c + 1.0);
    float r = (0.27 + 0.1 * sin(gT * (0.5 + 0.5 * h) + h * 6.28)) * (0.9 + 0.2 * gSpread);   // <= 0.407: never touches a neighbour
    return vec3(ctr, r);
}
// Distance from x to the nearest level-0 disc edge.
float gap0(vec2 x)
{
    vec2 ci = floor(x);
    float d = 9.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec3 D = disc0(ci + vec2(i, j));
        d = min(d, length(x - D.xy) - D.z);
    }
    return d;
}
// Level-1 disc (cells a third of level 0), radius limited by level 0.
vec3 disc1(vec2 c)
{
    vec2 ctr = (c + 0.5 + 0.3 * (hash22(c + 7.0) - 0.5)) / 3.0;
    float h = hash21(c + 5.0);
    float want = (0.13 + 0.04 * sin(gT * (0.7 + 0.6 * h) + h * 6.28)) / 1.0;
    float r = min(want, gap0(ctr) - gGap);
    return vec3(ctr, max(r, 0.0));
}
float gap1(vec2 x)
{
    vec2 ci = floor(x * 3.0);
    float d = 9.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec3 D = disc1(ci + vec2(i, j));
        if (D.z > 0.0) d = min(d, length(x - D.xy) - D.z);
    }
    return d;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float S = 3.0 + 3.0 * clamp(sizeP, 0.0, 1.0);
    vec2 x = p * S + vec2(0.03, 0.02) * sceneTime;
    gGap = 0.01 + 0.03 * clamp(gapP, 0.0, 1.0);
    gT = 0.25 * sceneTime + 1.5 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    // Find the disc covering x: level 0, then 1, then 2.
    float pxx = fwidth(x.x);                                    // derivatives before any branch
    vec3 D = vec3(0.0, 0.0, -1.0); float lvl = -1.0; vec2 did = vec2(0.0);
    {
        vec2 ci = floor(x);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec3 d0 = disc0(ci + vec2(i, j));
            if (length(x - d0.xy) < d0.z) { D = d0; lvl = 0.0; did = ci + vec2(i, j); }
        }
    }
    if (lvl < 0.0) {
        vec2 ci = floor(x * 3.0);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec3 d1 = disc1(ci + vec2(i, j));
            if (d1.z > 0.0 && length(x - d1.xy) < d1.z) { D = d1; lvl = 1.0; did = ci + vec2(i, j); }
        }
    }
    if (lvl < 0.0) {
        vec2 ci = floor(x * 9.0);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 c = ci + vec2(i, j);
            vec2 ctr = (c + 0.5 + 0.3 * (hash22(c + 11.0) - 0.5)) / 9.0;
            float h = hash21(c + 13.0);
            float want = 0.04 + 0.015 * sin(gT * (0.9 + 0.6 * h) + h * 6.28);
            float r = min(want, min(gap0(ctr), gap1(ctr)) - gGap * 0.6);
            if (r > 0.0 && length(x - ctr) < r) { D = vec3(ctr, r); lvl = 2.0; did = c; }
        }
    }
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv0 = p * 0.7 + 0.5;
    vec3 col = imgLod(uv0, 4.0) * 0.05;                         // the ground between discs
    if (lvl >= 0.0) {
        vec2 l = (x - D.xy) / D.z;                             // -1..1 in the disc
        float rr = length(l);
        vec2 cuv = D.xy / S * 0.7 + 0.5 + l * D.z / S * 1.4;   // the photo under the disc, magnified
        vec3 ph = imgLod(cuv, 0.8);
        vec3 tint = glowColour(imgLod(D.xy / S * 0.7 + 0.5, 4.0), did * 0.1 + lvl, hueP * 0.159 + lvl * 0.1);
        tint = mix(tint, tint * mix(vec3(0.7, 0.85, 1.15), vec3(1.15, 0.9, 0.7), mode), 0.5);
        vec3 c = mix(ph, tint * (0.3 + luma(ph) * 1.2), 0.5);
        float nb = 2.0 + 6.0 * clamp(bandP, 0.0, 1.0);
        float band = 0.5 + 0.5 * cos(rr * nb * 6.2831853 - gT * 0.5);
        c *= 1.0 - (0.1 + 0.3 * clamp(audioRoughness, 0.0, 1.0)) * band;
        c *= 0.75 + 0.35 * (1.0 - rr * rr);                    // domed
        c += tint * exp(-rr * 3.0) * (0.15 + 0.4 * swell);
        float px = pxx / D.z * 1.2;
        float rim = exp(-(1.0 - rr) / (px * 2.0 + 0.02));
        c += mix(tint, vec3(1.0), 0.5) * rim * (0.35 + 0.8 * kick);
        float edge = smoothstep(1.0, 1.0 - px, rr);
        col = mix(col, c, edge);
    }
    finish(col);
}
