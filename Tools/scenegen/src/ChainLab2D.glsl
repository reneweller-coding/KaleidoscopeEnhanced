//@doc
 * @brief CHAIN LAB 2D: the chain laboratory -- every time the scene starts it
 * rolls a new chain of up to four continuous transforms from four classes (each
 * with 'none' at its calm end): a global map (kaleidoscope, log-polar spiral, tunnel, Moebius, Droste, polar,
 * exponential, sine, inversion, hyperbolic Poincare tiling, bipolar
 * stream, rotating Riemann sphere, loxodromic stream, Farris wallpaper
 * functions, the hyperbolic band, Escher's spiral Droste, Peirce's quincuncial
 * sphere), a symmetry (none, kaleidoscope, p6m, p4m,
 * iterated fold, mirror line, Apollonian inversion fold,
 * Penrose mirror), a second global map (none, spiral, tunnel,
 * inversion, square, lens, kaleidoscope, Joukowski, blossom, Farris rosette) and a warp (none, twirl, shear wave,
 * ripple, domain warp, turning).  With the sub-variants (number of mirrors,
 * spiral arms, lattice size) that is tens of thousands of chains in one file.
 * Every stage is continuous and the stages are joined by the photo's mirror
 * repeat, so each chain is seamless; the photograph flows through it without
 * end.  Rendered as the photo, a lit relief, glowing edges, flowing contour lines or
 * combed flow (noise in the chain's space smeared along its contours),
 * with a colour field that follows the chain's own coordinates and wanders
 * with the music.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow through the chain (integrated, jump-free)
 *   sceneAdvance    -> the chain morphs on to the next transform (integrated)
 *   audioPhase      -> the kaleidoscopes turn, the colour field wanders (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the edges flare (light)
 *   audioMode       -> the tint and the palette: cool in minor, warm in major
 *   audioSwell      -> the relief light and the palette saturation (slow)
 *
 * Knobs: chainAP / chainBP / chainCP / chainDP (the transform of each stage and
 * its sub-variant -- rolled once per start, so the chain never switches while it
 * runs), orderP (the order of the four stages: one of 24), morphP (the chain walk: none, one stage, or every stage and the
 * look -- driven by the music, always as a cross-fade), styleP (photo / relief / glowing edges / contour lines / flow), speedP (flow
 * speed), detailP (texture sharpness), paletteP (photo colours / colour field), hueP.
//@params chainAP chainBP chainCP chainDP orderP morphP styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
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
int orda(int i) { if (i == 0) return 11; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 39; if (i == 4) return 52; if (i == 5) return 14; if (i == 6) return 26; if (i == 7) return 41; if (i == 8) return 25; if (i == 9) return 4; if (i == 10) return 16; if (i == 11) return 43; if (i == 12) return 44; if (i == 13) return 33; if (i == 14) return 56; if (i == 15) return 9; if (i == 16) return 15; if (i == 17) return 28; if (i == 18) return 24; if (i == 19) return 53; if (i == 20) return 1; if (i == 21) return 29; if (i == 22) return 34; if (i == 23) return 12; if (i == 24) return 42; if (i == 25) return 17; if (i == 26) return 46; if (i == 27) return 27; if (i == 28) return 47; if (i == 29) return 30; if (i == 30) return 45; if (i == 31) return 19; if (i == 32) return 31; if (i == 33) return 48; if (i == 34) return 6; if (i == 35) return 40; if (i == 36) return 18; if (i == 37) return 32; if (i == 38) return 10; if (i == 39) return 7; if (i == 40) return 21; if (i == 41) return 35; if (i == 42) return 8; if (i == 43) return 3; if (i == 44) return 13; if (i == 45) return 22; if (i == 46) return 23; if (i == 47) return 55; if (i == 48) return 54; if (i == 49) return 51; if (i == 50) return 49; if (i == 51) return 50; if (i == 52) return 36; if (i == 53) return 37; if (i == 54) return 38; if (i == 55) return 57; if (i == 56) return 0; return 2; }   // energy order, 58 classes
int ordb(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 3; if (i == 4) return 18; if (i == 5) return 1; if (i == 6) return 22; if (i == 7) return 10; if (i == 8) return 21; if (i == 9) return 8; if (i == 10) return 14; if (i == 11) return 15; if (i == 12) return 16; if (i == 13) return 2; if (i == 14) return 7; if (i == 15) return 9; if (i == 16) return 11; if (i == 17) return 19; if (i == 18) return 12; if (i == 19) return 13; if (i == 20) return 4; if (i == 21) return 6; return 17; }   // energy order, 23 classes
int ordc(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 17; if (i == 3) return 12; if (i == 4) return 15; if (i == 5) return 8; if (i == 6) return 9; if (i == 7) return 10; if (i == 8) return 11; if (i == 9) return 13; if (i == 10) return 14; if (i == 11) return 7; if (i == 12) return 1; if (i == 13) return 16; if (i == 14) return 4; if (i == 15) return 3; if (i == 16) return 6; return 2; }   // energy order, 18 classes
int ordd(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 8; if (i == 3) return 2; if (i == 4) return 19; if (i == 5) return 13; if (i == 6) return 18; if (i == 7) return 7; if (i == 8) return 10; if (i == 9) return 11; if (i == 10) return 17; if (i == 11) return 1; if (i == 12) return 12; if (i == 13) return 16; if (i == 14) return 6; if (i == 15) return 9; if (i == 16) return 15; if (i == 17) return 14; if (i == 18) return 4; return 3; }   // energy order, 20 classes
int ords(int i) { if (i == 0) return 0; if (i == 1) return 1; if (i == 2) return 3; if (i == 3) return 4; return 2; }   // photo, relief, contours, flow, glowing edges
// The app's walk: per stage (shown knob value, target, fade 0..1); walkHost = 1
// when the app steers (otherwise the hash walk below runs, e.g. in the editor).
uniform vec3 walkA, walkB, walkC, walkD, walkS;
uniform float walkHost;

// Stage A: a global map.
vec2 stageAk(vec2 uv, int k, float v)
{
    k = orda(k);
    if (k == 43) return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gT * 0.3), gT * 0.4 + gRot);
    if (k == 44) return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gT * 0.3) + 0.8, gT * 0.4 + gRot);
    if (k == 45) return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gT);
    if (k == 46) return tMagnet(uv, gCw, 2.0 + floor(v * 1.99), gT);
    if (k == 47) return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gT);
    if (k == 48) return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gT * 0.2));
    if (k == 49) return tHenon(uv, gCw, 3.0, gT);
    if (k == 50) return tIkeda(uv, gCw, 3.0, gT);
    if (k == 51) return tChirikov(uv, gCw, 1.3 + 0.7 * v + 0.3 * sin(gT * 0.2), 4.0);
    if (k == 52) return tCassini(uv, gCt, 0.6 + 0.4 * sin(gT * 0.25), gT * 1.2);
    if (k == 53) return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gT * 0.3), gT * 0.3 + gRot);
    if (k == 54) return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gT * 0.15) + 0.2 * v, 3.0);
    if (k == 55) return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gT * 0.2), 4.0);
    if (k == 56) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHypDroste(uv, gCt, 2.5 + 2.0 * fract(v * 3.0), gT * 0.5, pq.x, pq.y); }
    if (k == 57) return tJulia3(uv, gCw, 2.0, gT);
    if (k == 30) return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gT);
    if (k == 31) return tHypFlow(uv, gCw, v * 3.0, gT * 0.8);
    if (k == 32) return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gT);
    if (k == 33) return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gT * 0.5);
    if (k == 34) return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gT * 2.0);
    if (k == 35) return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gT * 2.0);
    if (k == 36) return tMandel(uv, gCw, 4.0, gT);
    if (k == 37) return tShip(uv, gCw, 4.0, gT);
    if (k == 38) return tPhoenix(uv, gCw, 3.0, gT);
    if (k == 39) return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gT * 1.5);
    if (k == 40) return tCardioid(uv, gCw, 2.5 + v, gT);
    if (k == 41) return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gT * 0.6);
    if (k == 42) return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gT);
    if (k == 26) return tFrieze(uv, gCw, 0.35 + 0.3 * v, gT * 1.5);
    if (k == 27) return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gT);
    if (k == 28) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gT * 0.8); }
    if (k == 29) return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gT * 2.0);
    if (k == 18) return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gT);
    if (k == 19) return tParabolic(uv, gCw, 0.8 + 0.6 * v, gT * 0.8);
    if (k == 20) return tElliptic(uv, gCt, 0.15 + 0.1 * v, gT * 1.5);
    if (k == 21) return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
    if (k == 22) return tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gT);
    if (k == 23) return tJulia(uv, gCw, 3.0, gT);
    if (k == 24) return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gT * 0.3), gT * 0.4 + gRot);
    if (k == 25) return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gT * 1.5);
    if (k == 17) return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gT * 0.37) + v * 2.0, gT * 0.5 + gRot);
    if (k == 14) return tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gT * 1.5);
    if (k == 15) {
        int j = int(floor(v * 3.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : j == 2 ? vec2(4.0, 5.0) : vec2(6.0, 4.0);
        return tHyperBand(uv, gCt, pq.x, pq.y, 0.8 + 0.4 * v, gT * 1.2);
    }
    if (k == 16) return tDrosteSpiral(uv, gCt, 2.5 + 3.5 * v, gT * 0.6);
    if (k == 13) {
        vec2 pa = gCw + 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3)), pb = gCw - 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3));
        return tLoxo(uv, pa, pb, 1.0 + floor(v * 2.99), gT * 2.0);
    }
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
    k = ordb(k);
    if (k == 16) return tModular(uv, gCw, 2.0 + 1.5 * v, gT * 0.5);
    if (k == 17) return tSchottky(uv, gCw, 0.62 + 0.08 * v, gRot);
    if (k == 18) return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
    if (k == 19) return tPappus(uv, gCw, 0.25 + 0.2 * v, gT * 0.5);
    if (k == 20) return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gT);
    if (k == 21) return tSteiner(uv, gCw, sides(v), gRot);
    if (k == 22) return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gT * 0.2), gRot);
    if (k == 10) return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gT * 0.3), cos(gT * 0.23)));
    if (k == 11) return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.3));
    if (k == 12) return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.4));
    if (k == 13) return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));
    if (k == 14) return tQuasiMirror(uv, gCw, 4.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));
    if (k == 15) return tQuasiMirror(uv, gCw, 6.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));
    if (k == 9) return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));
    if (k == 8) return tPenrose(uv, gCw, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3), vec4(0.13, 0.27, -0.21, 0.36));
    if (k == 7) return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gT * 0.4));
    if (k == 6) return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gT * 0.3), 3.0);   // more rounds or a larger s turn to sub-pixel lace
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
    k = ordc(k);
    if (k == 13) return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gT * 0.4), cos(gT * 0.31)));
    if (k == 14) return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gT * 0.5);
    if (k == 15) return tBoost(uv, gCw, 0.6 * sin(gT * 0.3 + v * 6.28));
    if (k == 16) return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gT * 0.2));
    if (k == 17) return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);
    if (k == 11) return tCayley(uv, gCw, 2.0 + 2.0 * v);
    if (k == 12) return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gT * 0.3));
    if (k == 10) return tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gT * 0.3))   /* 0.5: the square-root fold */;
    if (k == 9) return tRosette(uv, gCw, 3.0 + floor(v * 5.99), fract(v * 6.0) < 0.5 ? 0.0 : 1.0, gT * 1.5);
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
    k = ordd(k);
    if (k == 15) return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gT * 2.0);
    if (k == 16) return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gT * 2.0);
    if (k == 17) return tTaylorGreen(uv, 1.0 + gSpread, gT * 2.0);
    if (k == 18) return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gT * 2.0);
    if (k == 19) return tGerstner(uv, 1.0 + gSpread, gT * 3.0);
    if (k == 9) return tKarman(uv, 2.0 + 2.0 * gSpread, gT * 2.0);
    if (k == 10) return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gT * 0.3));
    if (k == 11) return tDipole(uv, gCw, 1.0 + gSpread, gT);
    if (k == 12) return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gT);
    if (k == 13) return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gT * 2.0);
    if (k == 14) return tKelvinHelmholtz(uv, 1.0 + gSpread, gT);
    if (k == 8) return tBend(uv, 1.8 * sin(gT * 0.4 + v * 6.28));
    if (k == 6) return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gT * 2.0);
    if (k == 7) return tCurl(uv, 0.4 + 0.8 * gSpread, gT);
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
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(chainAP, 58); float v0 = subVar(chainAP, 58);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(1)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkA.z);
            ka = pickStage(walkA.x, 58); va = subVar(walkA.x, 58);
            kb = pickStage(walkA.y, 58); vb = subVar(walkA.y, 58);
        } else {
            float kf = walkPos(1), c = floor(kf);
            walkPick(c, k0, v0, 58, 1.3, ka, va);
            walkPick(c + 1.0, k0, v0, 58, 1.3, kb, vb);
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
    int k0 = pickStage(chainBP, 23); float v0 = subVar(chainBP, 23);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(2)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkB.z);
            ka = pickStage(walkB.x, 23); va = subVar(walkB.x, 23);
            kb = pickStage(walkB.y, 23); vb = subVar(walkB.y, 23);
        } else {
            float kf = walkPos(2), c = floor(kf);
            walkPick(c, k0, v0, 23, 2.9, ka, va);
            walkPick(c + 1.0, k0, v0, 23, 2.9, kb, vb);
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
    int k0 = pickStage(chainDP, 20); float v0 = subVar(chainDP, 20);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(4)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkD.z);
            ka = pickStage(walkD.x, 20); va = subVar(walkD.x, 20);
            kb = pickStage(walkD.y, 20); vb = subVar(walkD.y, 20);
        } else {
            float kf = walkPos(4), c = floor(kf);
            walkPick(c, k0, v0, 20, 6.1, ka, va);
            walkPick(c + 1.0, k0, v0, 20, 6.1, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= 2 ? 1.0 - f : 0.0) + (kb <= 2 ? f : 0.0);
    vec2 r = stageDk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stageDk(uv, kb, vb), f);
    return r;
}
// Stage order: the four stages are not commutative (a spiral seen through a
// kaleidoscope is not a kaleidoscope wound into a spiral).  orderP picks one of
// the 24 orders (0 = A, B, C, D); the app may walk it too: then two whole
// chains of different order are cross-faded (walkO: shown, target, fade).
int permCode(int i) { if (i == 0) return 228; if (i == 1) return 180; if (i == 2) return 216; if (i == 3) return 120; if (i == 4) return 156; if (i == 5) return 108; if (i == 6) return 225; if (i == 7) return 177; if (i == 8) return 201; if (i == 9) return 57; if (i == 10) return 141; if (i == 11) return 45; if (i == 12) return 210; if (i == 13) return 114; if (i == 14) return 198; if (i == 15) return 54; if (i == 16) return 78; if (i == 17) return 30; if (i == 18) return 147; if (i == 19) return 99; if (i == 20) return 135; if (i == 21) return 39; if (i == 22) return 75; return 27; }   // base-4 digits: the stage at each position
uniform vec3 walkO;
vec2 applyStage(int k, vec2 uv) { return k == 0 ? stageA(uv) : k == 1 ? stageB(uv) : k == 2 ? stageC(uv) : stageD(uv); }
vec2 runOrder(vec2 uv, int code)
{
    for (int pos = 0; pos < 4; ++pos) {
        uv = applyStage((code >> (2 * pos)) & 3, uv);
        if (pos < 3) uv = mirrorUV(uv);
    }
    return uv;
}
vec2 runChain(vec2 uv)
{
    int o0 = pickStage(orderP, 24), o1 = o0;
    float f = 0.0;
    if (walkHost > 0.5 && walkAll()) { o0 = pickStage(walkO.x, 24); o1 = pickStage(walkO.y, 24); f = smoothstep(0.0, 1.0, walkO.z); }
    gIdW = 1.0;
    vec2 a = runOrder(uv, permCode(o0));
    if (f > 0.0 && o1 != o0) {
        float gi = gIdW;
        gIdW = 1.0;
        vec2 b = runOrder(uv, permCode(o1));
        gIdW = mix(gi, gIdW, f);
        a = morphMix(a, b, f);
    }
    // Never an empty chain: as the stages together approach 'none' -- or only
    // weak classes that leave the photo nearly bare (gIdW) -- a calm six-fold
    // mirror lattice fades in (a lattice, not a kaleidoscope: no centre) -- the bare photo is never shown.
    if (gIdW > 0.0) a = morphMix(a, tHex(tRot(mirrorUV(a), gCw, 0.5 * gRot), 2.5), gIdW);   // a flat six-fold lattice: no centre
    return a;
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
vec2 chain(vec2 p)
{
    float tz = chainTiltZ(p);
    float t0 = gT, r0 = gRot;
    gT += tz; gRot += 0.5 * tz;
    vec2 c = runChain(p * 0.5 + 0.5);
    gT = t0; gRot = r0;
    return c;
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
    vec2 cm = gChainM;                                          // the one chain evaluation (imgChain)
    float h = hueP * 0.159 + 0.9 * cm.x + 0.6 * cm.y + 0.25 * m + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * mode;
    vec3 field = hsv2rgb(vec3(fract(h), 0.6 + 0.35 * swell, 1.0)) * (0.35 + 1.3 * m);
    vec3 photo = max((ph - m) * 1.4 + m, 0.0);
    photo = mix(photo, field, 0.25 + 0.7 * clamp(paletteP, 0.0, 1.0));
    // Relief: the chain's photo lit from a slowly circling light.
    float la = 0.1 * sceneTime;
    float relief = clamp(0.5 + dot(grad, vec2(cos(la), sin(la))) * 5.0, 0.0, 1.0);
    vec3 reliefC = photo * (0.3 + 1.2 * relief) + vec3(1.0) * pow(relief, 6.0) * (0.1 + 0.3 * swell + 0.35 * kick);   // the kick catches the highlights
    // Glowing edges: gradient magnitude as neon.
    vec3 gc = mix(glowColour(ph, p, hueP * 0.159), neonOf(field + 1e-3, 2.0), clamp(paletteP, 0.0, 1.0));
    float edge = smoothstep(0.01, 0.14, length(grad));        // lab audit: 0.02..0.25 left smooth chains nearly black
    vec3 neon = gc * edge * (1.6 + 1.6 * kick) + photo * 0.22;
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
    if (ords(s0) == 4 || (ords(s1) == 4 && sf > 0.0)) {
        vec2 fd = vec2(-grad.y, grad.x);
        float gl = length(fd);
        fd /= max(gl, 1e-5);
        float hpx = 3.0 / resolution.y;
        float ph = gT * 25.0;
        float acc = 0.0, wsum = 0.0;
        for (int k = -6; k <= 6; ++k) {
            float fk = float(k);
            float nz = noise2((gChainM + (gChainDx * fd.x + gChainDy * fd.y) * fk * 3.0) * 70.0);   // the chain linearised along the flow
            float w = 1.0 + 0.8 * sin(fk * 0.7 - ph);
            acc += nz * w; wsum += w;
        }
        float lic = smoothstep(0.38, 0.72, acc / wsum) * smoothstep(0.004, 0.04, gl);
        flowC = gc * lic * (1.3 + kick) + photo * 0.25;
    }
    vec3 looks[5] = vec3[5](photo, reliefC, neon, isoC, flowC);
    s0 = ords(s0); s1 = ords(s1);                            // position on the calm..energetic scale -> look
    vec3 col = mix(looks[s0], looks[s1], sf);
    col *= mix(vec3(0.9, 0.97, 1.08), vec3(1.08, 0.98, 0.9), mode);
    col += gc * edge * kick * 0.55 * ((s0 <= 1 ? 1.0 - sf : 0.0) + (s1 <= 1 ? sf : 0.0));   // kick glints on photo/relief (light only)
    finish(col);
}
