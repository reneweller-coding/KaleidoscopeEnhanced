//@doc
 * @brief PERCEPTION LAB: optical illusions as a vocabulary -- Kitaoka's rotating snakes, the Ouchi disc that floats, the
 * Cafe Wall whose straight joints slope, the Fraser spiral of plain circles, Leviant's Enigma with its shimmering rings,
 * the Hermann grid's grey ghosts, Zoellner's slanting parallels, and a stepped phase that makes a stripe pattern seem
 * to glide.  The photo supplies the brightness and colour stairs of the patterns, so each illusion is built from the
 * picture's own tones.  The second stage lays the pattern out (single, tiled with turned copies, folded into a
 * kaleidoscope, two scales laid together), the third chooses where the tones come from (the photo's blur, two of its
 * colours, its detail), the fourth moves the pattern (drifting, turning, breathing, counter-turning).  The walk changes one
 * stage at a time and cross-fades; a new section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the illusion's strength (the contrast of the tone stairs)
 *   audioPhase      -> the pattern's turn and drift, the stepped phase's pace (integrated)
 *   audioHarmAdvance -> the pattern's scale drifts to the next size with each harmonic change (integrated)
 *   audioSectionId/Age -> a new section re-rolls every stage
 *
 * Knobs: seedP (the walk's seed), scaleP (the pattern's size), strengthP (the contrast of the tone stairs), hueP.
//@params seedP scaleP strengthP
//@audio audioSwell audioHarmAdvance
//@body
/**  A tone staircase of four levels with soft joins.
 *
 * @param u  The position along the stairs, in steps (wraps every four). (in)
 *
 * @return
 *   The tone, 0..1.
 **/
float percStairs(float u)
{
    float b = floor(u);
    float f = smoothstep(0.82, 1.0, fract(u));
    float bm = b - 4.0 * floor(b * 0.25);
    float n = bm + 1.0 - 4.0 * floor((bm + 1.0) * 0.25);
    float t0 = bm < 0.5 ? 0.05 : (bm < 1.5 ? 0.35 : (bm < 2.5 ? 0.95 : 0.65));
    float t1 = n < 0.5 ? 0.05 : (n < 1.5 ? 0.35 : (n < 2.5 ? 0.95 : 0.65));
    return mix(t0, t1, f);
}

/**  One illusion's pattern as a tone.
 *
 * @param kind  The illusion, 0..7. (in)
 * @param vi    The illusion's variant 0..99: the constants of the pattern. (in)
 * @param q     The place, in pattern units. (in)
 * @param t     The clock. (in)
 *
 * @return
 *   The tone, 0..1.
 **/
