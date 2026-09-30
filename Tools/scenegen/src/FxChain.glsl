//@doc
 * @brief FX CHAIN: the chain laboratory as an overlay -- the finished frame of
 * whatever scene is playing flows through a rolled chain of four continuous
 * transforms (the 2D chain lab's classes: global map, symmetry, second map,
 * warp), so every scene becomes the input of a new chain.  The frame has no
 * mip chain of its own; the engine builds one while this FX is on screen
 * (EffectShader::usesSceneLod), which keeps the squeezed parts from shimmering.
 * Rendered as the frame itself, a lit relief or glowing edges (the preset keeps
 * styleP low), optionally tinted by a colour field that follows the chain.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow through the chain (integrated, jump-free)
 *   sceneAdvance    -> the chain morphs on to the next transform (integrated)
 *   audioPhase      -> the kaleidoscopes turn, the colour field wanders (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the edges flare (light)
 *   audioMode       -> the tint: cool in minor, warm in major
 *   audioSwell      -> the relief light (slow)
 *
 * Knobs: chainAP / chainBP / chainCP / chainDP (the chain, rolled per start),
 * morphP (which stage, if any, morphs on with the music), styleP (frame /
 * relief / edges / contours / flow), speedP (flow speed), detailP (sharpness),
 * paletteP (the frame's own colours / colour field), hueP.
//@params chainAP chainBP chainCP chainDP morphP styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
//@target fx
//@body
float gT, gSpread, gRot, gMw;
vec2 gCw, gCt;
// The stage index and a sub-variant 0..1 from one rolled knob.
float gIdW = 1.0;   // how much of the chain is 'none' or too weak to carry it (product over the stages)
int pickStage(float x, int n) { return int(min(floor(clamp(x, 0.0, 1.0) * float(n)), float(n - 1))); }
float subVar(float x, int n) { return fract(clamp(x, 0.0, 0.9999) * float(n)); }
float evenArms(float v) { return 2.0 * (1.0 + floor(v * 3.99)); }        // 2, 4, 6, 8 (seamless spiral)
float sides(float v) { return 5.0 + floor(v * 4.99); }                     // 5 .. 9 mirrors

// The classes of every stage in order of energy (calm .. energetic): a knob
// value, rolled or walked, picks a position on that scale, so the music's
// energy can choose the region (EffectShader::stepChainWalk).
const int ORD_A[13] = int[13](11, 5, 4, 9, 1, 12, 6, 10, 7, 8, 3, 0, 2);   // 11 = none (identity)
const int ORD_B[6] = int[6](0, 5, 3, 1, 2, 4);
const int ORD_C[9] = int[9](0, 5, 8, 7, 1, 4, 3, 6, 2);
const int ORD_D[6] = int[6](0, 5, 2, 1, 4, 3);
const int ORD_S[5] = int[5](0, 1, 3, 4, 2);   // photo, relief, contours, flow, glowing edges
// The app's walk: per stage (shown knob value, target, fade 0..1); walkHost = 1
// when the app steers (otherwise the hash walk below runs, e.g. in the editor).
uniform vec3 walkA, walkB, walkC, walkD, walkS;
uniform float walkHost;

// Stage A: a global map.
vec2 stageAk(vec2 uv, int k, float v)
{
    k = ORD_A[k];
    if (k == 11) return uv;                                  // none: the chain starts at stage B
    if (k == 12) return tRiemann(uv, gCw, 2.0 + 1.5 * v, 0.7 * sin(gT * 0.4) + v * 3.0, gT * 0.8 + gRot);
    if (k == 0) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 0.8 + 0.4 * v, gT * 2.0);
    if (k == 2) return tTunnel(uv, gCt, 0.2 + 0.1 * v, gT * 3.0);
    if (k == 3) {
        vec2 pa = vec2(0.5) + 0.3 * vec2(sin(gT), cos(gT * 0.7)), pb = vec2(0.5) - 0.3 * vec2(sin(gT * 0.8), cos(gT));
        return tMobius(uv, pa, pb, 0.25 + 0.2 * gSpread);
    }
    if (k == 4) return tDroste(uv, gCt, 2.0 + floor(v * 2.99), gT * 1.5);
    if (k == 5) return tPolar(uv, gCt, 1.2 + 0.8 * v);
    if (k == 6) return tExp(uv, gCw, 3.0 + 1.5 * v + 1.5 * gSpread);
    if (k == 7) return tSin(uv, gCw, 3.5 + 1.5 * v + 1.5 * gSpread);
    if (k == 8) return tInvert(uv, gCw, 0.22 + 0.08 * v + 0.1 * gSpread);
    if (k == 9) {
        // {p,q} from the sub-variant: (5,4) (4,5) (6,4) (7,3) (8,3) (4,6)
        int j = int(floor(v * 5.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(4.0, 5.0) : j == 2 ? vec2(6.0, 4.0) : j == 3 ? vec2(7.0, 3.0) : j == 4 ? vec2(8.0, 3.0) : vec2(4.0, 6.0);
        return tPoincare(uv, vec2(0.5), pq.x, pq.y, 2.2, 0.45 * vec2(sin(gT * 0.7), sin(gT * 0.53 + 1.0)));
    }
    return tBipolar(uv, gCt, 0.15 + 0.1 * v, 1.0 + floor(v * 2.99), gT * 2.0);
}
// Stage B: a symmetry.
vec2 stageBk(vec2 uv, int k, float v)
{
    k = ORD_B[k];
    if (k == 0) return uv;
    if (k == 1) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 2) return tHex(uv, 2.0 + 1.5 * v);
    if (k == 3) return tP4m(uv, 2.0 + 1.5 * v);
    if (k == 4) return tFold(uv, 0.4 + 0.3 * sin(gT), 1.2 + 0.1 * v, 3.0);
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
}
// Stage C: a second global map.
vec2 stageCk(vec2 uv, int k, float v)
{
    k = ORD_C[k];
    if (k == 8) return tPetal(uv, gCw, 3.0 + floor(v * 5.99), 0.15 + 0.2 * gSpread, gT * 2.0);
    if (k == 0) return uv;
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 1.0, gT * 1.5);
    if (k == 2) return tTunnel(uv, gCt, 0.25, gT * 2.5);
    if (k == 3) return tInvert(uv, gCw, 0.28 + 0.1 * gSpread);
    if (k == 4) return tSquare(uv, gCw, 1.4 + 0.4 * v + 0.6 * gSpread);
    if (k == 5) return tLens(uv, gCw, 0.35 + 0.15 * v, 0.4 + 0.4 * sin(gT));
    if (k == 6) return tKaleido(uv, vec2(0.5), sides(v), -gRot);
    return tJoukowski(uv, gCw, 0.5 + 0.2 * sin(gT * 0.4) + 0.1 * v, 2.0);
}
// Stage D: a warp.
vec2 stageDk(vec2 uv, int k, float v)
{
    k = ORD_D[k];
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gT * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gT * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gT * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gT);
    return tRot(uv, vec2(0.5), 0.5 * sin(gT * 0.3 + v * 6.28));
}

