//@doc
 * @brief FOAM COARSENING: a sheet of soap foam in close-up -- polygonal
 * bubbles packed together, their thin walls glowing with interference
 * colours, thick bright Plateau borders where three walls meet, each
 * bubble a lens showing the photograph behind; the foam slowly shifts,
 * small bubbles shrink and big ones grow, walls slide and the pattern
 * rearranges; a second, fainter layer of foam lies behind.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the foam shifts (integrated, jump-free)
 *   audioSpread     -> bubble size spread
 *   audioKick       -> the Plateau borders flash (light)
 *   audioMode       -> wall colours: cool in minor, warm in major
 *   audioHigh       -> sparkles on the walls (light)
 *   audioSwell      -> the photo shows through (slow)
 *
 * Knobs: bubbleP (bubble size), wallP (wall brightness), lensP (lens effect), hueP.
//@params bubbleP wallP lensP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
// Power-diagram-ish Voronoi: each site has a weight (bubble size).
vec3 foam(vec2 x, float T, float spread, out vec2 cid, out vec2 toC)
{
    vec2 i = floor(x), f = fract(x);
    float d1 = 9.0, d2 = 9.0, d3 = 9.0;
    cid = i; toC = vec2(0.0);
    for (int y = -1; y <= 1; ++y) for (int xx = -1; xx <= 1; ++xx) {
        vec2 o = vec2(xx, y);
        vec2 h = hash22(i + o);
        vec2 c = o + 0.5 + 0.35 * vec2(sin(T * (0.3 + h.x * 0.3) + h.y * 6.28), cos(T * (0.25 + h.y * 0.3) + h.x * 6.28));
        float wgt = spread * 0.12 * sin(T * 0.2 + h.x * 6.28);   // size breathes
        float d = length(f - c) - wgt;
        if (d < d1) { d3 = d2; d2 = d1; d1 = d; cid = i + o; toC = f - c; }
        else if (d < d2) { d3 = d2; d2 = d; }
        else if (d < d3) d3 = d;
    }
    return vec3(d2 - d1, d3 - d1, d2);   // wall distance, junction distance
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.15 * sceneTime + 1.0 * audioAdvance;
    float spread = 0.3 + 0.7 * clamp(audioSpread, 0.0, 1.0);
    float S = 3.5 + 4.0 * (1.0 - clamp(bubbleP, 0.0, 1.0));
    vec2 cid, toC;
    vec3 F = foam(p * S, T, spread, cid, toC);
    float px = fwidth(p.x * S) + 1e-4;
    // Wall: thin film at the bisector; Plateau border thickening at junctions.
    float wall = exp(-F.x / (px * 1.5 + 0.012));
    // Plateau borders: where the third site is as close as the first two.
    float junction = exp(-F.y / 0.05) * exp(-F.x / 0.03);
    // Bubble lens: the photo seen through, magnified toward the bubble centre.
    float lensK = 0.3 + 0.6 * clamp(lensP, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5 - toC / S * lensK * 0.6 + vec2(0.003, 0.002) * sceneTime;
    vec3 ph = imgLod(uv, 1.0) * (0.25 + 0.5 * swell);
    vec3 col = ph * (0.7 + 0.3 * smoothstep(0.0, 0.3, F.x));
    // Wall colour: thin-film tint that varies along the walls.
    float film = fbm3(p * 2.5 + T * 0.1) * 1.2;                  // by place, so both sides of a wall agree
    vec3 fc = hsv2rgb(vec3(fract(film + hueP * 0.159 + mix(0.5, 0.05, mode)), 0.6, 1.0));
    float wb = 0.5 + 0.8 * clamp(wallP, 0.0, 1.0);
    col += fc * wall * wb * 0.8;
    col += vec3(1.0, 0.98, 0.95) * junction * (0.25 + 0.8 * kick) * wb;
    // A faint back layer.
    vec2 cid2, toC2;
    vec3 F2 = foam(p * S * 1.7 + 11.0, T * 0.8, spread, cid2, toC2);
    col += fc * exp(-F2.x / 0.02) * 0.12 * wb;
    // Sparkles on the walls: round glints.
    vec2 sg = p * 90.0;
    vec2 si = floor(sg), sf = fract(sg);
    float spk = smoothstep(0.3, 0.0, length(sf - 0.25 - 0.5 * hash22(si))) * step(0.93, hash21(si + 3.0));
    float tw = pow(max(0.0, sin(sceneTime * 2.0 + hash21(si) * 30.0)), 8.0);
    col += vec3(1.0) * spk * tw * wall * (0.3 + 1.5 * hi);
    finish(col);
}