float percPat(int kind, int vi, vec2 q, float t)
{
    float r = length(q);
    float th = atan(q.y, q.x) / 6.2831853;
    if (kind == 0) {
        float ring = floor(r * lv(vi, 1.0, 0.8, 1.6));
        float flip = ring - 2.0 * floor(ring * 0.5);
        return percStairs(fract(th * (14.0 + 2.0 * float(lk(vi, 2.0, 4))) + 0.5 * flip) * 4.0 * + (flip > 0.5 ? 2.0 : 0.0));
    }
    if (kind == 1) {
        vec2 c = lv(vi, 1.0, 0.4, 1.0) * vec2(cos(lv(vi, 2.0, 0.06, 0.18) * t), sin(lv(vi, 3.0, 0.08, 0.22) * t));
        float ed = lv(vi, 7.0, 0.1, 0.3);
        float disc = smoothstep(0.1, -0.1, length(q - c) - lv(vi, 4.0, 1.0, 1.8));
        float v = smoothstep(-ed, ed, sin(6.2831853 * q.x * lv(vi, 5.0, 1.0, 2.0)));
        float h = smoothstep(-ed, ed, sin(6.2831853 * q.y * lv(vi, 6.0, 1.0, 2.0)));
        return mix(h, v, disc) * 0.9 + 0.05;
    }
    if (kind == 2) {
        float row = floor(q.y);
        float off = lv(vi, 1.0, 0.25, 0.75) * (row - 2.0 * floor(row * 0.5)) + lv(vi, 2.0, 0.1, 0.4) * sin(lv(vi, 3.0, 0.1, 0.3) * t);
        float col = floor(q.x * 1.0 + off);
        float hc = lv(vi, 4.0, 0.34, 0.5);
        float tile = (col - 2.0 * floor(col * 0.5)) > 0.5 ? 0.5 + hc : 0.5 - hc;
        float mortar = smoothstep(lv(vi, 5.0, 0.38, 0.5), 0.5, abs(fract(q.y) - 0.5));
        return mix(tile, 0.5, mortar);
    }
    if (kind == 3) {
        float ringIdx = floor(r * 1.0);
        float sgn = (ringIdx - 2.0 * floor(ringIdx * 0.5)) > 0.5 ? 1.0 : -1.0;
        float s = th * (24.0 + 4.0 * float(lk(vi, 1.0, 3))) + sgn * (fract(r) - 0.5) * lv(vi, 2.0, 1.0, 2.2);
        float cord = smoothstep(-0.25, 0.25, sin(6.2831853 * s));
        vec2 g = floor(q * lv(vi, 3.0, 1.0, 2.2));
        float chk = (g.x + g.y - 2.0 * floor((g.x + g.y) * 0.5)) > 0.5 ? 0.75 : 0.25;
        return mix(chk, cord, lv(vi, 4.0, 0.5, 1.0));
    }
    if (kind == 4) {
        float rays = smoothstep(-0.15, 0.15, sin(6.2831853 * th * (48.0 + 8.0 * float(lk(vi, 1.0, 3)))));
        float band = smoothstep(lv(vi, 3.0, 0.3, 0.46), lv(vi, 4.0, 0.22, 0.38), abs(fract(r * lv(vi, 2.0, 0.6, 1.2)) - 0.5));
        return mix(rays, 0.5, band * lv(vi, 5.0, 0.6, 1.1));
    }
    if (kind == 5) {
        vec2 f = abs(fract(q * lv(vi, 1.0, 0.6, 1.2)) - 0.5);
        float m = max(f.x, f.y);
        float lo = lv(vi, 4.0, 0.03, 0.13);
        return mix(lo, 1.0 - lo, smoothstep(lv(vi, 2.0, 0.3, 0.46), lv(vi, 3.0, 0.36, 0.52), m));
    }
    if (kind == 6) {
        float row = floor(q.y * lv(vi, 1.0, 0.8, 1.6));
        float sgn = (row - 2.0 * floor(row * 0.5)) > 0.5 ? 1.0 : -1.0;
        float v = fract(q.y * lv(vi, 1.0, 0.8, 1.6)) - 0.5;
        float line = smoothstep(lv(vi, 2.0, 0.03, 0.09), lv(vi, 5.0, 0.015, 0.045), abs(v));
        float tick = smoothstep(0.1, 0.05, abs(fract(q.x * lv(vi, 3.0, 2.0, 4.0) + sgn * v * lv(vi, 4.0, 0.5, 1.3)) - 0.5) - 0.2) * smoothstep(0.4, 0.34, abs(v));
        return 1.0 - 0.9 * max(line, tick);
    }
    float g = lv(vi, 1.0, 0.25, 0.75) * t;
    float s = floor(g) + smoothstep(0.8, 1.0, fract(g));
    return 0.5 + lv(vi, 4.0, 0.35, 0.55) * sin(6.2831853 * (q.x * lv(vi, 2.0, 0.6, 1.2) - lv(vi, 3.0, 0.1, 0.4) * s));
}

/**  One look of the lab.
 *
 * @param k    The classes: x the illusion, y the layout, z the tones' source, w the pattern's motion. (in)
 * @param kv   The variants of those classes (the constants of each). (in)
 * @param p    The place. (in)
 * @param t    The clock. (in)
 * @param sc   The pattern's scale. (in)
 * @param st   The tone stairs' contrast. (in)
 *
 * @return
 *   The colour.
 **/
