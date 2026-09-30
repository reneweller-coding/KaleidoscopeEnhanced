//@doc
 * @brief CHAIN LAB 3D: the 3D chain laboratory -- every start rolls a new
 * raymarched world from three classes of continuous space transforms: a space
 * (mirrored lattice, polar ring tunnel, twisted lattice, octahedral lattice,
 * turning lattice), a fold core (none, tetrahedral KIFS, octahedral KIFS, a
 * sphere-inversion box fold, plane folds, Menger sponge) and an end body (block, ball, torus, gyroid
 * membrane, cross).  The surfaces are coloured by a rolled 2D chain of the
 * 2D chain lab (global map, symmetry, second map, warp) projected
 * triplanarly, with a colour field that follows the chain and wanders with the
 * music.  The camera flies a winding path through a soft tube carved out of
 * every body, so it never collides.  Endless.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight and the flow through the colour chain (integrated, jump-free)
 *   audioPhase      -> the folds turn, the colours wander (integrated)
 *   audioSpread     -> the bodies thicken, the colour chain distorts more
 *   audioKick       -> the rims flare (light)
 *   audioMode       -> the light and the palette: cool in minor, warm in major
 *   audioSwell      -> the fog glow, the colour saturation and the width of the flight tube (slow)
 *
 * Knobs: spaceP / coreP / bodyP (the 3D chain, rolled per start), chainAP..chainDP
 * (the 2D colour chain, rolled per start), morphP (which colour stage morphs on
 * with the music), styleP (lit surface / glowing rims),
 * speedP (flight speed), detailP (texture sharpness), paletteP (photo colours /
 * colour field), hueP.
//@params spaceP coreP bodyP chainAP chainBP chainCP chainDP morphP styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gTC, gSpread, gRot, gMw;
vec2 gCw, gCt;
// The stage index and a sub-variant 0..1 from one rolled knob.
int pickStage(float x, int n) { return int(min(floor(clamp(x, 0.0, 1.0) * float(n)), float(n - 1))); }
float subVar(float x, int n) { return fract(clamp(x, 0.0, 0.9999) * float(n)); }
float evenArms(float v) { return 2.0 * (1.0 + floor(v * 3.99)); }        // 2, 4, 6, 8 (seamless spiral)
float sides(float v) { return 5.0 + floor(v * 4.99); }                     // 5 .. 9 mirrors

