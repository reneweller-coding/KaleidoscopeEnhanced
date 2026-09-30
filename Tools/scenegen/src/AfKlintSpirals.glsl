//@doc
 * @brief AF KLINT SPIRALS: in the spirit of Hilma af Klint's temple
 * paintings -- great spirals wind in two alternating colours like snail
 * shells, circles split into contrasting halves, over a soft field of
 * pastel pinks, ochres and blues; the spirals slowly turn (some inward,
 * some outward), the halves rotate, everything breathing gently; the
 * colours are softened by the photograph, which shows through like the
 * texture of old tempera on paper.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the spirals turn (integrated, jump-free)
 *   audioSpread     -> the forms grow
 *   audioMode       -> palette: blue-violet in minor, rose-ochre in major (a tint)
 *   audioKick       -> the light colours brighten (light)
 *   audioHarmChange -> the forms drift (slow, smoothed)
 *   audioSwell      -> the paper texture shows (slow)
 *
 * Knobs: turnsP (spiral turns), formP (form density), photoP, hueP.
//@params turnsP formP photoP
//@audio audioSpread audioMode audioKick audioHarmChange audioSwell
//@body
vec3 klintPal(float k)
{
    vec3 c[6];
    c[0] = vec3(0.93, 0.6, 0.62); c[1] = vec3(0.95, 0.82, 0.45); c[2] = vec3(0.45, 0.55, 0.78);
    c[3] = vec3(0.96, 0.93, 0.85); c[4] = vec3(0.25, 0.22, 0.3); c[5] = vec3(0.55, 0.72, 0.55);
    int i = int(mod(k, 6.0));
    vec3 r = c[0];
    for (int n = 1; n < 6; ++n) if (n == i) r = c[n];
    return r;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.06 * sceneTime + 0.5 * audioAdvance;
    float drift = 0.008 * sceneTime + 0.15 * clamp(audioHarmChange, 0.0, 1.0);
    // Pastel field: soft bands.
    float fb = fbm3(p * 0.8 + vec2(drift, 0.0));
    vec3 col = mix(klintPal(0.0), klintPal(2.0), smoothstep(0.3, 0.7, fb));
    col = mix(col, klintPal(1.0), smoothstep(0.55, 0.8, fbm3(p * 0.6 + 5.0 - vec2(0.0, drift))));
    // Forms on a jittered grid; the largest rim-distance wins.
    float S = 1.3 + 1.0 * clamp(formP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    float grow = 0.8 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float best = -9.0; vec2 bid = vec2(0.0); vec2 bl = vec2(0.0); float bR = 1.0;
    float pxg = fwidth(g.x) + 1e-4;                             // derivatives before any branch
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        if (hash21(id + 9.0) > 0.75) continue;
        vec2 c = id + 0.5 + 0.2 * vec2(sin(drift * 3.0 + hash21(id) * 6.28), cos(drift * 2.0 + hash21(id + 1.0) * 6.28));
        float R = grow * (0.3 + 0.2 * hash21(id + 2.0));        // <= 0.575: never reaches past the 3x3 search
        float sc = R - length(g - c);
        if (sc > best) { best = sc; bid = id; bl = g - c; bR = R; }
    }
    if (best > -0.02) {
        float px = pxg;
        float inside = smoothstep(-px, px, best);
        float h = hash21(bid + 4.0);
        float r = length(bl) / bR;
        float a = atan(bl.y, bl.x);
        vec3 fc;
        vec3 c1 = klintPal(floor(h * 6.0)), c2 = klintPal(floor(h * 6.0) + 2.0 + floor(hash21(bid + 5.0) * 3.0));
        if (h < 0.6) {
            // A spiral: two colours along an Archimedean spiral, turning.
            float turns = 2.0 + 4.0 * clamp(turnsP, 0.0, 1.0);
            float dir = hash21(bid + 6.0) < 0.5 ? 1.0 : -1.0;
            float sp = r * turns - (a + dir * T) / 6.2831853;
            float band = fract(sp);
            float bpx = pxg * (turns / bR + 1.0 / (6.2831853 * max(length(bl), 1e-3))) + 1e-4;
            // Sine edge avoids the fract jump at the atan cut: the band
            // boundaries are continuous (one turn = one band).
            float s = smoothstep(-bpx * 3.0, bpx * 3.0, sin(sp * 6.2831853));
            fc = mix(c1, c2, s);
        } else {
            // A circle split into halves, the split line rotating.
            float ang = T * (hash21(bid + 7.0) - 0.5) + h * 6.28;
            vec2 n = vec2(cos(ang), sin(ang));
            float s = smoothstep(-px, px, dot(bl, n));
            fc = mix(c1, c2, s);
            // An inner ring in the swapped colours.
            float ring = smoothstep(0.5 + px, 0.5 - px, r);
            fc = mix(fc, mix(c2, c1, s), ring);
        }
        col = mix(col, fc, inside);
    }
    // Tempera on paper: the photo as texture, and the mode's tint.
    vec2 uv = p * 0.6 + 0.5;
    vec3 ph = imgLod(uv, 1.5);
    col *= mix(vec3(1.0), 0.7 + 0.6 * ph, (0.25 + 0.35 * swell) * clamp(photoP, 0.0, 1.0));
    col *= mix(vec3(0.95, 0.95, 1.08), vec3(1.07, 0.98, 0.92), mode);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.4, 0.08);
    finish(col * (1.0 + 0.2 * kick));
}
