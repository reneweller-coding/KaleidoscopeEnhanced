//@doc
 * @brief TEXTURE FROST CREEP: frost growing over a window pane with the
 * photograph behind it -- feathery ice ferns creep across the glass from
 * many seeds, branching and filling in, frosting the view into a soft
 * blur; then they slowly melt back, the glass clears in patches and the
 * picture shines through sharp again, until the frost returns.  The ferns
 * sparkle where light catches their facets.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the frost grows and melts (integrated, jump-free)
 *   audioSpread     -> how far the frost reaches
 *   audioHigh       -> the crystals sparkle (light)
 *   audioMode       -> the light behind: cold blue in minor, warm in major
 *   audioRoughness  -> the fern branching
 *   audioSwell      -> the pane mists up (slow)
 *
 * Knobs: fernP (fern scale), seedP (seed density), clearP (how clear the photo shows), hueP.
//@params fernP seedP clearP
//@audio audioSpread audioHigh audioMode audioRoughness audioSwell
//@body
// Feathery fern field: ridged noise stretched along a seed-radial direction.
float fern(vec2 w, vec2 dir, float scale, float rough)
{
    vec2 t = vec2(dot(w, dir), dot(w, vec2(-dir.y, dir.x)));
    float spine = 1.0 - abs(noise2(vec2(t.x * 0.8, t.y * 3.0) * scale) * 2.0 - 1.0);
    // Barbs at 60 degrees off the spine.
    vec2 b1 = rot2(1.05) * t, b2 = rot2(-1.05) * t;
    float barb = max(1.0 - abs(noise2(vec2(b1.x * 1.5, b1.y * 12.0) * scale) * 2.0 - 1.0),
                     1.0 - abs(noise2(vec2(b2.x * 1.5, b2.y * 12.0) * scale + 5.0) * 2.0 - 1.0));
    return max(pow(spine, 8.0), pow(barb, 6.0 - 2.0 * rough) * 0.8);
}

void main()
{
    vec2 p = screenP();
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.003, 0.002) * sceneTime;
    // Seeds: a smooth growth direction (weighted away from nearby seeds)
    // and a smooth distance to them, so neighbouring ferns flow together.
    float sd = 2.0 + 3.0 * clamp(seedP, 0.0, 1.0);
    vec2 g = p * sd;
    vec2 gi = floor(g);
    vec2 acc = vec2(0.0); float wsum = 0.0, dsum = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 c = gi + vec2(i, j) + 0.2 + 0.6 * hash22(gi + vec2(i, j));
        float d = length(g - c);
        float wt = exp(-d * d * 3.0);
        acc += wt * (g - c) / max(d, 1e-3);
        wsum += wt; dsum += wt * d;
    }
    vec2 dir = normalize(acc + vec2(1e-4, 0.0));
    float best = dsum / max(wsum, 1e-4);
    // The growth front advances and retreats in slow waves across the pane.
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    float grow = 0.5 + 0.5 * sin(T + 6.28 * fbm3(p * 0.6 + 2.0));
    float reach = (0.2 + 0.9 * grow) * (0.7 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    float front = best + 0.25 * (fbm3(p * 6.0) - 0.5);
    float cover = smoothstep(reach, reach - 0.3, front);
    float sid = 0.0;
    float sc = 6.0 + 10.0 * (1.0 - clamp(fernP, 0.0, 1.0));
    float f = fern(p * sc * 0.4 + sid * 7.0, dir, 3.0, rough);
    float f2 = fern(p * sc * 0.9 + sid * 3.0, rot2(0.7) * dir, 3.0, rough);
    float ice = max(f, f2 * 0.7) * cover;
    // The pane: the photo sharp where clear, frosted (blurred, whitened) under ice.
    float clr = clamp(clearP, 0.0, 1.0);
    vec3 sharp = imgLod(uv, 0.3);
    vec3 blur = imgLod(uv, 4.5);
    vec3 back = mix(sharp, blur, clamp(cover * 0.8 + 0.3 * swell, 0.0, 1.0));
    vec3 tint = mix(vec3(0.75, 0.88, 1.1), vec3(1.1, 0.92, 0.75), mode);
    vec3 col = back * tint * (0.6 + 0.3 * clr);
    col = mix(col, mix(col, vec3(0.85, 0.92, 1.0), 0.5), cover * 0.35);  // frosted haze
    col += vec3(0.8, 0.9, 1.0) * ice * 0.55;
    // Sparkling facets on the ferns.
    vec2 sg = p * 160.0;
    vec2 si = floor(sg), sf = fract(sg);
    vec2 scn = 0.25 + 0.5 * hash22(si);
    float spk = smoothstep(0.3, 0.0, length(sf - scn)) * step(0.93, hash21(si + 3.0)) * ice;
    float stw = pow(max(0.0, sin(sceneTime * (1.0 + 2.0 * hash21(si)) + hash21(si + 1.0) * 30.0)), 8.0);
    col += vec3(1.0) * spk * stw * (0.3 + 1.5 * hi);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.08);
    finish(col);
}
