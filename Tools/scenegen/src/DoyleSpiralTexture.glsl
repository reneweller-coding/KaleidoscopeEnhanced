//@doc
 * @brief DOYLE SPIRAL TEXTURE: a Doyle spiral -- a packing of circles, each
 * touching six neighbours, winding out from an infinitely small centre in
 * interlocking spiral arms, every circle bigger than the one before; each
 * circle holds its own copy of the photograph (the map is conformal, so
 * every picture keeps its true shape), framed by a thin gold rim; the
 * spiral turns and grows toward us forever.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the spiral grows outward (integrated, jump-free)
 *   audioPhase      -> the spiral turns (integrated)
 *   audioSpread     -> the circles swell (gaps close)
 *   audioKick       -> the rims flash (light)
 *   audioMode       -> the gaps: deep blue in minor, warm dark in major
 *   audioSwell      -> the pictures glow (slow)
 *
 * Knobs: armsP (spiral arms: 5-3 or 8-5 packing, blended), photoZoomP, rimP, hueP.
//@params armsP photoZoomP rimP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv2(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }

// Hex lattice in log space closing after one turn: 2*pi*i = m*e1 + n*e2, e2 = w*e1.
vec4 doyle(vec2 w, float m, float n, float grow, float zoom, out float rim, out float cellK)
{
    vec2 om = vec2(0.5, 0.8660254);
    vec2 e1 = cdiv2(vec2(0.0, 6.2831853), vec2(m, 0.0) + n * om);
    vec2 e2 = cmul(om, e1);
    // Lattice coordinates.
    float det = e1.x * e2.y - e1.y * e2.x;
    vec2 xy = vec2(w.x * e2.y - w.y * e2.x, e1.x * w.y - e1.y * w.x) / det;
    vec2 b = floor(xy);
    float best = 1e9; vec2 bc = b;
    for (int j = 0; j <= 1; ++j) for (int i = 0; i <= 1; ++i) {
        vec2 c = b + vec2(i, j);
        vec2 cw = c.x * e1 + c.y * e2;
        float d = length(w - cw);
        if (d < best) { best = d; bc = c; }
    }
    float L = length(e1);
    float R = 0.5 * L * grow;
    vec2 cw = bc.x * e1 + bc.y * e2;
    vec2 local = (w - cw) / R;                                  // -1..1 inside the circle
    cellK = bc.x * n - bc.y * m;                                // the same for cells that wrap onto each other
    rim = best / R;
    return vec4(local, best, R);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-5);
    vec2 w = vec2(log(r) - (0.04 * sceneTime + 0.3 * audioAdvance), atan(p.y, p.x) + 0.02 * sceneTime + 0.2 * audioPhase);
    float grow = 0.9 + 0.1 * clamp(audioSpread, 0.0, 1.0);
    float zoom = 0.25 + 0.3 * clamp(photoZoomP, 0.0, 1.0);
    float rimA, kA, rimB, kB;
    vec4 A = doyle(w, 5.0, 3.0, grow, zoom, rimA, kA);
    vec4 B = doyle(w, 8.0, 5.0, grow, zoom, rimB, kB);
    float mixB = smoothstep(0.47, 0.53, clamp(armsP, 0.0, 1.0) + 0.001);   // a short cross-fade: two packings never sit on top of each other for long
    vec3 gap = mix(vec3(0.02, 0.03, 0.08), vec3(0.06, 0.03, 0.02), mode);
    vec3 outC[2]; float rims[2]; vec4 D[2]; float ks[2];
    D[0] = A; D[1] = B; rims[0] = rimA; rims[1] = rimB; ks[0] = kA; ks[1] = kB;
    for (int s = 0; s < 2; ++s) {
        vec4 d = D[s];
        vec2 local = d.xy;
        float rr = length(local);
        vec2 uv = local * zoom + vec2(hash11(ks[s] * 0.123), hash11(ks[s] * 0.371 + 1.0)) * 0.6 + 0.2 + vec2(0.003, 0.002) * sceneTime;
        vec3 ph = imgLod(uv, 0.8) * (0.85 + 0.4 * swell);
        float px = fwidth(rr) + 1e-4;
        float inside = smoothstep(1.0 + px, 1.0 - px, rr);
        vec3 rimC = mix(vec3(1.0, 0.8, 0.4), glowColour(ph, local, hueP * 0.159), 0.3);
        float rw = 0.04 + 0.08 * clamp(rimP, 0.0, 1.0);
        float rim = smoothstep(rw + px, 0.0, abs(rr - 1.0 + rw));
        vec3 c = mix(gap, ph * (0.8 + 0.2 * (1.0 - rr * rr)), inside);
        c = mix(c, rimC * (0.7 + 1.0 * kick), rim);
        outC[s] = c;
    }
    vec3 col = mix(outC[0], outC[1], mixB);
    // The infinitely small centre dissolves into a glow.
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(w.x * 0.1, 0.0), hueP * 0.159);
    col = mix(col, gc * 0.4, smoothstep(0.012, 0.0, r));
    finish(col);
}
