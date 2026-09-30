//@doc
 * @brief TEXTURE LANTERN TUNNEL: flying through a tunnel whose wall is made of
 * glowing paper lanterns -- ring after ring of lanterns hung close together
 * line the bore, each lit from within, each showing a different piece of
 * the photograph on its paper, their warm light filling the tunnel and
 * reflecting on the ribs between them; far ahead the rings melt into a
 * golden glow.  An endless polar field like the Tunnel, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the rings slowly turn (integrated)
 *   audioSpread     -> throat depth
 *   audioMode       -> the lantern colour: amber in minor, rose-gold in major (slow blend)
 *   audioRoughness  -> the lanterns sway on their cords
 *   audioBass       -> the flames glow (light)
 *   audioKick       -> a ripple of brightness runs along the rings (light)
 *
 * Knobs: countP (lanterns per ring), photoP (how much the paper shows the photo),
 * gapP (spacing), hueP.
//@params countP photoP gapP
//@audio audioPhase audioSpread audioMode audioRoughness audioBass audioKick
//@body
void main()
{
    vec2 p = screenP() * 3.0;
    float bass = clamp(audioBass, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x) + 0.015 * sceneTime + 0.25 * audioPhase;
    float throat = 0.5 * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float z = throat / max(r, 1e-3);
    float u = z + 0.4 * sceneTime + 1.5 * audioAdvance;
    // Lantern grid on the wall: rings along u, lanterns around a.
    float nA = 2.0 * floor(5.0 + 5.0 * clamp(countP, 0.0, 1.0));    // even, so the seam hides
    float ringSp = 0.55 + 0.4 * clamp(gapP, 0.0, 1.0);
    vec2 g = vec2(a / 6.2831853 * nA, u / ringSp);
    vec2 gi = floor(g);
    float off = 0.5 * mod(gi.y, 2.0);                                // staggered rings
    g.x -= off; gi.x = floor(g.x);
    vec2 gf = fract(g) - 0.5;
    // Sway: each lantern swings slightly on its cord (stetig).
    gf.x += 0.08 * clamp(audioRoughness, 0.0, 1.0) * sin(sceneTime * 0.8 + hash21(gi) * 6.28);
    vec3 flameC = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.45, 0.35), clamp(audioMode, 0.0, 1.0));
    // Lantern body: rounded barrel.
    // Round lanterns (an ellipse bulging a little along the ring direction).
    float d = length(gf * vec2(1.0, 1.15)) - 0.36;           // stays inside its cell (no clipped rims)
    float fwd = fwidth(g.y) + fwidth(g.x) * 0.0;
    float aa = max(fwd, 0.01) * 1.5;
    float cov = smoothstep(aa, -aa, d);
    // The paper shows a piece of the photo (the id selects which piece).
    vec2 puv = vec2(mod(gi.x, nA) * 0.173, gi.y * 0.311) + gf * 0.35;
    vec3 paper = imgLod(puv, clamp(log2(max(fwd * 1024.0 * 0.35, 1.0)), 0.0, 8.0));
    vec3 tint = mix(flameC, glowColour(paper, vec2(cos(a), sin(a)) + gi.y * 0.1, hueP * 0.159), 0.25) * vec3(1.1, 0.88, 0.65);
    vec3 lit = tint * mix(1.0, 0.4 + 1.2 * luma(paper), clamp(photoP, 0.0, 1.0) * 0.8);
    float core = exp(-length(gf) * 6.0);
    // Paper ribs: horizontal lines on the lantern.
    float ribs = 0.8 + 0.2 * smoothstep(0.3, 0.0, abs(fract(gf.y * 6.0) - 0.5));
    float ripple = 1.0 + 0.8 * kick * exp(-pow(fract(u * 0.25 - sceneTime * 0.5) - 0.5, 2.0) * 30.0);
    vec3 lan = lit * (0.45 + 1.8 * core) * (0.75 + 0.6 * bass) * ripple * ribs;
    // Between the lanterns: dark wooden ribs catching their warm light.
    // The glow between lanterns needs the nearest lantern of the neighbouring
    // rows too (they are staggered), or the rows' seams show as rings.
    float dn = d;
    for (int k = -1; k <= 1; k += 2) {
        float ry = floor(u / ringSp) + float(k);
        float offk = 0.5 * mod(ry, 2.0);
        float gx = a / 6.2831853 * nA - offk;
        vec2 f2 = vec2(fract(gx) - 0.5, u / ringSp - ry - 0.5);
        dn = min(dn, length(f2 * vec2(1.0, 1.15)) - 0.36);
    }
    vec3 rib = vec3(0.03, 0.018, 0.012) + flameC * 0.18 * exp(-max(dn, 0.0) * 6.0) * (0.7 + 0.6 * bass);
    vec3 col = mix(rib, lan, cov);
    // Depth: far rings blur into golden haze; the far end glows.
    float far = smoothstep(2.0, 9.0, z);
    col = mix(col, flameC * 0.75, far);
    col += flameC * exp(-r * 2.0) * (0.3 + 0.6 * bass);
    col *= smoothstep(0.0, 0.25, r) * 0.5 + 0.5;
    finish(col);
}
