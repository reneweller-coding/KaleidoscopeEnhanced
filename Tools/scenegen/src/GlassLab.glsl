//@doc
 * @brief GLASS LAB: the photo behind a catalogue of window glass -- reeded glass whose ribs are little cylinder lenses,
 * hammered glass with its dimpled facets, bull's-eye roundels, a grid of porthole lenses, frosted glass with soft clear
 * patches, flowing cathedral glass, seeded glass with scattered bubbles, pebbled glass, and diamond panes set in dark
 * lead.  Every sort bends the picture by its own refraction.  A second stage sets the thickness (thin and faint, medium,
 * thick and strongly bent), a third how the pane slides (sideways, up and down, across, turning), a fourth the glazing
 * (one pane, two panes of the same sort at another scale and angle, or a second pane that is frosted).  The photo keeps
 * its own colours, there is no rainbow; the walk changes one stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the glass's thickness breathes with it
 *   audioPhase      -> the pane's slide (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage (a new sort of glass)
 *
 * Knobs: seedP (the walk's seed), gridP (how fine the glass's pattern is), thickP (the base thickness), hueP.
//@params seedP gridP thickP
//@audio audioSwell
//@body
/**  The refraction of one sort of glass at a place: how far it moves the picture there, and how much it darkens.
 *
 * @param kind   The sort, 0..8: reeded, hammered, bull's-eye, portholes, frosted, cathedral, seeded, pebbled, leaded diamonds. (in)
 * @param vi     The sort's variant 0..99: the constants of the glass. (in)
 * @param q      The place, in pattern cells. (in)
 * @param shade  The glass's darkening there (lead, rims), 0..1. (out)
 * @param blur   How much it frosts the picture there, 0..1. (out)
 *
 * @return
 *   The displacement of the picture, in cells.
 **/
vec2 glassDisp(int kind, int vi, vec2 q, out float shade, out float blur)
{
    shade = 0.0;
    blur = 0.0;
    if (kind == 0) {
        float d = fract(q.x + lv(vi, 2.0, -0.4, 0.4) * q.y) - 0.5;
        shade = 0.2 * smoothstep(0.3, 0.5, abs(d));
        return vec2(-lv(vi, 1.0, 1.0, 2.2) * d, 0.0);
    }
    if (kind == 1 || kind == 7) {
        vec2 g = floor(q);
        float best = 9.0;
        vec2 c = vec2(0.0);
        float jt = lv(vi, 3.0, 0.4, 1.0);
        for (int j = -1; j <= 1; ++j) {
            for (int i = -1; i <= 1; ++i) {
                vec2 cg = g + vec2(float(i), float(j));
                vec2 pt = kind == 1 ? cg + 0.5 + jt * (hash22(cg) - 0.5) : cg + vec2(0.5 + 0.5 * (cg.y - 2.0 * floor(cg.y * 0.5)), 0.5);
                float d = dot(q - pt, q - pt);
                if (d < best) { best = d; c = pt; }
            }
        }
        vec2 n = q - c;
        shade = lv(vi, 5.0, 0.15, 0.35) * smoothstep(lv(vi, 6.0, 0.1, 0.3), lv(vi, 7.0, 0.5, 0.9), length(n));
        return -lv(vi, 4.0, 0.7, 1.5) * n;
    }
    if (kind == 2 || kind == 3) {
        vec2 f = fract(q) - 0.5;
        if (kind == 3) {
            vec2 g = floor(q);
            f = fract(q + vec2(0.5 * (g.y - 2.0 * floor(g.y * 0.5)), 0.0)) - 0.5;
        }
        float r = length(f);
        shade = lv(vi, 2.0, 0.35, 0.75) * smoothstep(lv(vi, 1.0, 0.3, 0.46), 0.5, r);
        return r < lv(vi, 3.0, 0.4, 0.5) ? -f * (kind == 2 ? lv(vi, 4.0, 0.8, 1.8) : -lv(vi, 5.0, 1.0, 2.2)) * (1.0 - r) : vec2(0.0);
    }
    if (kind == 4) {
        float n = fbm(q * lv(vi, 1.0, 0.4, 1.8) + 4.0);
        blur = smoothstep(lv(vi, 2.0, 0.2, 0.64), lv(vi, 3.0, 0.45, 0.91), n);
        float fq = lv(vi, 5.0, 2.0, 4.0);
        return lv(vi, 4.0, 0.03, 0.21) * (vec2(fbm(q * fq), fbm(q * fq + 9.0)) - 0.5);
    }
    if (kind == 5) {
        float fq = lv(vi, 4.0, 2.0, 4.0);
        return lv(vi, 1.0, 0.25, 0.75) * (vec2(fbm(q * lv(vi, 2.0, 0.6, 1.2)), fbm(q * lv(vi, 2.0, 0.6, 1.2) + 7.0)) - 0.5) + lv(vi, 3.0, 0.06, 0.18) * (vec2(noise2(q * fq), noise2(q * fq + 5.0)) - 0.5);
    }
    if (kind == 6) {
        float ps = lv(vi, 1.0, 0.5, 0.9);
        vec2 g = floor(q * ps);
        vec2 pt = g + 0.15 + 0.7 * hash22(g);
        float on = hash21(g + 3.0) > lv(vi, 2.0, 0.3, 0.6) ? 1.0 : 0.0;
        vec2 n = q * ps - pt;
        float r = length(n);
        float lens = on * smoothstep(lv(vi, 3.0, 0.25, 0.45), lv(vi, 4.0, 0.1, 0.3), r);
        shade = lv(vi, 6.0, 0.2, 0.4) * lens * smoothstep(0.15, 0.3, r);
        return -n * lv(vi, 5.0, 1.4, 3.0) * lens;
    }
    float da = 0.7854 + lv(vi, 1.0, -0.5, 0.5);
    float ds = lv(vi, 2.0, 0.55, 1.05);
    vec2 g = floor(rot2(da) * q * ds);
    vec2 f = fract(rot2(da) * q * ds) - 0.5;
    shade = lv(vi, 3.0, 0.5, 1.1) * smoothstep(lv(vi, 4.0, 0.33, 0.47), 0.47, max(abs(f.x), abs(f.y)));
    return (hash22(g) - 0.5) * lv(vi, 5.0, 0.5, 1.3) - f * lv(vi, 6.0, 0.1, 0.4);
}

