//@doc
 * @brief KUSAMA DOT INFINITY: an endless polka-dot regress -- dots of all
 * sizes cover everything and spiral inward into an infinite centre, each
 * ring of dots smaller than the last, forever drawing the eye in, as in an
 * infinity mirror room; the dots' sizes follow the photograph (bright
 * parts make large dots, dark parts small), their colours alternate
 * between the photo's colours and a bold two-tone, and the whole field
 * turns slowly and flows inward.  Mirrorable; continues beyond the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the inward flow (integrated, jump-free)
 *   audioPhase      -> the spiral turns (integrated)
 *   audioSpread     -> the dots swell
 *   audioKick       -> the dots flash (light)
 *   audioMode       -> two-tone: black on yellow in major, white on red in minor
 *   audioSwell      -> the glow halo around the dots (slow)
 *
 * Knobs: ringsP (dots per ring), spiralP (spiral pitch), photoP (photo colours), hueP.
//@params ringsP spiralP photoP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float N = 2.0 * floor(8.0 + 8.0 * clamp(ringsP, 0.0, 1.0));  // dots per turn (even)
    float flow = 0.15 * sceneTime + 1.0 * audioAdvance;
    float spin = 0.02 * sceneTime + 0.2 * audioPhase;
    // Log-polar lattice: u inward, v around; a spiral pitch shears it.
    float lr = log(r);
    float pitch = floor(0.5 + 3.0 * clamp(spiralP, 0.0, 1.0));  // whole steps keep the lattice closed
    vec2 g = vec2(lr * N / 6.2831853 + flow * N / 6.2831853, (a + spin) * N / 6.2831853);
    g.y += g.x * pitch / N;
    // Offset rows (hex-like packing).
    float row = floor(g.x);
    g.y += 0.5 * mod(row, 2.0);
    vec2 cid = floor(g);
    cid.y = mod(cid.y, N);                                     // wraps around the circle
    vec2 f = fract(g) - 0.5;
    // Photo at the dot's centre (in screen space).
    vec2 cg = floor(g) + 0.5;
    float cy = cg.y - 0.5 * mod(row, 2.0) - cg.x * pitch / N;
    float cr = exp((cg.x * 6.2831853 / N) - flow);
    float ca = cy * 6.2831853 / N - spin;
    vec2 cp = cr * vec2(cos(ca), sin(ca));
    vec2 cuv = cp * 0.7 + 0.5 + vec2(0.004, 0.003) * sceneTime;
    vec3 ph = imgLod(cuv, 3.0);
    float lum = luma(ph);
    float rad = (0.12 + 0.28 * smoothstep(0.1, 0.8, lum)) * (0.8 + 0.35 * clamp(audioSpread, 0.0, 1.0));
    // Antialias in lattice units.
    float px = fwidth(g.x) + 1e-4;
    float d = length(f);
    float dot_ = smoothstep(rad + px, rad - px, d);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 bg = mix(vec3(0.85, 0.08, 0.1), vec3(1.0, 0.82, 0.08), mode);
    vec3 dc = mix(vec3(1.0), vec3(0.03), mode);
    vec3 pcol = glowColour(ph, cp * 2.0, hueP * 0.159);
    float usePhoto = step(0.5, hash21(cid + 0.3)) * clamp(photoP, 0.0, 1.0);
    dc = mix(dc, pcol, usePhoto);
    bg = mix(bg, bg * (0.5 + 0.8 * luma(imgLod(p * 0.7 + 0.5, 4.0))), 0.35);
    vec3 col = mix(bg, dc * (1.0 + 0.6 * kick * hash21(cid + 5.0)), dot_);
    col += dc * exp(-max(d - rad, 0.0) / (0.08 + 0.1 * swell)) * (1.0 - dot_) * 0.25 * (0.3 + swell);
    // The centre dissolves into a soft haze instead of sub-pixel dots.
    float haze = smoothstep(1.5, 0.3, 1.0 / (px * 8.0));
    col = mix(col, mix(bg, dc, 0.3), clamp(haze, 0.0, 1.0));
    col *= 0.85 + 0.15 * smoothstep(0.0, 0.3, r);
    finish(col);
}
