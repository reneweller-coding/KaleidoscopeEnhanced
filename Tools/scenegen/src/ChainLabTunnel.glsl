//@doc
 * @brief CHAIN LAB TUNNEL: the chain laboratory as a tunnel, like the original
 * Tunnel scenes -- every start rolls a new chain of four continuous transforms
 * (the 2D chain lab's classes: global map, symmetry, second map, warp), the
 * photograph flows through it, and the chain is wrapped around the inside of a
 * tube whose axis winds slowly, so the vanishing point wanders.  The chain's
 * brightness becomes real depth: the wall is a relief that stands out into the
 * tube, lit by a light travelling with the camera, with a colour field that
 * follows the chain and wanders with the music.  The camera flies on the axis
 * and the relief never reaches it.  Endless.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight and the flow through the chain (integrated, jump-free)
 *   sceneAdvance    -> the chain morphs on to the next transform (integrated)
 *   audioPhase      -> the kaleidoscopes turn, the colours wander (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the relief crests flare (light)
 *   audioMode       -> the light and the palette: cool in minor, warm in major
 *   audioSwell      -> the relief rises, the colours saturate (slow)
 *
 * Knobs: chainAP / chainBP / chainCP / chainDP (the chain, rolled per start),
 * morphP (which stage, if any, morphs on with the music), depthP (relief
 * height), styleP (lit photo / glowing crests), speedP (flight speed),
 * detailP (texture sharpness), paletteP (photo colours / colour field), hueP.
//@params chainAP chainBP chainCP chainDP morphP depthP styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gTC, gSpread, gRot, gMw, gH;
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
int orda(int i) { if (i == 0) return 11; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 39; if (i == 4) return 52; if (i == 5) return 41; if (i == 6) return 4; if (i == 7) return 16; if (i == 8) return 43; if (i == 9) return 44; if (i == 10) return 33; if (i == 11) return 1; if (i == 12) return 29; if (i == 13) return 34; if (i == 14) return 12; if (i == 15) return 42; if (i == 16) return 19; if (i == 17) return 31; if (i == 18) return 48; if (i == 19) return 6; if (i == 20) return 40; if (i == 21) return 10; if (i == 22) return 7; if (i == 23) return 21; if (i == 24) return 8; if (i == 25) return 3; if (i == 26) return 13; if (i == 27) return 0; return 2; }   // tunnel subset, 29 classes
int ordb(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 3; if (i == 4) return 18; if (i == 5) return 1; if (i == 6) return 22; if (i == 7) return 10; if (i == 8) return 21; if (i == 9) return 2; if (i == 10) return 19; return 4; }   // tunnel subset, 12 classes
int ordc(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 17; if (i == 3) return 12; if (i == 4) return 15; if (i == 5) return 8; if (i == 6) return 9; if (i == 7) return 10; if (i == 8) return 11; if (i == 9) return 13; if (i == 10) return 14; if (i == 11) return 7; if (i == 12) return 1; if (i == 13) return 16; if (i == 14) return 4; if (i == 15) return 3; if (i == 16) return 6; return 2; }   // energy order, 18 classes
int ordd(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 8; if (i == 3) return 2; if (i == 4) return 19; if (i == 5) return 13; if (i == 6) return 18; if (i == 7) return 10; if (i == 8) return 11; if (i == 9) return 1; if (i == 10) return 12; if (i == 11) return 15; if (i == 12) return 14; return 3; }   // tunnel subset, 14 classes
int ords(int i) { if (i == 0) return 0; if (i == 1) return 1; if (i == 2) return 3; if (i == 3) return 4; return 2; }   // photo, relief, contours, flow, glowing edges
// The app's walk: per stage (shown knob value, target, fade 0..1); walkHost = 1
// when the app steers (otherwise the hash walk below runs, e.g. in the editor).
uniform vec3 walkA, walkB, walkC, walkD, walkS;
uniform float walkHost;

// Stage A: a global map.
vec2 stageAk(vec2 uv, int k, float v)
{
    k = orda(k);
    if (k == 43) return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 44) return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gTC * 0.3) + 0.8, gTC * 0.4 + gRot);
    if (k == 48) return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gTC * 0.2));
    if (k == 52) return tCassini(uv, gCt, 0.6 + 0.4 * sin(gTC * 0.25), gTC * 1.2);
    if (k == 31) return tHypFlow(uv, gCw, v * 3.0, gTC * 0.8);
    if (k == 33) return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gTC * 0.5);
    if (k == 34) return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gTC * 2.0);
    if (k == 39) return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gTC * 1.5);
    if (k == 40) return tCardioid(uv, gCw, 2.5 + v, gTC);
    if (k == 41) return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gTC * 0.6);
    if (k == 42) return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gTC);
    if (k == 29) return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gTC * 2.0);
    if (k == 19) return tParabolic(uv, gCw, 0.8 + 0.6 * v, gTC * 0.8);
    if (k == 20) return tElliptic(uv, gCt, 0.15 + 0.1 * v, gTC * 1.5);
    if (k == 21) return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
    if (k == 16) return tDrosteSpiral(uv, gCt, 2.5 + 3.5 * v, gTC * 0.6);
    if (k == 13) {
        vec2 pa = gCw + 0.25 * vec2(cos(gTC * 0.3), sin(gTC * 0.3)), pb = gCw - 0.25 * vec2(cos(gTC * 0.3), sin(gTC * 0.3));
        return tLoxo(uv, pa, pb, 1.0 + floor(v * 2.99), gTC * 2.0);
    }
    if (k == 11) return uv;                                  // none: the chain starts at stage B
    if (k == 12) return tRiemann(uv, gCw, 2.0 + 1.5 * v, 0.7 * sin(gTC * 0.4) + v * 3.0, gTC * 0.8 + gRot);
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
    return tBipolar(uv, gCt, 0.15 + 0.1 * v, 1.0 + floor(v * 2.99), gTC * 2.0);
}
// Stage B: a symmetry.
vec2 stageBk(vec2 uv, int k, float v)
{
    k = ordb(k);
    if (k == 18) return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
    if (k == 19) return tPappus(uv, gCw, 0.25 + 0.2 * v, gTC * 0.5);
    if (k == 20) return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 21) return tSteiner(uv, gCw, sides(v), gRot);
    if (k == 22) return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gTC * 0.2), gRot);
    if (k == 10) return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gTC * 0.3), cos(gTC * 0.23)));
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
    k = ordc(k);
    if (k == 13) return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gTC * 0.4), cos(gTC * 0.31)));
    if (k == 14) return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gTC * 0.5);
    if (k == 15) return tBoost(uv, gCw, 0.6 * sin(gTC * 0.3 + v * 6.28));
    if (k == 16) return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gTC * 0.2));
    if (k == 17) return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);
    if (k == 11) return tCayley(uv, gCw, 2.0 + 2.0 * v);
    if (k == 12) return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gTC * 0.3));
    if (k == 10) return tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gTC * 0.3))   /* 0.5: the square-root fold */;
    if (k == 9) return tRosette(uv, gCw, 3.0 + floor(v * 5.99), fract(v * 6.0) < 0.5 ? 0.0 : 1.0, gTC * 1.5);
    if (k == 8) return tPetal(uv, gCw, 3.0 + floor(v * 5.99), 0.15 + 0.2 * gSpread, gTC * 2.0);
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
    k = ordd(k);
    if (k == 15) return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gTC * 2.0);
    if (k == 18) return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 19) return tGerstner(uv, 1.0 + gSpread, gTC * 3.0);
    if (k == 10) return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gTC * 0.3));
    if (k == 11) return tDipole(uv, gCw, 1.0 + gSpread, gTC);
    if (k == 12) return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gTC);
    if (k == 13) return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 14) return tKelvinHelmholtz(uv, 1.0 + gSpread, gTC);
    if (k == 8) return tBend(uv, 1.8 * sin(gTC * 0.4 + v * 6.28));
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gTC * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gTC * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gTC * 8.0);
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
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainAP, 29); float v0 = subVar(chainAP, 29);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(1)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkA.z);
            ka = pickStage(walkA.x, 29); va = subVar(walkA.x, 29);
            kb = pickStage(walkA.y, 29); vb = subVar(walkA.y, 29);
        } else {
            float kf = walkPos(1), c = floor(kf);
            walkPick(c, k0, v0, 29, 1.3, ka, va);
            walkPick(c + 1.0, k0, v0, 29, 1.3, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 0 ? 1.0 - f : 0.0) + (kb <= 0 ? f : 0.0);
    vec2 r = stageAk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageAk(uv, kb, vb), f);
    return r;
}
vec2 stageB(vec2 uv)
{
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainBP, 12); float v0 = subVar(chainBP, 12);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(2)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkB.z);
            ka = pickStage(walkB.x, 12); va = subVar(walkB.x, 12);
            kb = pickStage(walkB.y, 12); vb = subVar(walkB.y, 12);
        } else {
            float kf = walkPos(2), c = floor(kf);
            walkPick(c, k0, v0, 12, 2.9, ka, va);
            walkPick(c + 1.0, k0, v0, 12, 2.9, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 2 ? 1.0 - f : 0.0) + (kb <= 2 ? f : 0.0);
    vec2 r = stageBk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageBk(uv, kb, vb), f);
    return r;
}
vec2 stageC(vec2 uv)
{
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainCP, 18); float v0 = subVar(chainCP, 18);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(3)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkC.z);
            ka = pickStage(walkC.x, 18); va = subVar(walkC.x, 18);
            kb = pickStage(walkC.y, 18); vb = subVar(walkC.y, 18);
        } else {
            float kf = walkPos(3), c = floor(kf);
            walkPick(c, k0, v0, 18, 4.7, ka, va);
            walkPick(c + 1.0, k0, v0, 18, 4.7, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 1 ? 1.0 - f : 0.0) + (kb <= 1 ? f : 0.0);
    vec2 r = stageCk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageCk(uv, kb, vb), f);
    return r;
}
vec2 stageD(vec2 uv)
{
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainDP, 14); float v0 = subVar(chainDP, 14);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(4)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkD.z);
            ka = pickStage(walkD.x, 14); va = subVar(walkD.x, 14);
            kb = pickStage(walkD.y, 14); vb = subVar(walkD.y, 14);
        } else {
            float kf = walkPos(4), c = floor(kf);
            walkPick(c, k0, v0, 14, 6.1, ka, va);
            walkPick(c + 1.0, k0, v0, 14, 6.1, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 2 ? 1.0 - f : 0.0) + (kb <= 2 ? f : 0.0);
    vec2 r = stageDk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageDk(uv, kb, vb), f);
    return r;
}
// The time tilt (tiltP): the chain's own time t0 + a x + b y across the
// picture -- a cut through its space-time volume (x, y, t), so every place
// shows another moment of the chain.  Its direction turns slowly (clock only),
// its strength follows the slow swell.  0 below tiltP 0.15.  The uniform lives
// here (not in the labs' knob lists) so every lab built on these stages compiles.
uniform float tiltP;
float chainTiltZ(vec2 q)
{
    float k = smoothstep(0.15, 1.0, tiltP) * 0.6 * (0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0));
    float a = 0.011 * sceneTime;
    return k * dot(vec2(cos(a), sin(a)), q);
}

