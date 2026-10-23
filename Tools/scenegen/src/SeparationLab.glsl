//@doc
 * @brief SEPARATION LAB: the photo split into printing plates by a colour model -- red, green and blue; luma and two
 * chroma plates; luma and two opponent axes; or cyan, magenta, yellow and black -- and every plate sent through a
 * motion of its own (drifting apart, turning about different centres, zooming against each other, rippling, swirling in
 * opposite senses, shearing, breathing, orbiting), then screened (none, halftone dots at the old plate angles, line
 * screens, stochastic grain, square dots) and overprinted again on the photo (replacing it, multiplying, screening,
 * or only ghosting).  Where the plates agree, the picture is the photo; where they slip, fringes of its own colours
 * open along every edge, dots rosette and moiré.  The walk changes one stage at a time and cross-fades the looks; a new
 * section changes all four.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the misregistration: the plates close up in the piano and slip in the forte
 *   audioPhase      -> the screens turn and the plates' motions run on (integrated)
 *   audioSpread     -> the grain of the screens (the wider the spectrum, the finer)
 *   audioSectionId/Age -> a new section re-rolls the colour model, the motion, the screen and the overprint
 *
 * Knobs: seedP (the walk's seed), slipP (how far the plates may slip), dotsP (the screen's coarseness), hueP.
//@params seedP slipP dotsP
//@audio audioSwell audioSpread
//@body
/**  A colour split into four plate values by a colour model.
 *
 * @param c   The colour. (in)
 * @param m   The model: 0 RGB, 1 luma and two chroma, 2 luma and two opponent axes, 3 cyan, magenta, yellow, black. (in)
 * @param vi  The model's variant 0..99: the plates' order, the chroma scales, the black generation. (in)
 *
 * @return
 *   The plates' values, 0..1.
 **/
vec4 sepEnc(vec3 c, int m, int vi)
{
    if (m == 1) { float y = luma(c); return vec4(y, 0.5 + (c.b - y) * lv(vi, 1.0, 0.45, 0.68), 0.5 + (c.r - y) * lv(vi, 2.0, 0.58, 0.846), 0.0); }
    if (m == 2) return vec4(luma(c), 0.5 + lv(vi, 1.0, 0.35, 0.65) * (c.r - c.g), 0.5 + lv(vi, 2.0, 0.35, 0.65) * (0.5 * (c.r + c.g) - c.b), 0.0);
    if (m == 3) { float k = min(1.0, (1.0 - max(c.r, max(c.g, c.b))) * lv(vi, 1.0, 0.5, 1.5)); return vec4((1.0 - c - k) / max(1.0 - k, 0.02), k).xyzw; }
    int pm = lk(vi, 1.0, 3);
    return vec4(pm == 0 ? c : (pm == 1 ? c.gbr : c.brg), 0.0);
}

/**  The colour back from the plates' values.
 *
 * @param p   The plates' values. (in)
 * @param m   The model, as sepEnc(). (in)
 * @param vi  The model's variant, as sepEnc(). (in)
 *
 * @return
 *   The colour.
 **/
vec3 sepDec(vec4 p, int m, int vi)
{
    if (m == 1) { float y = p.x; float r = y + (p.z - 0.5) / lv(vi, 2.0, 0.58, 0.846); float b = y + (p.y - 0.5) / lv(vi, 1.0, 0.45, 0.68); return vec3(r, (y - 0.299 * r - 0.114 * b) / 0.587, b); }
    if (m == 2) { float rg = (p.y - 0.5) / lv(vi, 1.0, 0.35, 0.65); float ry = (p.z - 0.5) / lv(vi, 2.0, 0.35, 0.65); return vec3(p.x + 0.644 * rg + 0.114 * ry, p.x - 0.356 * rg + 0.114 * ry, p.x + 0.144 * rg - 0.886 * ry); }
    if (m == 3) return (1.0 - p.xyz) * (1.0 - p.w);
    int pm = lk(vi, 1.0, 3);
    return pm == 0 ? p.xyz : (pm == 1 ? p.zxy : p.yzx);
}

/**  Where a plate reads the photo: its motion.
 *
 * @param uv   The place, 0..1. (in)
 * @param law  The law, 0..7. (in)
 * @param i    The plate, 0..3. (in)
 * @param t    The clock. (in)
 * @param amp  The amplitude. (in)
 * @param vi   The law's variant 0..99: the constants of the motion. (in)
 *
 * @return
 *   The place to read.
 **/
