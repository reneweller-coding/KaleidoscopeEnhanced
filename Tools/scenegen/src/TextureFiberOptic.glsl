//@doc
 * @brief TEXTURE FIBER OPTIC: a fibre-optic lamp seen from above -- a dense
 * spray of thin glass fibres fans out from several hubs, each fibre dark
 * along its length but glowing at its tip in the colour the colour wheel
 * inside the lamp is showing, the wheel being the photograph turning
 * slowly behind the hubs; the fibres sway gently, the tips twinkle.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the colour wheel turns (integrated, jump-free)
 *   audioSpread     -> the fibres fan out further
 *   audioKick       -> the tips flare (light)
 *   audioHigh       -> the tips twinkle (light)
 *   audioMode       -> the wheel: cool in minor, warm in major (tint)
 *   audioSwell      -> the fibres sway (slow)
 *
 * Knobs: fibreP (fibre density), hubP (hub spacing), tipP (tip size), hueP.
//@params fibreP hubP tipP
//@audio audioSpread audioKick audioHigh audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float S = 1.3 + 1.2 * clamp(hubP, 0.0, 1.0);
    vec2 g = p * S;
    vec2 gi = floor(g);
    vec3 col = vec3(0.005, 0.005, 0.01);
    float reach = 0.55 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float W = 0.03 * sceneTime + 0.25 * audioAdvance;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 hub = id + 0.5 + 0.2 * (hash22(id) - 0.5);
        vec2 d = g - hub;
        float r = length(d);
        if (r > reach * 1.15) continue;
        float a = atan(d.y, d.x);
        // Fibres: angular bins; each fibre ends at its own length with a tip.
        float N = 2.0 * floor(40.0 + 50.0 * clamp(fibreP, 0.0, 1.0));
        float sway = (0.03 + 0.05 * swell) * sin(0.4 * sceneTime + r * 3.0 + hash21(id) * 6.28) * r;
        float sa = (a + sway) / 6.2831853 * N;
        float bin = floor(sa);
        float fa = fract(sa) - 0.5;
        for (int k = -1; k <= 1; ++k) {
            float b = mod(bin + float(k), N);
            float h = hash21(vec2(b, id.x * 7.0 + id.y));
            float L = reach * (0.5 + 0.5 * h);
            float off = fa - float(k);
            // Tip: a small round glow at radius L.
            vec2 td = vec2(r - L, off * 6.2831853 / N * L);      // (radial, tangential) distance to the tip
            float ts = 0.008 + 0.018 * clamp(tipP, 0.0, 1.0);
            float td2 = length(td);
            // The colour wheel behind the hub: the photo, turning.
            vec2 wuv = vec2(0.5) + 0.3 * vec2(cos(a + W), sin(a + W)) * (0.3 + 0.7 * h) + id * 0.07;
            vec3 wc = imgLod(wuv, 3.0);
            wc = mix(wc, glowColour(wc, vec2(b, h), hueP * 0.159), 0.5);
            wc *= mix(vec3(0.8, 0.95, 1.15), vec3(1.15, 0.95, 0.8), mode);
            float tw = 0.7 + 0.3 * sin(sceneTime * (2.0 + 3.0 * h) + h * 30.0) * (0.3 + hi);
            col += wc * (smoothstep(ts, ts * 0.3, td2) * 2.0 + exp(-td2 / (ts * 2.5)) * 0.25) * tw * (0.9 + 1.2 * kick);
            // The fibre itself: faint line from the hub to the tip.
            float line = smoothstep(0.004, 0.0, abs(off) * 6.2831853 / N * r) * step(r, L) * smoothstep(0.05, 0.2, r);
            col += wc * line * 0.05 * (r / L);
        }
        // The hub's glow.
        col += glowColour(imgLod(id * 0.07 + 0.5, 5.0), id, hueP * 0.159) * exp(-r * 20.0) * 0.4;
    }
    finish(col);
}