vec2 chain(vec2 uv)
{
    // Fixed order A -> B -> C -> D: the chain runs in every march step here,
    // and the free order (a switch over the four stages at every position)
    // tripled its cost.
    gIdW = 1.0;
    float tz = chainTiltZ(uv * 2.0 - 1.0);              // the time tilt on the wall (tiltP)
    float t0 = gTC, r0 = gRot;
    gTC += tz; gRot += 0.5 * tz;                      // the wall's chain runs on gTC
    uv = stageA(uv); uv = mirrorUV(uv);
    uv = stageB(uv); uv = mirrorUV(uv);
    uv = stageC(uv); uv = mirrorUV(uv);
    uv = stageD(uv);
    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);
    gTC = t0; gRot = r0;
    return uv;
}
// The tube's axis winds slowly: the vanishing point wanders.
vec2 axisXY(float z) { return vec2(0.35 * sin(z * 0.11) + 0.15 * sin(z * 0.27 + 1.0), 0.3 * sin(z * 0.087 + 0.6) + 0.12 * cos(z * 0.21)); }
// Wall coordinates: angle around (jumps by a whole mirror period at the atan
// cut, so mirrorUV makes it seamless) and depth along.
vec2 wallUV(vec3 q)
{
    vec2 d = q.xy - axisXY(q.z);
    return mirrorUV(vec2(atan(d.y, d.x) / 3.14159265, q.z * 0.32));   // 2 units around = 6.3 world units: about square
}
// Distance to the wall: radius 1 minus the relief (the chain's smooth brightness).
// The relief height: the chain's brightness, blurred more where the chain
// squeezes the photo (its local stretch J), so the relief never gets finer
// than it can be drawn -- otherwise it turns into sub-pixel spikes.
float wallHeight(vec2 w, vec2 c)
{
    float J = length(mirrorUV(chain(w + vec2(0.01, 0.01))) - mirrorUV(c)) / 0.0141;
    return luma(imgLod(c, 4.0 + clamp(log2(max(J, 1.0)), 0.0, 5.0)));
}
float tunnelD(vec3 q, out vec2 c)
{
    vec2 w = wallUV(q);
    c = chain(w);
    // In the march one chain per step: the relief blurred by a fixed amount
    // (the stretch-dependent blur of wallHeight needs a second chain).
    return (1.0 - gH * luma(imgLod(c, 5.0))) - length(q.xy - axisXY(q.z));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.3 + 0.5 * clamp(speedP, 0.0, 1.0)) * sceneTime + 2.0 * audioAdvance;
    gTC = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gMw = 0.012 * sceneTime + 0.15 * sceneAdvance;
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
    gH = (0.15 + 0.3 * clamp(depthP, 0.0, 1.0)) * (0.8 + 0.3 * swell);   // at most 0.59: the axis stays free
    // Camera on the axis, looking at the axis ahead.
    vec3 ro = vec3(axisXY(gT), gT);
    vec3 ta = vec3(axisXY(gT + 2.5), gT + 2.5);
    vec3 fw = normalize(ta - ro);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 rd = mat3(rt, cross(fw, rt), fw) * normalize(vec3(p, 1.2));
    float t = 0.05; float d = 1.0; vec2 c = vec2(0.5); bool hit = false;
    // Phase 1: inside radius 1 - gH no relief can reach, so up to there the
    // wall is the plain tube -- no chain per step (the chain in every step
    // was most of the frame: 8 ms at 2880x1620).
    for (int i = 0; i < 64; ++i) {
        vec3 q = ro + rd * t;
        float db = (1.0 - gH) - length(q.xy - axisXY(q.z));
        if (db < 0.01 || t > 28.0) break;
        t += db * 0.8;
    }
    // Phase 2: through the relief layer with the chain.
    for (int i = 0; i < 90; ++i) {
        d = tunnelD(ro + rd * t, c);
        if (d < 0.0015 * t) { hit = true; break; }
        t += d * 0.55;
        if (t > 28.0) break;
    }
    float hueF = hueP * 0.159 + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * mode;
    vec3 fogC = hsv2rgb(vec3(fract(hueF + 0.5), 0.5, 1.0)) * (0.04 + 0.08 * swell);
    vec3 col = fogC;
    if (hit) {
        vec3 q = ro + rd * t;
        vec2 cc;
        vec2 e = vec2(1.0, -1.0) * max(0.004, 0.003 * t);           // wider with distance: no sub-pixel grain
        vec3 n = normalize(e.xyy * tunnelD(q + e.xyy, cc) + e.yyx * tunnelD(q + e.yyx, cc) + e.yxy * tunnelD(q + e.yxy, cc) + e.xxx * tunnelD(q + e.xxx, cc));
        // Colour footprint from the chain itself (as in imgChain): the chain one
        // pixel away along both wall axes, per axis the smaller one-sided
        // difference, so a mirror seam on one side does not blur the other.
        // Across the tube a pixel covers t/res of wall; along it (grazing view)
        // that divided by the cosine of the viewing angle -- up to ~30x longer.
        float pxW = t * 2.0 / resolution.y * 0.32;
        float pxZ = pxW / max(abs(dot(normalize(vec3(q.xy - axisXY(q.z), 0.0)), rd)), 0.03);
        vec2 w0 = wallUV(q);
        vec2 m0c = mirrorUV(c);
        float fx = min(length(mirrorUV(chain(w0 + vec2(pxW, 0.0))) - m0c), length(m0c - mirrorUV(chain(w0 - vec2(pxW, 0.0)))));
        float fy = min(length(mirrorUV(chain(w0 + vec2(0.0, pxZ))) - m0c), length(m0c - mirrorUV(chain(w0 - vec2(0.0, pxZ)))));
        float lod = clamp(log2(max(max(fx, fy) * 1024.0, 1.0)) + 1.0 - 1.2 * clamp(detailP, 0.0, 1.0), 0.0, 9.0);
        // Where the chain squeezes the photo below a pixel, its relief is only
        // grain: fade the relief normal toward the smooth tube normal there.
        vec3 nTube = -normalize(vec3(q.xy - axisXY(q.z), 0.0));
        n = normalize(mix(nTube, n, clamp(1.0 - (log2(max(max(fx, fy) * 1024.0, 1.0)) - 4.0) / 2.5, 0.0, 1.0)));
        vec3 ph = imgLod(c, lod);
        float m0 = luma(ph);
        float hgt = wallHeight(wallUV(q), c);                          // relief height 0..1 (crest = 1)
        vec2 cm = mirrorUV(c);
        // The hue follows the chain's coordinates -- but not where they change
        // faster than a pixel (that would be colour noise): fade by the footprint.
        float hueW = clamp(1.0 - (log2(max(max(fx, fy) * 1024.0, 1.0)) - 3.0) / 3.0, 0.0, 1.0);
        float h = hueF + hueW * (0.9 * cm.x + 0.6 * cm.y) + 0.25 * m0;
        vec3 field = hsv2rgb(vec3(fract(h), 0.55 + 0.4 * swell, 1.0)) * (0.35 + 1.3 * m0);
        vec3 tex = mix(max((ph - m0) * 1.4 + m0, 0.0), field, 0.2 + 0.75 * clamp(paletteP, 0.0, 1.0));
        vec3 lc = mix(vec3(0.75, 0.88, 1.1), vec3(1.12, 0.92, 0.72), mode);
        // A light travelling with the camera plus a slow circling key light.
        vec3 Lh = normalize(ro + vec3(0.0, 0.0, 1.5) - q);
        float la = 0.13 * sceneTime;
        vec3 Lk = normalize(vec3(cos(la), sin(la), 0.4));
        float diff = 0.55 * max(dot(n, Lh), 0.0) + 0.35 * (0.5 + 0.5 * dot(n, Lk));   // wrapped key: no dark half
        float spec = pow(max(dot(reflect(-Lh, n), -rd), 0.0), 24.0);
        float ao = 0.45 + 0.55 * hgt;                              // the valleys of the relief lie in shade
        vec3 surf = tex * lc * (0.5 + 1.25 * diff) * ao + lc * spec * (0.15 + 0.35 * swell);
        // Glowing crests: the relief's ridges light up in the palette colour.
        float crest = smoothstep(0.45, 0.85, hgt);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 glow = neonOf(field + 1e-3, 2.0) * (crest * (0.6 + 1.2 * kick) + fres * 0.5);
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + glow * 0.25 * (0.5 + kick), glow + surf * 0.55, smoothstep(0.35, 0.65, st));
        col = mix(fogC, sc, exp(-t * (0.07 + 0.03 * swell)));
    }
    finish(col);
}