vec2 sepMove(vec2 uv, int law, int i, float t, float amp, int vi)
{
    float a = 1.5708 * float(i) + lv(vi, 9.0, -0.2, 1.0);
    vec2 d = uv - 0.5;
    float sgn = (i - 2 * (i / 2)) == 0 ? 1.0 : -1.0;
    if (law == 0) return uv + lv(vi, 1.0, 0.02, 0.08) * amp * vec2(cos(a + lv(vi, 2.0, 0.03, 0.11) * t), sin(a + lv(vi, 2.0, 0.03, 0.11) * t));
    if (law == 1) { vec2 c = 0.5 + lv(vi, 1.0, 0.06, 0.18) * vec2(cos(a), sin(a)); return c + rot2(lv(vi, 2.0, 0.12, 0.38) * amp * sin(lv(vi, 3.0, 0.15, 0.45) * t + a)) * (uv - c); }
    if (law == 2) return 0.5 + d * (1.0 + lv(vi, 1.0, 0.06, 0.18) * amp * sin(lv(vi, 2.0, 0.2, 0.6) * t + a));
    if (law == 3) return uv + lv(vi, 1.0, 0.01, 0.03) * amp * vec2(sin(lv(vi, 2.0, 6.0, 16.0) * uv.y + 0.8 * t + a), cos(lv(vi, 3.0, 5.0, 13.0) * uv.x + 0.7 * t + a));
    if (law == 4) return 0.5 + rot2(sgn * lv(vi, 1.0, 0.6, 1.8) * amp * exp(lv(vi, 2.0, -8.0, -2.0) * dot(d, d)) * sin(lv(vi, 3.0, 0.15, 0.45) * t + a)) * d;
    if (law == 5) return lk(vi, 3.0, 2) == 0 ? uv + vec2(lv(vi, 1.0, 0.1, 0.3) * amp * d.y * sin(lv(vi, 2.0, 0.2, 0.6) * t + a), 0.0) : uv + vec2(0.0, lv(vi, 1.0, 0.1, 0.3) * amp * d.x * sin(lv(vi, 2.0, 0.2, 0.6) * t + a));
    if (law == 6) return 0.5 + d * (1.0 + sgn * lv(vi, 1.0, 0.05, 0.15) * amp * sin(lv(vi, 2.0, 0.25, 0.75) * t + 2.0 * a));
    return uv + lv(vi, 1.0, 0.03, 0.09) * amp * vec2(cos(lv(vi, 2.0, 0.25, 0.75) * t + a), sin(lv(vi, 2.0, 0.25, 0.75) * t + a));
}

/**  A plate's value turned into a screen.
 *
 * @param v     The value, 0..1. (in)
 * @param q     The place. (in)
 * @param mode  The screen: 0 none, 1 dots, 2 lines, 3 grain, 4 square dots. (in)
 * @param ang   The screen's angle. (in)
 * @param cell  Cells per unit. (in)
 * @param vi    The screen's variant 0..99: softness and size of the marks. (in)
 *
 * @return
 *   The plate's coverage, 0..1.
 **/
float sepScreen(float v, vec2 q, int mode, float ang, float cell, int vi)
{
    if (mode == 0) return v;
    vec2 r = rot2(ang) * q * cell;
    vec2 f = fract(r) - 0.5;
    float sf = lv(vi, 2.0, 0.06, 0.22);
    v = clamp(v, 0.0, 1.0);
    if (mode == 1) return smoothstep(sf, -sf, length(f) - lv(vi, 1.0, 0.55, 0.89) * sqrt(v));
    if (mode == 2) return smoothstep(sf * 0.85, -sf * 0.85, abs(f.y) - lv(vi, 3.0, 0.4, 0.6) * v);
    if (mode == 3) return smoothstep(-0.1, 0.1, v - lv(vi, 6.0, 0.35, 0.65) * (hash21(floor(q * cell * lv(vi, 4.0, 0.4, 1.0))) + noise2(q * cell * lv(vi, 5.0, 1.0, 2.8))));   // one threshold for every plate: the grain stays grey, not coloured
    return smoothstep(sf, -sf, max(abs(f.x), abs(f.y)) - lv(vi, 7.0, 0.35, 0.65) * sqrt(v));
}

/**  One look: the four plates of the photo, moved, screened and overprinted.
 *
 * @param k     The classes: x the colour model, y the plates' motion, z the screen, w the overprint. (in)
 * @param kv    The variants of those classes (the constants of each). (in)
 * @param uv    The place, 0..1. (in)
 * @param t     The clock. (in)
 * @param amp   The misregistration. (in)
 * @param cell  The screen's cells per unit. (in)
 *
 * @return
 *   The colour.
 **/
vec3 sepLook(ivec4 k, ivec4 kv, vec2 uv, float t, float amp, float cell)
{
    vec4 pl = vec4(0.0);
    float ao = lv(kv.z, 8.0, -0.5, 0.5);
    float ar = lv(kv.z, 9.0, 0.0, 0.04);
    for (int i = 0; i < 4; ++i) {
        vec2 q = sepMove(uv, k.y, i, t, amp, kv.y);
        vec4 e = sepEnc(imgLod(q, 0.3), k.x, kv.x);
        float v = i == 0 ? e.x : (i == 1 ? e.y : (i == 2 ? e.z : e.w));
        float ang = (i == 0 ? 0.26 : (i == 1 ? 1.31 : (i == 2 ? 0.0 : 0.785))) + ao + ar * t;
        v = sepScreen(v, q, k.z, ang, cell, kv.z);
        if (i == 0) pl.x = v; else if (i == 1) pl.y = v; else if (i == 2) pl.z = v; else pl.w = v;
    }
    vec3 col = sepDec(pl, k.x, kv.x);
    vec3 base = imgLod(uv, 0.3);
    if (k.w == 1) col = base * col * lv(kv.w, 1.0, 1.2, 2.2);
    else if (k.w == 2) col = 1.0 - (1.0 - base) * (1.0 - col * lv(kv.w, 2.0, 0.4, 1.6));
    else if (k.w == 3) col = mix(base, col, lv(kv.w, 3.0, 0.1, 1.0));
    return col;
}

void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    labWalk(seedP * 83.0, ivec4(4, 8, 5, 4), 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float amp = (0.35 + 0.9 * clamp(slipP, 0.0, 1.0)) * (0.15 + 0.85 * smoothstep(0.05, 0.85, sw));
    float t = sceneTime * 0.7 + 5.0 * audioPhase;
    float cell = (50.0 + 70.0 * clamp(dotsP, 0.0, 1.0)) * (0.85 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    vec3 col = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; ++i) {
        if (gLabW[i] > 0.002) {
            col += gLabW[i] * sepLook(gLabK[i], gLabV[i], uv, t, amp, cell);
            ws += gLabW[i];
        }
    }
    finish(max(col / max(ws, 1e-3), 0.0));
}