// Chain walk.  morphP is rolled once per start:
//   below 0.15  the chain stays as rolled;
//   0.15..0.5   one stage (A, B, C or D) walks on;
//   from 0.5    EVERY stage walks, and the style with them -- one lab scene
//               can play for hours without ever repeating.
// A walking stage holds a transform, then cross-fades to another one picked by
// hash, with a fresh sub-variant (mirrors, arms, {p,q} ...), so it roams its
// whole class instead of cycling.  In the all-stages walk the four stages are
// staggered by a quarter, so mostly one fades at a time.  The fade mixes the
// two MIRRORED outputs, each continuous: the picture never jumps.  Driven by
// time and the integrated music (sceneAdvance surges on flux and harmonic
// changes).
bool walkAll() { return clamp(morphP, 0.0, 1.0) >= 0.5; }
bool walks(int stage)
{
    float m = clamp(morphP, 0.0, 1.0);
    if (m < 0.15) return false;
    if (m >= 0.5) return true;
    return int(min(floor((m - 0.15) / 0.35 * 4.0), 3.0)) + 1 == stage;
}
// The transform (k) and sub-variant (v) shown in walk cycle c; cycle 0 is the rolled one.
void walkPick(float c, int k0, float v0, int n, float salt, out int k, out float v)
{
    if (c < 0.5) { k = k0; v = v0; return; }
    float s = salt + 17.0 * (chainAP + 2.0 * chainBP + 3.0 * chainCP + 5.0 * chainDP);   // each start walks its own way
    k = int(min(floor(hash11(c * 7.31 + s) * float(n)), float(n - 1)));
    v = hash11(c * 3.17 + s * 1.7 + 0.5);
}
float walkPos(int stage) { return walkAll() ? 0.5 * gMw + 0.25 * float(stage - 1) : gMw; }
float walkFade(float kf) { return smoothstep(walkAll() ? 0.7 : 0.55, 1.0, fract(kf)); }
vec2 morphMix(vec2 a, vec2 b, float f) { return mix(mirrorUV(a), mirrorUV(b), f); }
vec2 stageA(vec2 uv)
{
    int k0 = pickStage(chainAP, 13); float v0 = subVar(chainAP, 13);
    if (!walks(1)) { gIdW *= (k0 <= 0 ? 1.0 : 0.0); return stageAk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkA.z);
        int j0 = pickStage(walkA.x, 13), j1 = pickStage(walkA.y, 13);
        gIdW *= (j0 <= 0 ? 1.0 - f : 0.0) + (j1 <= 0 ? f : 0.0);
        if (f <= 0.0) return stageAk(uv, j0, subVar(walkA.x, 13));
        return morphMix(stageAk(uv, j0, subVar(walkA.x, 13)), stageAk(uv, j1, subVar(walkA.y, 13)), f);
    }
    float kf = walkPos(1), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 13, 1.3, i0, w0);
    walkPick(c + 1.0, k0, v0, 13, 1.3, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 0 ? 1.0 - f : 0.0) + (i1 <= 0 ? f : 0.0);
    if (f <= 0.0) return stageAk(uv, i0, w0);
    return morphMix(stageAk(uv, i0, w0), stageAk(uv, i1, w1), f);
}
vec2 stageB(vec2 uv)
{
    int k0 = pickStage(chainBP, 6); float v0 = subVar(chainBP, 6);
    if (!walks(2)) { gIdW *= (k0 <= 1 ? 1.0 : 0.0); return stageBk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkB.z);
        int j0 = pickStage(walkB.x, 6), j1 = pickStage(walkB.y, 6);
        gIdW *= (j0 <= 1 ? 1.0 - f : 0.0) + (j1 <= 1 ? f : 0.0);
        if (f <= 0.0) return stageBk(uv, j0, subVar(walkB.x, 6));
        return morphMix(stageBk(uv, j0, subVar(walkB.x, 6)), stageBk(uv, j1, subVar(walkB.y, 6)), f);
    }
    float kf = walkPos(2), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 6, 2.9, i0, w0);
    walkPick(c + 1.0, k0, v0, 6, 2.9, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 1 ? 1.0 - f : 0.0) + (i1 <= 1 ? f : 0.0);
    if (f <= 0.0) return stageBk(uv, i0, w0);
    return morphMix(stageBk(uv, i0, w0), stageBk(uv, i1, w1), f);
}
vec2 stageC(vec2 uv)
{
    int k0 = pickStage(chainCP, 9); float v0 = subVar(chainCP, 9);
    if (!walks(3)) { gIdW *= (k0 <= 1 ? 1.0 : 0.0); return stageCk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkC.z);
        int j0 = pickStage(walkC.x, 9), j1 = pickStage(walkC.y, 9);
        gIdW *= (j0 <= 1 ? 1.0 - f : 0.0) + (j1 <= 1 ? f : 0.0);
        if (f <= 0.0) return stageCk(uv, j0, subVar(walkC.x, 9));
        return morphMix(stageCk(uv, j0, subVar(walkC.x, 9)), stageCk(uv, j1, subVar(walkC.y, 9)), f);
    }
    float kf = walkPos(3), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 9, 4.7, i0, w0);
    walkPick(c + 1.0, k0, v0, 9, 4.7, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 1 ? 1.0 - f : 0.0) + (i1 <= 1 ? f : 0.0);
    if (f <= 0.0) return stageCk(uv, i0, w0);
    return morphMix(stageCk(uv, i0, w0), stageCk(uv, i1, w1), f);
}
vec2 stageD(vec2 uv)
{
    int k0 = pickStage(chainDP, 6); float v0 = subVar(chainDP, 6);
    if (!walks(4)) { gIdW *= (k0 <= 2 ? 1.0 : 0.0); return stageDk(uv, k0, v0); }
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkD.z);
        int j0 = pickStage(walkD.x, 6), j1 = pickStage(walkD.y, 6);
        gIdW *= (j0 <= 2 ? 1.0 - f : 0.0) + (j1 <= 2 ? f : 0.0);
        if (f <= 0.0) return stageDk(uv, j0, subVar(walkD.x, 6));
        return morphMix(stageDk(uv, j0, subVar(walkD.x, 6)), stageDk(uv, j1, subVar(walkD.y, 6)), f);
    }
    float kf = walkPos(4), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 6, 6.1, i0, w0);
    walkPick(c + 1.0, k0, v0, 6, 6.1, i1, w1);
    float f = walkFade(kf);
    gIdW *= (i0 <= 2 ? 1.0 - f : 0.0) + (i1 <= 2 ? f : 0.0);
    if (f <= 0.0) return stageDk(uv, i0, w0);
    return morphMix(stageDk(uv, i0, w0), stageDk(uv, i1, w1), f);
}
vec2 chain(vec2 p)
{
    vec2 uv = p * 0.5 + 0.5;
    gIdW = 1.0;
    uv = stageA(uv);
    uv = mirrorUV(uv);
    uv = stageB(uv);
    uv = mirrorUV(uv);
    uv = stageC(uv);
    uv = mirrorUV(uv);
    uv = stageD(uv);
    // Never an empty chain: as the stages together approach 'none' -- or only
    // weak classes that leave the photo nearly bare (gIdW) -- a
    // calm six-fold kaleidoscope fades in -- the bare photo is never shown.
    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);
    return uv;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gMw = 0.012 * sceneTime + 0.15 * sceneAdvance;          // morph position (integrated, never jumps)
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
    vec2 grad;
    vec3 ph = imgChain(p, 1.0 - 1.2 * clamp(detailP, 0.0, 1.0), grad);
    float m = luma(ph);
    // Colour field: follows the chain's own (mirrored, hence seamless) coordinates
    // and wanders with the music; the photo's luma keeps the detail.
    vec2 cm = mirrorUV(chain(p));
    float h = hueP * 0.159 + 0.9 * cm.x + 0.6 * cm.y + 0.25 * m + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * mode;
    vec3 field = hsv2rgb(vec3(fract(h), 0.6 + 0.35 * swell, 1.0)) * (0.35 + 1.3 * m);
    vec3 photo = max((ph - m) * 1.4 + m, 0.0);
    photo = mix(photo, field, 0.7 * clamp(paletteP, 0.0, 1.0));   // the scene keeps its colours unless paletteP asks
    // Relief: the chain's photo lit from a slowly circling light.
    float la = 0.1 * sceneTime;
    float relief = clamp(0.5 + dot(grad, vec2(cos(la), sin(la))) * 5.0, 0.0, 1.0);
    vec3 reliefC = photo * (0.3 + 1.2 * relief) + vec3(1.0) * pow(relief, 6.0) * (0.1 + 0.3 * swell);
    // Glowing edges: gradient magnitude as neon.
    vec3 gc = mix(glowColour(ph, p, hueP * 0.159), neonOf(field + 1e-3, 2.0), clamp(paletteP, 0.0, 1.0));
    float edge = smoothstep(0.01, 0.14, length(grad));        // lab audit: 0.02..0.25 left smooth chains nearly black
    vec3 neon = gc * edge * (1.6 + 1.2 * kick) + photo * 0.22;
    // Isolines of the chain's luma: glowing contour lines.
    float xi = m * 12.0 - gT * 6.0;                          // the contour lines flow uphill (integrated, jump-free)
    float pxi = fwidth(xi) + 1e-4;
    float iso = smoothstep(pxi * 1.5, 0.0, abs(fract(xi) - 0.5) - 0.5 + pxi * 1.5);
    vec3 isoC = gc * iso * (1.3 + kick) + photo * 0.12;
    // The look: the rolled one (a pure look -- blends between neighbouring looks
    // are muddy); in the all-stages walk the look walks too, slowly, each look
    // computed on its own and cross-faded.  s0/s1/sf depend on knobs and time
    // only, so every pixel takes the same branches.
    int s0, s1; float sf = 0.0, dummy;
    s0 = pickStage(styleP, 5); s1 = s0;
    if (walkHost > 0.5 && walkAll()) {
        s0 = pickStage(walkS.x, 5); s1 = pickStage(walkS.y, 5);
        sf = smoothstep(0.0, 1.0, walkS.z);
    } else if (walkAll()) {
        float kf = 0.2 * gMw + 0.6, c = floor(kf);
        walkPick(c, s0, 0.0, 5, 23.0, s0, dummy);
        walkPick(c + 1.0, pickStage(styleP, 5), 0.0, 5, 23.0, s1, dummy);
        sf = smoothstep(0.7, 1.0, fract(kf));
    }
    // Flow: noise living in the chain's own space, smeared along the chain's
    // contour direction (line integral convolution) with a travelling phase --
    // silky stream lines that follow the chain.  Only paid for while shown.
    vec3 flowC = photo * 0.25;
    if (ORD_S[s0] == 4 || (ORD_S[s1] == 4 && sf > 0.0)) {
        vec2 fd = vec2(-grad.y, grad.x);
        float gl = length(fd);
        fd /= max(gl, 1e-5);
        float hpx = 3.0 / resolution.y;
        float ph = gT * 25.0;
        float acc = 0.0, wsum = 0.0;
        for (int k = -6; k <= 6; ++k) {
            float fk = float(k);
            float nz = noise2(mirrorUV(chain(p + fd * fk * hpx)) * 70.0);
            float w = 1.0 + 0.8 * sin(fk * 0.7 - ph);
            acc += nz * w; wsum += w;
        }
        float lic = smoothstep(0.38, 0.72, acc / wsum) * smoothstep(0.004, 0.04, gl);
        flowC = gc * lic * (1.3 + kick) + photo * 0.25;
    }
    vec3 looks[5] = vec3[5](photo, reliefC, neon, isoC, flowC);
    s0 = ORD_S[s0]; s1 = ORD_S[s1];                            // position on the calm..energetic scale -> look
    vec3 col = mix(looks[s0], looks[s1], sf);
    col *= mix(vec3(0.9, 0.97, 1.08), vec3(1.08, 0.98, 0.9), mode);
    col += gc * edge * kick * 0.3 * ((s0 <= 1 ? 1.0 - sf : 0.0) + (s1 <= 1 ? sf : 0.0));   // kick glints on photo/relief
    finish(col);
}
