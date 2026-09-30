//@doc
 * @brief TEXTURE INFINITE ROSETTES: kaleidoscope rosettes nested without end
 * -- a large rosette of the photograph (mirrored into 2n petals) fills the
 * view, and at its centre another rosette opens, turned and with a
 * different petal count, and inside that another, forever; we sink
 * slowly into them while each rosette turns its own way, the borders
 * between them glowing rings.  Endless, mirrorable; the outermost rosette
 * continues beyond the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the descent into the rosettes (integrated, jump-free)
 *   audioPhase      -> the rosettes turn (integrated)
 *   audioSpread     -> the photo window inside the petals wanders further
 *   audioKick       -> the border rings flash (light)
 *   audioMode       -> petal counts lean higher in major, lower in minor
 *   audioSwell      -> the rosettes' centres glow (slow)
 *
 * Knobs: petalP (base petal count), ratioP (size ratio between rosettes), zoomP (photo scale), hueP.
//@params petalP ratioP zoomP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-5);
    float a = atan(p.y, p.x);
    float K = 2.5 + 2.0 * clamp(ratioP, 0.0, 1.0);             // size ratio between rosettes
    float lk = log(K);
    float flow = 0.05 * sceneTime + 0.35 * audioAdvance;
    float u = log(r) / lk + flow;                              // rosette level coordinate
    float lev = floor(u);                                      // identity of this rosette (space; moves with the flow)
    float f = fract(u);                                        // 0 inner edge .. 1 outer edge
    float h = hash11(lev * 0.731 + 3.0);
    float n = 2.0 * floor(3.0 + 3.0 * clamp(petalP + (h - 0.5) * 0.6 + (mode - 0.5) * 0.3, 0.0, 1.0));
    float rot = (0.05 * sceneTime + 0.4 * audioPhase) * (mod(lev, 2.0) < 0.5 ? 1.0 : -1.0) + h * 6.28;
    // Mirror fold into one petal.
    float sec = 6.2831853 / n;
    float fa = mod(a + rot, sec);
    fa = abs(fa - sec * 0.5);
    vec2 lp = f * vec2(cos(fa), sin(fa));                      // local petal coords, radius 0..1
    float z = 0.35 + 0.35 * clamp(zoomP, 0.0, 1.0);
    vec2 win = vec2(0.5) + (0.2 + 0.15 * clamp(audioSpread, 0.0, 1.0)) * vec2(sin(0.013 * sceneTime + h * 6.28), cos(0.011 * sceneTime + h * 4.0));
    vec2 uv = win + lp * z;
    // Mip footprint without the atan spike.
    float fwA = length(fwidth(vec2(cos(a), sin(a))));
    float fw = max(fwidth(u), fwA) * z * 1024.0;
    vec3 ph = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    float m = luma(imgLod(win, 7.0));
    vec3 col = max((ph - m) * 1.4 + m, 0.0);
    // Each rosette has a soft glowing centre and darkens toward its rim.
    vec3 gc = glowColour(imgLod(win, 5.0), vec2(lev, 0.0), hueP * 0.159 + h * 0.2);
    col *= 0.6 + 0.5 * smoothstep(1.0, 0.3, f);
    col += gc * exp(-f * 6.0) * (0.2 + 0.6 * swell);
    // Border rings.
    float px = fwidth(u) + 1e-4;
    float ring = exp(-min(f, 1.0 - f) / (px * 2.0));
    col += mix(gc, vec3(1.0), 0.4) * ring * (0.3 + 1.0 * kick);
    // The infinitely small centre.
    col = mix(col, gc * 0.5, smoothstep(0.35, 0.8, px));
    finish(col);
}
