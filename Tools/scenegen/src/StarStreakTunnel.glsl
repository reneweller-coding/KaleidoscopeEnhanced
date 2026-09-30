//@doc
 * @brief STAR STREAK TUNNEL: the jump to light speed -- thousands of stars
 * stretch into streaks that race outward from the centre, each streak
 * coloured from the photograph (which lines a faint tunnel behind them),
 * longer and brighter the faster we go; the streaks come in waves, a soft
 * glow sits at the vanishing point, and the whole starfield slowly rolls.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioSpread     -> streak length (the sense of speed)
 *   audioKick       -> the streaks flare (light)
 *   audioPhase      -> the starfield rolls (integrated)
 *   audioMode       -> colour: blue-white in minor, the photo's warm colours in major
 *   audioSwell      -> the tunnel behind shows (slow)
 *
 * Knobs: densityP (stars), widthP (streak width), tunnelP (tunnel brightness), hueP.
//@params densityP widthP tunnelP
//@audio audioSpread audioKick audioPhase audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x) + 0.02 * sceneTime + 0.2 * audioPhase;
    float travel = 0.5 * sceneTime + 4.0 * audioAdvance;
    // The tunnel behind (faint).
    float z = 0.4 / r;
    vec2 cs = vec2(cos(a), sin(a));
    float fw = max(length(fwidth(cs)) / 3.14159265, fwidth(z) * 0.3) * 1024.0;
    vec3 tun = imgLod(vec2(a / 3.14159265, (z + travel) * 0.3), clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    vec3 col = tun * (0.04 + 0.2 * clamp(tunnelP, 0.0, 1.0)) * (0.5 + swell) * exp(-z * 0.1);
    // Streaks: angular bins (even count), several stars per bin at their own depths.
    float N = 2.0 * floor(60.0 + 80.0 * clamp(densityP, 0.0, 1.0));
    float sa = a / 6.2831853 * N;
    float bin = floor(sa);
    float fa = fract(sa) - 0.5;
    float len = 0.6 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    float wA = (0.08 + 0.2 * clamp(widthP, 0.0, 1.0));
    for (int k = -1; k <= 1; ++k) {
        float b = mod(bin + float(k), N);
        for (int s = 0; s < 3; ++s) {
            float fs = float(s);
            float h = hash21(vec2(b, fs));
            float off = (hash21(vec2(b, fs + 7.0)) - 0.5) * 0.7;   // angular offset inside the bin
            // Star depth cycles toward us; screen radius r = 0.4 / z.
            float zc = mod(h * 6.0 - travel * (0.8 + 0.4 * hash21(vec2(b, fs + 3.0))), 6.0) + 0.3;
            float r0 = 0.4 / zc;                                // head
            float r1 = 0.4 / (zc + len * (0.5 + 0.5 * hash21(vec2(b, fs + 5.0))));   // tail
            float along = smoothstep(r1, r0, r) * step(r, r0 + 0.002);
            float fade = smoothstep(0.3, 0.6, zc) * smoothstep(6.3, 4.5, zc);        // born far, gone before the wrap
            float dA = abs(fa - float(k) - off) / max(wA, 1e-3);
            float lat = exp(-dA * dA * 2.0);
            vec3 sc = mix(vec3(0.7, 0.85, 1.0), glowColour(imgLod(vec2(b / N, h), 3.0), vec2(b, fs), hueP * 0.159), 0.3 + 0.6 * mode);
            col += sc * lat * along * along * fade * (0.8 + 1.2 * kick) * (0.5 + 0.8 / (zc + 0.5));
        }
    }
    // Glow at the vanishing point.
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(travel * 0.02, 0.0), hueP * 0.159);
    col += gc * exp(-r * 12.0) * (0.6 + 0.8 * swell);
    finish(col);
}
