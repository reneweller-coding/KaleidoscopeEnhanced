//@doc
 * @brief PHOTO-GUIDED TURING STRIPES: a Gray-Scott reaction-diffusion whose diffusion is anisotropic and follows the
 * photo: along the photo's edges the chemicals spread faster than across them, so the living stripes and labyrinths
 * lay themselves along the picture's contours and engrave it like a copperplate that keeps re-cutting itself.
 * Where the photo is flat the stripes wander freely.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the stripe width (the diffusion lengths breathe)
 *   audioHarmChange -> new seeds of the reaction at a wandering place (the stripes regrow there)
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the ridges flash (light)
 *
 * Knobs: guideP (how strongly the photo steers the stripes), typeP (maze .. coral), inkP (engraving depth), hueP.
//@params guideP typeP inkP
//@audio audioSwell audioKick audioHarmChange
//@state 360 200 1600
//@body
/**  The photo coordinate of a field cell (the same mapping the frame uses).
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoOf(vec2 c) { return c / stateRes.y * 0.62 + vec2(0.05, 0.1); }

/**  One explicit Gray-Scott step for this cell with a diffusion tensor along the photo's edges (the state pass).
 *
 * @return
 *   u, v, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        bool seed = hash21(floor(vec2(ip) / 9.0) + 3.7) < 0.12;
        return vec4(seed ? 0.5 : 1.0, seed ? 0.25 : 0.0, 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    vec2 e = stAt(ip + ivec2(1, 0)).rg, w = stAt(ip - ivec2(1, 0)).rg;
    vec2 n = stAt(ip + ivec2(0, 1)).rg, s = stAt(ip - ivec2(0, 1)).rg;
    vec2 ne = stAt(ip + ivec2(1, 1)).rg, nw = stAt(ip + ivec2(-1, 1)).rg;
    vec2 se = stAt(ip + ivec2(1, -1)).rg, sw = stAt(ip - ivec2(1, 1)).rg;
    vec2 uxx = e + w - 2.0 * c.rg, uyy = n + s - 2.0 * c.rg, uxy = 0.25 * (ne - nw - se + sw);
    // the photo's edge direction (tangent to its contours) and how strong the edge is
    vec2 uv = photoOf(vec2(ip));
    vec2 gr = texGrad(uv, 3.0);
    float edge = smoothstep(1.0, 6.0, length(gr));
    vec2 t = length(gr) > 1e-4 ? normalize(vec2(-gr.y, gr.x)) : vec2(1.0, 0.0);
    float an = (0.5 + 0.45 * clamp(guideP, 0.0, 1.0)) * edge;
    vec2 dtt = t.x * t.x * uxx + 2.0 * t.x * t.y * uxy + t.y * t.y * uyy;
    vec2 diff = (1.0 - 0.5 * an) * (uxx + uyy) + an * dtt;
    float sc = 1.0 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    vec2 D = vec2(0.3, 0.15) * sc;
    float F = mix(0.029, 0.0545, clamp(typeP, 0.0, 1.0)), K = mix(0.057, 0.062, clamp(typeP, 0.0, 1.0));   // maze .. coral
    float u = c.r, v = c.g, dt = 0.35;                      // stable while 8 D dt < 2
    float uvv = u * v * v;
    float u2 = u + dt * (D.x * diff.x - uvv + F * (1.0 - u));
    float v2 = v + dt * (D.y * diff.y + uvv - (F + K) * v);
    // a change of harmony: new seeds at a place drawn every 300 steps
    float slot = floor(stateFrame / 300.0);
    vec2 at = vec2(hash11(slot * 1.3 + 0.1), hash11(slot * 7.1 + 0.4)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 300.0) < 1.0 && clamp(audioHarmChange, 0.0, 1.0) > 0.5 && length(d) < 10.0) { u2 = 0.5; v2 = 0.25; }
    return vec4(clamp(u2, 0.0, 1.0), clamp(v2, 0.0, 1.0), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 0.62);
    float v = stLin(cc).g;
    vec2 g = vec2(stLin(cc + vec2(1.0, 0.0)).g - stLin(cc - vec2(1.0, 0.0)).g,
                  stLin(cc + vec2(0.0, 1.0)).g - stLin(cc - vec2(0.0, 1.0)).g);
    vec3 photo = imgLod(photoOf(cc), 0.4);
    float cut = smoothstep(0.08, 0.3, v);
    float ink = 0.5 + 0.45 * clamp(inkP, 0.0, 1.0);
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    // the engraving: the photo printed where the stripes stand, the furrows dark with a lit edge
    vec3 col = photo * mix(1.0 - ink, 1.15, cut);
    float lip = max(dot(normalize(vec3(-g * 6.0, 1.0)), normalize(vec3(-0.4, 0.5, 0.8))), 0.0);
    col += mix(tone, vec3(1.0), 0.5) * cut * pow(lip, 6.0) * (0.25 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