/**  One look of the lab.
 *
 * @param k    The classes: x the sort of glass, y the thickness, z the pane's slide, w the glazing. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param sc   The pattern's cells per unit. (in)
 * @param th   The thickness. (in)
 *
 * @return
 *   The colour.
 **/
vec3 glassLook(ivec4 k, ivec4 kv, vec2 p, float t, float sc, float th)
{
    float tk = th * (k.y == 0 ? 0.5 : (k.y == 1 ? 1.0 : 1.7)) * lv(kv.y, 1.0, 0.7, 1.3);
    vec2 sl = k.z == 0 ? vec2(lv(kv.z, 1.0, 0.025, 0.075) * t, 0.0) : (k.z == 1 ? vec2(0.0, lv(kv.z, 1.0, 0.025, 0.075) * t) : (k.z == 2 ? vec2(lv(kv.z, 2.0, 0.02, 0.06) * t, lv(kv.z, 3.0, 0.015, 0.045) * t) : vec2(0.0)));
    vec2 q = k.z == 3 ? rot2(lv(kv.z, 4.0, 0.02, 0.06) * t) * p * sc : (p + sl) * sc;
    float shade, blur;
    vec2 d = glassDisp(k.x, kv.x, q, shade, blur) / sc;
    float shade2 = 0.0;
    float blur2 = 0.0;
    if (k.w > 0) {
        float s2, b2;
        float ga = lv(kv.w, 1.0, 0.2, 0.8);
        float gs = k.w == 1 ? lv(kv.w, 2.0, 1.3, 2.1) : 1.0;
        vec2 q2 = rot2(ga) * q * gs + 3.7;
        int kind2 = k.w == 1 ? k.x : 4;
        vec2 d2 = glassDisp(kind2, k.w == 1 ? kv.x : kv.w, q2, s2, b2) / (sc * gs);
        d += rot2(-ga) * d2;
        shade2 = s2;
        blur2 = b2;
    }
    vec2 uv = (p + tk * d) * 0.8 + 0.5;
    vec3 col = imgLod(uv, 0.3 + lv(kv.y, 2.0, 2.0, 4.4) * max(blur, blur2) * tk);
    col *= 1.0 - lv(kv.y, 3.0, 0.35, 0.75) * max(shade, shade2) * (lv(kv.y, 4.0, 0.3, 0.7) + 0.5 * tk);
    return col * 1.1;
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(9, 3, 4, 3), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float sc = 3.5 + 6.5 * clamp(gridP, 0.0, 1.0);
    float th = (0.6 + 0.8 * clamp(thickP, 0.0, 1.0)) * (0.75 + 0.5 * sw);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * glassLook(gLabK[i], gLabV[i], p, t, sc, th);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
