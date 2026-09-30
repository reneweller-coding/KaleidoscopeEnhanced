//@doc
 * @brief TEXTURE PINE CONE SPIRALS: looking down onto an endless pine cone
 * (or the heart of a sunflower) -- scales arranged in the golden
 * Fibonacci spirals, 8 winding one way and 13 the other, growing from
 * the tiny centre outward forever; each scale is a small cushion cut from
 * the photograph, lit at its tip and shadowed at its base where the next
 * scale overlaps it; the cone grows slowly toward us and turns.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the cone grows outward (integrated, jump-free)
 *   audioPhase      -> the cone turns (integrated)
 *   audioSpread     -> the scales swell (gaps close)
 *   audioKick       -> the scale tips glint (light)
 *   audioMode       -> light: cool in minor, warm in major
 *   audioSwell      -> the glow at the centre (slow)
 *
 * Knobs: gapP (gap between scales), photoP (photo inside each scale), bulgeP (scale relief), hueP.
//@params gapP photoP bulgeP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float th = atan(p.y, p.x) + 0.03 * sceneTime + 0.3 * audioPhase;
    float lr = log(r) - (0.05 * sceneTime + 0.35 * audioAdvance);
    // Orthogonal Fibonacci lattice in (theta, log r): 2pi in theta advances
    // (8, 13) -> seamless; the log-r coefficients make the cells square.
    vec2 uv = vec2(8.0 * th + 13.0 * lr, 13.0 * th - 8.0 * lr) / 6.2831853;
    vec2 cid = floor(uv);
    vec2 f = fract(uv) - 0.5;
    // Rotate the cell frame so "outward" (increasing log r) points along +y.
    vec2 outD = normalize(vec2(13.0, -8.0));
    vec2 lf = vec2(dot(f, vec2(outD.y, -outD.x)), dot(f, outD));
    // Scale shape: a rounded shield, tip outward.
    float gap = 0.04 + 0.12 * clamp(gapP, 0.0, 1.0) - 0.05 * clamp(audioSpread, 0.0, 1.0);
    // Rounded rhombus filling the lattice cell (the cell itself is the scale).
    vec2 bq = abs(f) - (0.5 - gap - 0.12);
    float shield = length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0) - 0.12;
    // Footprint without the atan-cut spike: angular part from cos/sin.
    float fwA = length(fwidth(vec2(cos(th), sin(th))));
    float px = (fwA * 13.0 + fwidth(lr) * 13.0) / 6.2831853 + 1e-4;
    float inside = smoothstep(px, -px, shield);
    // Relief: rises from base to a ridge near the tip.
    float t = clamp(lf.y + 0.5, 0.0, 1.0);
    float bulge = 0.5 + 0.8 * clamp(bulgeP, 0.0, 1.0);
    float hgt = sqrt(max(0.0, -shield)) * bulge + t * 0.3;
    // Photo: the colour of the place, and a fine texture inside the scale.
    float cth = (8.0 * (cid.x + 0.5) + 13.0 * (cid.y + 0.5)) / 233.0 * 6.2831853;
    float clr = (13.0 * (cid.x + 0.5) - 8.0 * (cid.y + 0.5)) / 233.0 * 6.2831853;
    vec2 cpos = exp(clr) * vec2(cos(cth), sin(cth));
    vec3 base = imgLod(cpos * 0.8 + 0.5, 3.0);
    float kid = 13.0 * cid.x - 8.0 * cid.y;                    // same for cells that wrap onto each other
    vec3 fine = imgLod(lf * 0.3 + vec2(hash11(kid * 0.123), hash11(kid * 0.371 + 1.0)), 1.0);
    vec3 sc = mix(base, base * (0.5 + luma(fine)), clamp(photoP, 0.0, 1.0));
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lc = mix(vec3(0.8, 0.9, 1.1), vec3(1.15, 0.9, 0.7), mode);
    // Lighting: tip bright, base shadowed by the overlapping outer scale.
    float lit = 0.35 + 0.75 * smoothstep(0.0, 0.9, t) * (0.6 + 0.4 * hgt);
    vec3 col = sc * lc * lit * 1.3;
    float tip = exp(-pow((lf.y - 0.3) / 0.08, 2.0)) * exp(-lf.x * lf.x / 0.02);
    col += lc * tip * (0.1 + 0.6 * kick);
    col = mix(sc * 0.05, col, inside);
    // Dissolve into a glow toward the tiny centre.
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(lr * 0.1, 0.0), hueP * 0.159);
    float haze = smoothstep(0.25, 0.6, px);
    col = mix(col, gc * 0.3, haze);
    col += gc * exp(-r * 25.0) * (0.5 + swell);
    finish(col);
}