vec3 percLook(ivec4 k, ivec4 kv, vec2 p, float t, float sc, float st)
{
    vec2 q = p * sc;
    if (k.w == 0) q += lv(kv.w, 1.0, 0.03, 0.09) * t * vec2(0.8, 0.6);
    else if (k.w == 1) q = rot2(lv(kv.w, 2.0, 0.03, 0.09) * t) * q;
    else if (k.w == 2) q *= 1.0 + lv(kv.w, 3.0, 0.1, 0.3) * sin(lv(kv.w, 4.0, 0.1, 0.3) * t);
    else q = rot2(p.x > 0.0 ? lv(kv.w, 2.0, 0.03, 0.09) * t : -lv(kv.w, 2.0, 0.03, 0.09) * t) * q;
    float tone;
    if (k.y == 1) {
        float cs = lv(kv.y, 1.0, 0.3, 0.7);
        vec2 cell = floor(q * cs + 0.5);
        vec2 f = (q * cs + 0.5 - cell) * 2.0 - 1.0;
        if ((cell.x + cell.y - 2.0 * floor((cell.x + cell.y) * 0.5)) > 0.5) f = vec2(-f.y, f.x);
        tone = percPat(k.x, kv.x, f * lv(kv.y, 2.0, 1.4, 2.6), t);
    } else if (k.y == 2) {
        float sec = 6.2831853 / (6.0 + 2.0 * float(lk(kv.y, 3.0, 3)));
        float an = abs(mod(atan(q.y, q.x) + lv(kv.y, 4.0, 0.02, 0.06) * t, sec) - 0.5 * sec);
        tone = percPat(k.x, kv.x, length(q) * vec2(cos(an), sin(an)), t);
    } else if (k.y == 3) tone = 0.5 * (percPat(k.x, kv.x, q, t) + percPat(k.x, kv.x, rot2(lv(kv.y, 5.0, 0.2, 0.6)) * q * lv(kv.y, 6.0, 1.6, 3.0), t));
    else tone = percPat(k.x, kv.x, q, t);
    tone = 0.5 + (tone - 0.5) * st;
    vec2 uv = p * 0.8 + 0.5;
    if (k.z == 1) return mix(imgLod(uv + vec2(lv(kv.z, 1.0, 0.1, 0.3), lv(kv.z, 2.0, 0.05, 0.15)), lv(kv.z, 3.0, 1.5, 3.5)), imgLod(uv - vec2(lv(kv.z, 1.0, 0.1, 0.3), lv(kv.z, 2.0, 0.05, 0.15)), lv(kv.z, 3.0, 1.5, 3.5)), tone) * (lv(kv.z, 4.0, 0.35, 0.75) + lv(kv.z, 5.0, 0.6, 1.2) * tone);
    if (k.z == 2) return imgLod(uv, lv(kv.z, 6.0, 0.2, 0.6)) * (lv(kv.z, 7.0, 0.1, 0.3) + lv(kv.z, 8.0, 0.9, 1.7) * tone);
    return imgLod(uv, lv(kv.z, 9.0, 2.0, 4.0)) * (lv(kv.z, 10.0, 0.05, 0.25) + lv(kv.z, 11.0, 1.0, 1.7) * tone);
}

void main()
{
    vec2 p = screenP();
    labWalk(seedP * 83.0, ivec4(8, 4, 3, 4), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float sc = (3.0 + 5.0 * clamp(scaleP, 0.0, 1.0)) * (1.0 + 0.1 * sin(0.8 * audioHarmAdvance));
    float st = (0.7 + 0.5 * clamp(strengthP, 0.0, 1.0)) * (0.8 + 0.3 * sw);
    float t = sceneTime * 0.6 + 4.0 * audioPhase;
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * percLook(gLabK[i], gLabV[i], p, t, sc, st);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