// The classes of every stage in order of energy (calm .. energetic): a knob
// value, rolled or walked, picks a position on that scale, so the music's
// energy can choose the region (EffectShader::stepChainWalk).
const int ORD_A[12] = int[12](11, 5, 4, 9, 1, 6, 10, 7, 8, 3, 0, 2);   // 11 = none (identity)
const int ORD_B[6] = int[6](0, 5, 3, 1, 2, 4);
const int ORD_C[8] = int[8](0, 5, 7, 1, 4, 3, 6, 2);
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
    if (k == 0) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 0.8 + 0.4 * v, gTC * 2.0);
    if (k == 2) return tTunnel(uv, gCt, 0.2 + 0.1 * v, gTC * 3.0);
    if (k == 3) {
        vec2 pa = vec2(0.5) + 0.3 * vec2(sin(gTC), cos(gTC * 0.7)), pb = vec2(0.5) - 0.3 * vec2(sin(gTC * 0.8), cos(gTC));
        return tMobius(uv, pa, pb, 0.25 + 0.2 * gSpread);
    }
    if (k == 4) return tDroste(uv, gCt, 2.0 + floor(v * 2.99), gTC * 1.5);
    if (k == 5) return tPolar(uv, gCt, 1.2 + 0.8 * v);
    if (k == 6) return tExp(uv, gCw, 3.0 + 1.5 * v + 1.5 * gSpread);
    if (k == 7) return tSin(uv, gCw, 3.5 + 1.5 * v + 1.5 * gSpread);
    if (k == 8) return tInvert(uv, gCw, 0.22 + 0.08 * v + 0.1 * gSpread);
    if (k == 9) {
        // {p,q} from the sub-variant: (5,4) (4,5) (6,4) (7,3) (8,3) (4,6)
        int j = int(floor(v * 5.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(4.0, 5.0) : j == 2 ? vec2(6.0, 4.0) : j == 3 ? vec2(7.0, 3.0) : j == 4 ? vec2(8.0, 3.0) : vec2(4.0, 6.0);
        return tPoincare(uv, vec2(0.5), pq.x, pq.y, 2.2, 0.45 * vec2(sin(gTC * 0.7), sin(gTC * 0.53 + 1.0)));
    }
    return tBipolar(uv, gCt, 0.15 + 0.1 * v, 1.0 + floor(v * 2.99), gTC * 2.0);
}
// Stage B: a symmetry.
vec2 stageBk(vec2 uv, int k, float v)
{
    k = ORD_B[k];
    if (k == 0) return uv;
    if (k == 1) return tKaleido(uv, gCw, sides(v), gRot);
    if (k == 2) return tHex(uv, 2.0 + 1.5 * v);
    if (k == 3) return tP4m(uv, 2.0 + 1.5 * v);
    if (k == 4) return tFold(uv, 0.4 + 0.3 * sin(gTC), 1.2 + 0.1 * v, 3.0);
    return tMirrorLine(uv, vec2(0.5), gRot * 2.0 + v * 3.14);
}
// Stage C: a second global map.
vec2 stageCk(vec2 uv, int k, float v)
{
    k = ORD_C[k];
    if (k == 0) return uv;
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 1.0, gTC * 1.5);
    if (k == 2) return tTunnel(uv, gCt, 0.25, gTC * 2.5);
    if (k == 3) return tInvert(uv, gCw, 0.28 + 0.1 * gSpread);
    if (k == 4) return tSquare(uv, gCw, 1.4 + 0.4 * v + 0.6 * gSpread);
    if (k == 5) return tLens(uv, gCw, 0.35 + 0.15 * v, 0.4 + 0.4 * sin(gTC));
    if (k == 6) return tKaleido(uv, vec2(0.5), sides(v), -gRot);
    return tJoukowski(uv, gCw, 0.5 + 0.2 * sin(gTC * 0.4) + 0.1 * v, 2.0);
}
// Stage D: a warp.
vec2 stageDk(vec2 uv, int k, float v)
{
    k = ORD_D[k];
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gTC * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gTC * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gTC * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gTC);
    return tRot(uv, vec2(0.5), 0.5 * sin(gTC * 0.3 + v * 6.28));
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
    int k0 = pickStage(chainAP, 12); float v0 = subVar(chainAP, 12);
    if (!walks(1)) return stageAk(uv, k0, v0);
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkA.z);
        int j0 = pickStage(walkA.x, 12), j1 = pickStage(walkA.y, 12);
        if (f <= 0.0) return stageAk(uv, j0, subVar(walkA.x, 12));
        return morphMix(stageAk(uv, j0, subVar(walkA.x, 12)), stageAk(uv, j1, subVar(walkA.y, 12)), f);
    }
    float kf = walkPos(1), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 12, 1.3, i0, w0);
    walkPick(c + 1.0, k0, v0, 12, 1.3, i1, w1);
    float f = walkFade(kf);
    if (f <= 0.0) return stageAk(uv, i0, w0);
    return morphMix(stageAk(uv, i0, w0), stageAk(uv, i1, w1), f);
}
vec2 stageB(vec2 uv)
{
    int k0 = pickStage(chainBP, 6); float v0 = subVar(chainBP, 6);
    if (!walks(2)) return stageBk(uv, k0, v0);
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkB.z);
        int j0 = pickStage(walkB.x, 6), j1 = pickStage(walkB.y, 6);
        if (f <= 0.0) return stageBk(uv, j0, subVar(walkB.x, 6));
        return morphMix(stageBk(uv, j0, subVar(walkB.x, 6)), stageBk(uv, j1, subVar(walkB.y, 6)), f);
    }
    float kf = walkPos(2), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 6, 2.9, i0, w0);
    walkPick(c + 1.0, k0, v0, 6, 2.9, i1, w1);
    float f = walkFade(kf);
    if (f <= 0.0) return stageBk(uv, i0, w0);
    return morphMix(stageBk(uv, i0, w0), stageBk(uv, i1, w1), f);
}
vec2 stageC(vec2 uv)
{
    int k0 = pickStage(chainCP, 8); float v0 = subVar(chainCP, 8);
    if (!walks(3)) return stageCk(uv, k0, v0);
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkC.z);
        int j0 = pickStage(walkC.x, 8), j1 = pickStage(walkC.y, 8);
        if (f <= 0.0) return stageCk(uv, j0, subVar(walkC.x, 8));
        return morphMix(stageCk(uv, j0, subVar(walkC.x, 8)), stageCk(uv, j1, subVar(walkC.y, 8)), f);
    }
    float kf = walkPos(3), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 8, 4.7, i0, w0);
    walkPick(c + 1.0, k0, v0, 8, 4.7, i1, w1);
    float f = walkFade(kf);
    if (f <= 0.0) return stageCk(uv, i0, w0);
    return morphMix(stageCk(uv, i0, w0), stageCk(uv, i1, w1), f);
}
vec2 stageD(vec2 uv)
{
    int k0 = pickStage(chainDP, 6); float v0 = subVar(chainDP, 6);
    if (!walks(4)) return stageDk(uv, k0, v0);
    if (walkHost > 0.5 && walkAll()) {
        float f = smoothstep(0.0, 1.0, walkD.z);
        int j0 = pickStage(walkD.x, 6), j1 = pickStage(walkD.y, 6);
        if (f <= 0.0) return stageDk(uv, j0, subVar(walkD.x, 6));
        return morphMix(stageDk(uv, j0, subVar(walkD.x, 6)), stageDk(uv, j1, subVar(walkD.y, 6)), f);
    }
    float kf = walkPos(4), c = floor(kf);
    int i0, i1; float w0, w1;
    walkPick(c, k0, v0, 6, 6.1, i0, w0);
    walkPick(c + 1.0, k0, v0, 6, 6.1, i1, w1);
    float f = walkFade(kf);
    if (f <= 0.0) return stageDk(uv, i0, w0);
    return morphMix(stageDk(uv, i0, w0), stageDk(uv, i1, w1), f);
}

vec3 zRepeat(vec3 q, float c) { q.z = c * (abs(mod(q.z / c - 1.0, 4.0) - 2.0) - 1.0); return q; }
float field3(vec3 p)
{
    int ks = pickStage(spaceP, 5); float vs = subVar(spaceP, 5);
    int kc = pickStage(coreP, 6);  float vc = subVar(coreP, 6);
    int kb = pickStage(bodyP, 5);  float vb = subVar(bodyP, 5);
    vec3 q;
    if (ks == 0) q = fRepeat(p, vec3(1.2 + 0.4 * vs));
    else if (ks == 1) { q = fPolarZ(p, 6.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.2; q = zRepeat(q, 0.8); }
    else if (ks == 2) q = fRepeat(fTwistZ(p, 0.25 * sin(gT * 0.05)), vec3(1.4));
    else if (ks == 3) q = fOcta(fRepeat(p, vec3(1.5)));
    else q = fRepeat(fRot(p, vec3(0.0, 0.0, 1.0), 0.3 * sin(gRot)), vec3(1.2, 1.2, 1.8));
    float bs = 1.0;                                         // body size in the core's space
    if (kc == 1) {
        for (int i = 0; i < 3; ++i) { q = fTetra(q); q = fRot(q, vec3(1.0, 1.0, 0.0), gRot * 0.5 + 0.3 * vc); q = fScale(q, 1.7, vec3(0.45)); }
        bs = 1.4;
    } else if (kc == 2) {
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.0, 1.0, 1.0), gRot * 0.5 + 0.4 * vc); q = fScale(q, 1.6, vec3(0.6, 0.3, 0.2)); }
        bs = 1.4;
    } else if (kc == 3) {
        q = fSphere(q, 0.45 + 0.1 * vc, 1.0); q = fBox(q, 0.6); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.5);
        bs = 1.0;
    } else if (kc == 4) {
        q = fAbs(q); q = fRot(q, vec3(0.0, 0.0, 1.0), 0.4 * sin(gRot) + vc); q = fAbs(q) - vec3(0.25 + 0.1 * vc); q = fRot(q, vec3(1.0, 0.0, 0.0), 0.3 * sin(gT * 0.07));
        bs = 0.8;
    } else if (kc == 5) {
        // Menger sponge: the octahedral fold (abs + sort), scale 3 about the
        // corner, the classic z shift; a slowly swaying axis between rounds.
        for (int i = 0; i < 3; ++i) {
            q = fOcta(q);
            q = fRot(q, vec3(1.0, 1.0, 1.0), 0.12 * sin(gRot) + 0.15 * vc);
            q = fScale(q, 3.0, vec3(2.0));
            if (q.z < -1.0) q.z += 2.0;
        }
        bs = 2.6;
    }
    gP = q;
    float th = 1.0 + 0.3 * gSpread;
    float d;
    if (kb == 0) d = sdBox3(q, vec3(0.35 + 0.1 * vb, 0.3, 0.35) * bs * th);
    else if (kb == 1) d = sdSphere3(q, 0.45 * bs * th);
    else if (kb == 2) d = sdTorus3(q.xzy, 0.5 * bs, 0.12 * bs * th);   // the ring lies in xy: z is the smallest axis after a sort
    else if (kb == 3) d = sdGyroid3(q * (3.0 / bs), 0.25 + 0.2 * gSpread) * bs / 3.0;
    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th), sdBox3(q, vec3(0.08, 0.6, 0.08) * bs * th)), sdBox3(q, vec3(0.08, 0.08, 0.6) * bs * th));
    return d / gDR * 0.8;
}
vec2 chain(vec2 uv)
{
    uv = stageA(uv);
    uv = mirrorUV(uv);
    uv = stageB(uv);
    uv = mirrorUV(uv);
    uv = stageC(uv);
    uv = mirrorUV(uv);
    return stageD(uv);
}
// One plane: the photo through the chain, plus a colour field that follows
// the chain's own coordinates (mirrorUV keeps it seamless at the atan cuts).
vec3 chainPlane(vec2 uv, float lod, float pal)
{
    vec2 c = chain(uv);
    vec3 ph = imgLod(c, lod);
    vec2 m = mirrorUV(c);
    // The colours wander on their own (integrated music phase, jump-free), the
    // mode shifts the palette, the swell saturates it, the kick lights it.
    float h = hueP * 0.159 + 0.9 * m.x + 0.6 * m.y + 0.25 * luma(ph) + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * clamp(audioMode, 0.0, 1.0);
    float sat = 0.55 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    vec3 fc = hsv2rgb(vec3(fract(h), sat, 1.0)) * (0.35 + 1.3 * luma(ph)) * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
    return mix(ph, fc, pal);
}
vec3 photoChain3(vec3 q, vec3 n, float lod, float pal)
{
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return chainPlane(q.yz * 0.35 + 0.5, lod, pal) * w.x + chainPlane(q.zx * 0.35 + 0.5, lod, pal) * w.y + chainPlane(q.xy * 0.35 + 0.5, lod, pal) * w.z;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.15 + 0.25 * clamp(speedP, 0.0, 1.0)) * sceneTime + 1.5 * audioAdvance;
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gTC = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gMw = 0.012 * sceneTime + 0.15 * sceneAdvance;          // colour-chain morph position (integrated)
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
    vec3 ro;
    mat3 cf = camFrame(gT, ro);
    gCam = ro;
    gTube = 0.4 + 0.15 * swell;                             // the carved tube breathes with the slow swell
    vec3 rd = cf * normalize(vec3(p, 1.1));
    float t = 0.05; float d = 1.0; bool hit = false;
    for (int i = 0; i < 100; ++i) {
        d = fieldD(ro + rd * t);
        if (abs(d) < 0.0008 * t) { hit = true; break; }
        t += d * 0.8;
        if (t > 30.0) break;
    }
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.9, 0.7), mode);
    // The fog takes the palette's hue (wandering with the music) rather than the photo's cast.
    vec3 fogPal = hsv2rgb(vec3(fract(hueP * 0.159 + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * mode + 0.5), 0.55, 1.0));
    vec3 fogC = mix(glowColour(imgK(vec2(0.5) + 0.2 * p, 5.0), p, hueP * 0.159), fogPal, 0.8 * clamp(paletteP, 0.0, 1.0)) * (0.05 + 0.1 * swell);
    vec3 col = fogC;
    if (hit) {
        vec3 q = ro + rd * t;
        vec3 n = normal3(q);
        fieldD(q);                                              // sets gP for this point
        vec3 fp = gP;
        float lod = clamp(log2(t * 2.0) + 1.5 * (1.0 - clamp(detailP, 0.0, 1.0)), 0.0, 7.0);
        vec3 tex = photoChain3(fp, n, lod, 0.2 + 0.7 * clamp(paletteP, 0.0, 1.0));
        float tm = luma(tex);
        tex = max((tex - tm) * 1.5 + tm, 0.0) * 1.5;           // livelier colour, brighter
        vec3 L = normalize(vec3(0.5, 0.7, -0.4));
        float diff = max(dot(n, L), 0.0);
        float ao = 0.0;
        for (int k = 1; k <= 4; ++k) { float h = 0.04 * float(k); ao += (h - fieldD(q + n * h)) / h; }
        ao = clamp(1.0 - 0.2 * ao, 0.2, 1.0);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 surf = tex * lc * (0.35 + 0.9 * diff) * ao;
        vec3 rimC = glowColour(tex, fp.xy, hueP * 0.159);
        vec3 rim = rimC * fres * (0.7 + 1.5 * kick) + surf * 0.4;       // lab audit: the glow style was half as bright
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + rimC * fres * (0.15 + 0.6 * kick), rim * 1.3 + rimC * 0.12 * ao, smoothstep(0.5, 1.0, st));
        col = mix(fogC, sc, exp(-t * (0.06 + 0.04 * swell)));
    }
    finish(col);
}
