//@doc
 * @brief CHAIN LAB 3D: the 3D chain laboratory -- every start rolls a new
 * raymarched world from three classes of continuous space transforms: a space
 * (mirrored lattice, polar ring tunnel, twisted lattice, octahedral lattice,
 * turning lattice, helix, hexagonal lattice, a lattice turned in 4D), a fold core (none, tetrahedral KIFS, octahedral KIFS, a
 * sphere-inversion box fold, plane folds, Menger sponge,
 * Kleinian fold, icosahedral KIFS, polyhedral kaleidoscope) and an end body (block, ball, torus, gyroid
 * membrane, cross, Schwarz P and D minimal surfaces).  The surfaces are coloured by a rolled 2D chain of the
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
 * Knobs: spaceP / coreP / bodyP (the 3D chain, rolled per start), solidP (the colour
 * chain projected on three planes, or as a solid texture with the depth as its
 * time axis), reliefP (the surfaces bulge with the colour chain's brightness),
 * chainAP..chainDP
 * (the 2D colour chain, rolled per start), morphP (which colour stage morphs on
 * with the music), styleP (lit surface / glowing rims),
 * speedP (flight speed), detailP (texture sharpness), paletteP (photo colours /
 * colour field), camP (the first gaze: ahead, out of a side window, slanted down or up,
 * floating, an orthographic side view -- the scene pans on every few minutes), hueP.
//@params spaceP coreP bodyP solidP reliefP chainAP chainBP chainCP chainDP orderP morphP styleP speedP detailP paletteP camP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gTC, gSpread, gRot, gMw;
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
int ordb(int i) { if (i == 0) return 0; if (i == 1) return 5; if (i == 2) return 20; if (i == 3) return 3; if (i == 4) return 18; if (i == 5) return 1; if (i == 6) return 22; if (i == 7) return 10; if (i == 8) return 21; if (i == 9) return 16; if (i == 10) return 2; if (i == 11) return 7; if (i == 12) return 9; if (i == 13) return 11; if (i == 14) return 19; if (i == 15) return 12; if (i == 16) return 13; if (i == 17) return 4; if (i == 18) return 6; return 17; }   // 3D lab subset, 20 classes
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
    if (k == 43) return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 44) return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gTC * 0.3) + 0.8, gTC * 0.4 + gRot);
    if (k == 45) return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gTC);
    if (k == 46) return tMagnet(uv, gCw, 2.0 + floor(v * 1.99), gTC);
    if (k == 47) return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gTC);
    if (k == 48) return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gTC * 0.2));
    if (k == 49) return tHenon(uv, gCw, 3.0, gTC);
    if (k == 50) return tIkeda(uv, gCw, 3.0, gTC);
    if (k == 51) return tChirikov(uv, gCw, 1.3 + 0.7 * v + 0.3 * sin(gTC * 0.2), 4.0);
    if (k == 52) return tCassini(uv, gCt, 0.6 + 0.4 * sin(gTC * 0.25), gTC * 1.2);
    if (k == 53) return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gTC * 0.3), gTC * 0.3 + gRot);
    if (k == 54) return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gTC * 0.15) + 0.2 * v, 3.0);
    if (k == 55) return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gTC * 0.2), 4.0);
    if (k == 56) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHypDroste(uv, gCt, 2.5 + 2.0 * fract(v * 3.0), gTC * 0.5, pq.x, pq.y); }
    if (k == 57) return tJulia3(uv, gCw, 2.0, gTC);
    if (k == 30) return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gTC);
    if (k == 31) return tHypFlow(uv, gCw, v * 3.0, gTC * 0.8);
    if (k == 32) return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 33) return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gTC * 0.5);
    if (k == 34) return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gTC * 2.0);
    if (k == 35) return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gTC * 2.0);
    if (k == 36) return tMandel(uv, gCw, 4.0, gTC);
    if (k == 37) return tShip(uv, gCw, 4.0, gTC);
    if (k == 38) return tPhoenix(uv, gCw, 3.0, gTC);
    if (k == 39) return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gTC * 1.5);
    if (k == 40) return tCardioid(uv, gCw, 2.5 + v, gTC);
    if (k == 41) return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gTC * 0.6);
    if (k == 42) return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gTC);
    if (k == 26) return tFrieze(uv, gCw, 0.35 + 0.3 * v, gTC * 1.5);
    if (k == 27) return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gTC);
    if (k == 28) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);
                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gTC * 0.8); }
    if (k == 29) return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gTC * 2.0);
    if (k == 18) return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 19) return tParabolic(uv, gCw, 0.8 + 0.6 * v, gTC * 0.8);
    if (k == 20) return tElliptic(uv, gCt, 0.15 + 0.1 * v, gTC * 1.5);
    if (k == 21) return tTanLattice(uv, gCw, 2.5 + 2.0 * v);
    if (k == 22) return tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gTC);
    if (k == 23) return tJulia(uv, gCw, 3.0, gTC);
    if (k == 24) return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gTC * 0.3), gTC * 0.4 + gRot);
    if (k == 25) return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gTC * 1.5);
    if (k == 17) return tQuincunx(uv, gCw, 3.0 + 2.0 * v, 0.5 * sin(gTC * 0.37) + v * 2.0, gTC * 0.5 + gRot);
    if (k == 14) return tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gTC * 1.5);
    if (k == 15) {
        int j = int(floor(v * 3.99));
        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : j == 2 ? vec2(4.0, 5.0) : vec2(6.0, 4.0);
        return tHyperBand(uv, gCt, pq.x, pq.y, 0.8 + 0.4 * v, gTC * 1.2);
    }
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
    k = ordb(k);
    if (k == 16) return tModular(uv, gCw, 2.0 + 1.5 * v, gTC * 0.5);
    if (k == 17) return tSchottky(uv, gCw, 0.62 + 0.08 * v, gRot);
    if (k == 18) return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);
    if (k == 19) return tPappus(uv, gCw, 0.25 + 0.2 * v, gTC * 0.5);
    if (k == 20) return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gTC);
    if (k == 21) return tSteiner(uv, gCw, sides(v), gRot);
    if (k == 22) return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gTC * 0.2), gRot);
    if (k == 10) return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gTC * 0.3), cos(gTC * 0.23)));
    if (k == 11) return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gTC * 0.3));
    if (k == 12) return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gTC * 0.4));
    if (k == 13) return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.3));
    if (k == 9) return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.3));
    if (k == 7) return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gTC * 0.4));
    if (k == 6) return tApollo(uv, gCw, 1.04 + 0.08 * v + 0.04 * sin(gTC * 0.3), 3.0);   // more rounds or a larger s turn to sub-pixel lace
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
    if (k == 16) return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gTC * 2.0);
    if (k == 17) return tTaylorGreen(uv, 1.0 + gSpread, gTC * 2.0);
    if (k == 18) return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 19) return tGerstner(uv, 1.0 + gSpread, gTC * 3.0);
    if (k == 9) return tKarman(uv, 2.0 + 2.0 * gSpread, gTC * 2.0);
    if (k == 10) return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gTC * 0.3));
    if (k == 11) return tDipole(uv, gCw, 1.0 + gSpread, gTC);
    if (k == 12) return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gTC);
    if (k == 13) return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gTC * 2.0);
    if (k == 14) return tKelvinHelmholtz(uv, 1.0 + gSpread, gTC);
    if (k == 8) return tBend(uv, 1.8 * sin(gTC * 0.4 + v * 6.28));
    if (k == 6) return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gTC * 2.0);
    if (k == 7) return tCurl(uv, 0.4 + 0.8 * gSpread, gTC);
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
    int k0 = pickStage(chainBP, 20); float v0 = subVar(chainBP, 20);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(2)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, walkB.z);
            ka = pickStage(walkB.x, 20); va = subVar(walkB.x, 20);
            kb = pickStage(walkB.y, 20); vb = subVar(walkB.y, 20);
        } else {
            float kf = walkPos(2), c = floor(kf);
            walkPick(c, k0, v0, 20, 2.9, ka, va);
            walkPick(c + 1.0, k0, v0, 20, 2.9, kb, vb);
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

vec3 zRepeat(vec3 q, float c) { q.z = c * (abs(mod(q.z / c - 1.0, 4.0) - 2.0) - 1.0); return q; }
// Six-fold mirror lattice across the tube (p6m in xy): nearest hexagon
// centre, then the angle folded into a 30-degree wedge -- mirror symmetric,
// so the pieces meet without seams.
vec3 fHexXY(vec3 p, float cell)
{
    vec2 q = p.xy / cell;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float an = abs(mod(atan(h.y, h.x), 1.0471976) - 0.5235988);
    return vec3(length(h) * vec2(cos(an), sin(an)) * cell, p.z);
}
// The structure classes in order of energy (calm .. energetic), as the chain's
// (if-chains, not const arrays: NVIDIA returned entry 0 for three arrays
// indexed in one function -- the body never changed):
// the music's energy picks the region of the world too.
int ordsp(int i) { if (i == 0) return 0; if (i == 1) return 3; if (i == 2) return 15; if (i == 3) return 6; if (i == 4) return 19; if (i == 5) return 7; if (i == 6) return 9; if (i == 7) return 17; if (i == 8) return 14; if (i == 9) return 4; if (i == 10) return 16; if (i == 11) return 10; if (i == 12) return 12; if (i == 13) return 2; if (i == 14) return 11; if (i == 15) return 18; if (i == 16) return 5; if (i == 17) return 13; if (i == 18) return 8; return 1; }   // energy order, 20 classes
int ordco(int i) { if (i == 0) return 0; if (i == 1) return 4; if (i == 2) return 8; if (i == 3) return 3; if (i == 4) return 20; if (i == 5) return 15; if (i == 6) return 18; if (i == 7) return 9; if (i == 8) return 6; if (i == 9) return 11; if (i == 10) return 10; if (i == 11) return 16; if (i == 12) return 12; if (i == 13) return 1; if (i == 14) return 19; if (i == 15) return 14; if (i == 16) return 7; if (i == 17) return 13; if (i == 18) return 2; if (i == 19) return 21; if (i == 20) return 5; return 17; }   // energy order, 22 classes
int ordbo(int i) { if (i == 0) return 1; if (i == 1) return 21; if (i == 2) return 9; if (i == 3) return 7; if (i == 4) return 17; if (i == 5) return 18; if (i == 6) return 10; if (i == 7) return 2; if (i == 8) return 11; if (i == 9) return 19; if (i == 10) return 3; if (i == 11) return 5; if (i == 12) return 6; if (i == 13) return 12; if (i == 14) return 13; if (i == 15) return 0; if (i == 16) return 16; if (i == 17) return 8; if (i == 18) return 14; if (i == 19) return 15; if (i == 20) return 4; return 20; }   // energy order, 22 classes
// The app walks the structure too (EffectShader::stepChainWalk): (shown, target, fade).
uniform vec3 walkSpace, walkCore, walkBody;

// One world: a space, a fold core and a body, each a knob value on its energy scale.
float fieldK(vec3 p, float xs, float xc, float xb, int world)
{
    gDR = 1.0;
    int ks = ordsp(pickStage(xs, 20)); float vs = subVar(xs, 20);
    int kc = ordco(pickStage(xc, 22)); float vc = subVar(xc, 22);
    int kb = ordbo(pickStage(xb, 22)); float vb = subVar(xb, 22);
#ifdef SPEC_SP0
    // the app's specialised variant: world 0 / 1 are constants (each call site folds to its branches)
    ks = ordsp(world == 0 ? SPEC_SP0 : SPEC_SP1); kc = ordco(world == 0 ? SPEC_CO0 : SPEC_CO1); kb = ordbo(world == 0 ? SPEC_BO0 : SPEC_BO1);
#endif
    vec3 q;
    if (ks == 0) q = fRepeat(p, vec3(1.2 + 0.4 * vs));
    else if (ks == 1) { q = fPolarZ(p, 6.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.2; q = zRepeat(q, 0.8); }
    else if (ks == 2) q = fRepeat(fTwistZ(p, 0.25 * sin(gT * 0.05)), vec3(1.4));
    else if (ks == 3) q = fOcta(fRepeat(p, vec3(1.5)));
    else if (ks == 4) q = fRepeat(fRot(p, vec3(0.0, 0.0, 1.0), 0.3 * sin(gRot)), vec3(1.2, 1.2, 1.8));
    else if (ks == 5) {                                     // helix: a ring of blocks wound along the flight (a spiral staircase)
        q = fPolarZ(fTwistZ(p, 0.3 + 0.2 * vs), 5.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.0; q = zRepeat(q, 0.7);
    }
    else if (ks == 6) q = zRepeat(fHexXY(p, 2.2 + 0.6 * vs), 1.2);
    else if (ks == 8) {                                     // inverted lattice: lattice, inversion per cell, lattice again
        q = fRepeat(p, vec3(1.7 + 0.3 * vs)); q = fInvert(q + vec3(0.3, 0.2, 0.0), 1.4);   // in every cell a sphere inversion
        q = fRepeat(fScale(q, 1.6, vec3(0.0)), vec3(1.3));                                   // ... of a lattice: a bubble world per cell
    }
    else if (ks == 9) q = fRepeat(fScale(fLogSphere(p, gCam + vec3(0.0, 0.0, 6.0), 2.5 + vs, gT * 0.05), 2.5, vec3(0.0)), vec3(1.4));   // 3D Droste shells
    else if (ks == 12) q = fRepeat(fHalfSpace(p, 1.0), vec3(1.3));                  // hyperbolic half-space
    else if (ks == 13) { q = fPolarZ(fTwistZ(p, 0.6 + 0.3 * vs), 2.0); q.x -= 1.4; q = zRepeat(q, 0.6); }   // double helix
    else if (ks == 14) q = fRepeat(fLogCyl(p, 2.5 + vs), vec3(1.2));                  // log-cylindrical Droste
    else if (ks == 15) q = fPoly(fRepeat(p, vec3(1.6)), 5.0);                        // icosahedral lattice
    else if (ks == 16) { q = fRepeat(p, vec3(1.5)); float kb2 = 0.35 + 0.25 * vs; q.xy = rot2(kb2 * q.x) * q.xy; gDR *= 1.0 + 1.5 * kb2; }   // bent cells
    else if (ks == 17) { vec3 cc = gCam + vec3(0.0, 0.0, 6.0); float lr = log(max(length(p - cc), 1e-3));
        q = fLogSphere(p, cc, 2.5 + vs, gT * 0.05); q.xy = rot2(0.9 * lr) * q.xy; gDR *= 1.9; q = fRepeat(fScale(q, 2.5, vec3(0.0)), vec3(1.4)); }   // twisted 3D Droste
    else if (ks == 18) { float ws = 0.3 + 0.2 * vs; q = fRepeat(fWarp(p, ws, gT * 0.05), vec3(1.4)); }   // noise-warped lattice
    else if (ks == 19) q = fRollZ(p, 3.2 + vs, 1.2);                                   // the world rolled round the flight axis
    else if (ks == 10) q = fTorusWrap(p, 7.0 + 3.0 * vs, 1.3);                       // the world wrapped round a great ring
    else if (ks == 11) q = fRepeat(fGyroidWarp(p, 0.25 + 0.15 * vs, gT * 0.05), vec3(1.4));   // gyroid-warped lattice
    else if (ks == 7) q = f4DLattice(p, 1.3 + 0.3 * vs, 0.35 * sin(gT * 0.04) + gRot * 0.3, 0.25 * sin(gT * 0.031 + 1.0), 0.6 * sin(gT * 0.023));   // 4D-rotated lattice        // hexagonal lattice: a honeycomb of pillars
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
    } else if (kc == 6) {
        // Kleinian (pseudo-Kleinian) fold: box folds and sphere inversions,
        // endlessly nested grottoes; max() keeps the inversion continuous.
        q = fScale(q, 1.8, vec3(0.0));                      // the cells are small: grow them into the folds' reach
        for (int i = 0; i < 4; ++i) {
            q = 2.0 * clamp(q, -vec3(0.8, 0.8, 1.0), vec3(0.8, 0.8, 1.0)) - q;
            float k = max((1.05 + 0.3 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.7;
    }
    else if (kc == 7) {
        // icosahedral KIFS (Knighty): the icosahedral fold, a turn, scale 2
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.4 + 0.3 * vc); q = fScale(q, 1.9, vec3(0.55, 0.3, 0.9)); }
        bs = 1.2;
    } else if (kc == 8) {
        // polyhedral kaleidoscope: one polyhedral fold (tetra / octa / icosa by the
        // sub-variant) around each lattice cell, the body pushed off the axis
        q = fPoly(q, 3.0 + floor(vc * 2.99)); q.z -= 0.35;
        bs = 0.7;
    }
    else if (kc == 9) {
        // hyperbolic honeycomb: the cell mapped into the Poincare ball, folded
        q = fHyperBall(q * 0.8, 0.85 + 0.1 * vc) / 0.8;
        bs = 0.45;
    }
    else if (kc == 10) {
        // 'amazing surface' (Kali): box folds in xy only, sphere fold, turn, scale --
        // layered, sheet-like fractal terraces
        for (int i = 0; i < 3; ++i) {
            q.xy = clamp(q.xy, -1.0, 1.0) * 2.0 - q.xy;
            float r2 = max(dot(q, q), 1e-4);
            float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
            q *= k; gDR *= k;
            q = fRot(q, vec3(0.0, 0.0, 1.0), 0.3 + 0.4 * vc + 0.2 * sin(gRot));
            q = fScale(q, 1.25, vec3(0.0));
        }
        bs = 3.0;   /* spot check: 4 rounds x 1.5 turned to noise; bodies must be large after the folds */
    }
    else if (kc == 11) {                                    // pseudo-Kleinian (Knighty's constants)
        const vec3 CS = vec3(0.92436, 0.90756, 0.92436);
        for (int i = 0; i < 5; ++i) {
            q = 2.0 * clamp(q, -CS, CS) - q;
            float k = max((1.0 + 0.15 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.6;
    } else if (kc == 12) {                                  // kaliset: abs(p)/|p|^2 - c
        for (int i = 0; i < 4; ++i) {
            float r2 = max(dot(q, q), 0.08);
            q = abs(q) / r2 - vec3(0.5 + 0.3 * vc, 0.4, 0.6); gDR /= r2;
        }
        bs = 0.9;
    } else if (kc == 13) {                                  // dodecahedral KIFS
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(0.0, 0.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(0.0, 0.53, 0.85)); }
        bs = 1.2;
    } else if (kc == 14) {                                  // Sierpinski octahedron
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(1.0, 0.0, 0.0)); }
        bs = 1.8;
    } else if (kc == 15) {                                  // Apollonian sphere packing
        for (int i = 0; i < 3; ++i) {
            q = abs(fract(q * 0.25 + 0.25) * 4.0 - 2.0) - 1.0;   // mirrored repeat (continuous)
            float k = (1.1 + 0.2 * vc) / max(dot(q, q), 1e-3);
            q *= k; gDR *= k;
        }
        bs = 1.6;
    }
    else if (kc == 16) {                                    // Mandelbulb (power 8): its own distance estimate
        vec3 z = q * 1.3, c0 = z; float dr = 1.0, r = length(z);
        for (int i = 0; i < 3; ++i) {
            r = length(z); if (r > 2.0) break;
            float th0 = acos(clamp(z.z / max(r, 1e-4), -1.0, 1.0)) * 8.0 + gRot * 0.3, ph0 = atan(z.y, z.x) * 8.0;
            dr = pow(r, 7.0) * 8.0 * dr + 1.0;
            z = pow(r, 8.0) * vec3(sin(th0) * cos(ph0), sin(th0) * sin(ph0), cos(th0)) + c0;
        }
        r = length(z);
        gP = c0;
        return 0.5 * log(max(r, 1e-4)) * r / dr / 1.3 / gDR * 0.8;
    } else if (kc == 17) {                                  // cross-Menger: Menger folds, scale 2.4 about the arm
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fScale(q, 2.4, vec3(1.4, 1.4, 0.0)); if (q.z < -0.7) q.z += 1.4; }
        bs = 2.2;
    } else if (kc == 18) {                                  // Mandalay box: octahedral fold, box fold, sphere fold
        for (int i = 0; i < 2; ++i) { q = fOcta(q); q = fBox(q, 0.8); q = fSphere(q, 0.4, 1.0); q = fScale(q, 1.6, vec3(0.4, 0.2, 0.1) * (1.0 + vc)); }
        bs = 2.4;   /* spot check: 3 rounds turned to dust */
    } else if (kc == 19) {                                  // mixed Sierpinski: tetra and octa folds alternating
        for (int i = 0; i < 4; ++i) { if (i == 1 || i == 3) q = fOcta(q); else q = fTetra(q); q = fScale(q, 1.8, vec3(0.8 + 0.3 * vc)); }
        bs = 1.6;
    } else if (kc == 20) {                                  // spherical KIFS: abs, sphere fold, turn, scale 2
        for (int i = 0; i < 3; ++i) { q = abs(q); q = fSphere(q, 0.4, 0.9); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.3 * vc); q = fScale(q, 2.0, vec3(0.9)); }
        bs = 1.3;
    } else if (kc == 21) {                                  // twisted octahedral KIFS: the turn grows per round
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.2, 1.0, 0.5), gRot * 0.4 + 0.35 * float(i + 1) + vc); q = fScale(q, 1.6, vec3(0.45, 0.22, 0.08)); }
        bs = 2.6;   /* spot check: the bodies had been pushed out of the cells */
    }
    gP = q;
    float th = 1.0 + 0.3 * gSpread;
    float d;
    if (kb == 0) d = sdBox3(q, vec3(0.35 + 0.1 * vb, 0.3, 0.35) * bs * th);
    else if (kb == 1) d = sdSphere3(q, 0.45 * bs * th);
    else if (kb == 2) d = sdTorus3(q.xzy, 0.5 * bs, 0.12 * bs * th);   // the ring lies in xy: z is the smallest axis after a sort
    else if (kb == 3) d = sdGyroid3(q * (3.0 / bs), 0.25 + 0.2 * gSpread) * bs / 3.0;
    else if (kb == 5) { vec3 w = q * (3.0 / bs); d = (abs(cos(w.x) + cos(w.y) + cos(w.z)) - 0.35 - 0.3 * gSpread) / 2.2 * bs / 3.0; }   // Schwarz P
    else if (kb == 6) { vec3 w = q * (3.0 / bs); vec3 sn = sin(w), cs = cos(w);                     // Schwarz D
        d = (abs(sn.x * sn.y * sn.z + sn.x * cs.y * cs.z + cs.x * sn.y * cs.z + cs.x * cs.y * sn.z) - 0.25 - 0.2 * gSpread) / 2.2 * bs / 3.0; }
    else if (kb == 7) d = sdOcta3(q, 0.6 * bs * th);
    else if (kb == 9) d = sdSuperquad(q, 0.5 * bs * th, 2.5 + 6.0 * vb);                     // superquadric
    else if (kb == 10) d = max(abs(length(q) - 0.5 * bs * th) - 0.05 * bs, -sdOcta3(q, 0.75 * bs));   // hollow sphere
    else if (kb == 11) { vec3 w = q; w.x -= clamp(w.x, -0.25 * bs, 0.25 * bs); d = sdTorus3(w.xzy, 0.3 * bs, 0.07 * bs * th); }   // chain link
    else if (kb == 12) d = sdNeovius(q * (3.0 / bs), 0.4 + 0.8 * gSpread) * bs / 3.0;          // Neovius surface
    else if (kb == 13) d = sdLidinoid(q * (3.0 / bs), 0.05 + 0.05 * gSpread) * bs / 3.0;       // Lidinoid                                  // octahedron
    else if (kb == 8) d = min(min(length(q.xy), length(q.yz)), length(q.zx)) - 0.1 * bs * th;   // rod lattice
    else if (kb == 14) d = min(sdTetra3(q, 0.4 * bs * th), sdTetra3(-q, 0.4 * bs * th));   // stellated octahedron
    else if (kb == 15) d = max(max(length(q.xy), length(q.yz)), length(q.zx)) - 0.4 * bs * th;   // Steinmetz tricylinder
    else if (kb == 16) { vec3 w = q; w.xz = rot2(q.y * 2.5) * w.xz; d = sdBox3(w, vec3(0.16, 0.6, 0.16) * bs * th) * 0.6; }   // twisted pillar
    else if (kb == 17) d = (max(max(abs(q.x) + abs(q.y), abs(q.y) + abs(q.z)), abs(q.z) + abs(q.x)) - 0.6 * bs * th) * 0.7071;   // rhombic dodecahedron
    else if (kb == 18) d = sdIcosa3(q, 0.45 * bs * th);                                  // icosahedron
    else if (kb == 19) { float R = 0.38 * bs, r0 = 0.07 * bs * th; vec3 a = q + vec3(0.2 * bs, 0.0, 0.0), b = q - vec3(0.2 * bs, 0.0, 0.0);
        d = min(length(vec2(length(a.xy) - R, a.z)) - r0, length(vec2(length(b.xz) - R, b.y)) - r0); }   // linked rings
    else if (kb == 20) { float rho = length(q.xy), Rr = 0.45 * bs + 0.06 * bs * smoothstep(-0.3, 0.3, sin(12.0 * atan(q.y, q.x)));
        d = max(max(rho - Rr, 0.2 * bs - rho), abs(q.z) - 0.08 * bs * th) * 0.7; }   // gear
    else if (kb == 21) { vec3 w = q; w.x -= clamp(w.x, -0.3 * bs, 0.3 * bs); d = length(w) - 0.15 * bs * th; }   // pill
    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th), sdBox3(q, vec3(0.08, 0.6, 0.08) * bs * th)), sdBox3(q, vec3(0.08, 0.08, 0.6) * bs * th));
    return d / gDR * 0.8;
}
// The world, walking: while the app fades one structure stage, the two worlds'
// distance fields are mixed -- continuous, the architecture melts into the next.
float field3(vec3 p)
{
    float xs = spaceP, xc = coreP, xb = bodyP, ys = xs, yc = xc, yb = xb, f = 0.0;
    if (walkHost > 0.5 && walkAll()) {
        xs = walkSpace.x; xc = walkCore.x; xb = walkBody.x;
        ys = walkSpace.y; yc = walkCore.y; yb = walkBody.y;
        f = smoothstep(0.0, 1.0, max(walkSpace.z, max(walkCore.z, walkBody.z)));   // one structure stage fades at a time
    }
    float d0 = fieldK(p, xs, xc, xb, 0);
    if (f <= 0.0) return d0;
    vec3 p0 = gP;
    float d1 = fieldK(p, ys, yc, yb, 1);
    gP = mix(p0, gP, f);
    return mix(d0, d1, f);
}
vec2 chain(vec2 uv)
{
    return runChain(uv);
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


// The solid chain texture: time as the third axis.  A 2D chain whose
// parameters run with time IS a volume (x, y, t).  One time axis alone is not
// isotropic (a face along it cuts the volume in a line and smears it), so each
// of the three planes reads the chain with the coordinate ALONG ITS NORMAL as
// its time, and the normal picks the plane that faces the surface: no streaks,
// and every depth shows its own phase of the chain, like a carved block --
// while the real time keeps the whole block changing.
vec3 chainSlice(vec2 uv, float depth, float lod, float pal)
{
    float tc = gTC, tr = gRot;
    gTC += 0.3 * depth;
    gRot += 0.15 * depth;
    vec3 c = chainPlane(uv, lod, pal);
    gTC = tc; gRot = tr;
    return c;
}
vec3 solidChain3(vec3 q, vec3 n, float lod, float pal)
{
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return chainSlice(q.yz * 0.35 + 0.5, q.x, lod, pal) * w.x + chainSlice(q.zx * 0.35 + 0.5, q.y, lod, pal) * w.y
         + chainSlice(q.xy * 0.35 + 0.5, q.z, lod, pal) * w.z;
}
vec3 colour3(vec3 q, vec3 n, float lod, float pal)
{
    // One triplanar projection for both looks: the solid texture is the same
    // three planes with the depth along each normal as the chain's time (the
    // photo look has depth 0) -- three chain call sites instead of six.
    float sd = solidP >= 0.5 ? 1.0 : 0.0;
    // Planes with a small weight are skipped: the weights are shifted down so
    // they reach exactly zero (no seam), and most surface points then read one
    // or two planes instead of three (the chain has no derivatives, so the
    // branches are safe).
    vec3 w = max(pow(abs(n), vec3(4.0)) - 0.03, 0.0); w /= (w.x + w.y + w.z);
    vec3 c = vec3(0.0);
    if (w.x > 0.0) c += chainSlice(q.yz * 0.35 + 0.5, q.x * sd, lod, pal) * w.x;
    if (w.y > 0.0) c += chainSlice(q.zx * 0.35 + 0.5, q.y * sd, lod, pal) * w.y;
    if (w.z > 0.0) c += chainSlice(q.xy * 0.35 + 0.5, q.z * sd, lod, pal) * w.z;
    return c;
}


// Relief: the brightness of the colour chain as height -- the normal is tilted
// by its slope, sampled around the folded surface point (no extra evaluation
// of the field -- each would inline it once more), so the light follows the bumps.
float reliefH(vec3 fq, vec3 n, float lod)
{
    vec3 w = abs(n);
    vec2 uv = (w.x > w.y && w.x > w.z) ? fq.yz : (w.y > w.z ? fq.zx : fq.xy);
    return luma(chainPlane(uv * 0.35 + 0.5, lod, 0.0));
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
    mat3 cf = camFrame(camFlight(gT), ro);
    gCam = ro;
    gTube = 0.4 + 0.15 * swell;                             // the carved tube breathes with the slow swell
    vec3 rd = gazeDir(p, camP, sceneTime, cf, ro);
    float t = 0.05; float d = 1.0; bool hit = false; vec3 fp = vec3(0.0); float fdr = 1.0;
    for (int i = 0; i < 100; ++i) {
        d = fieldD(ro + rd * t);
        if (abs(d) < 0.0015 * t) { hit = true; fp = gP; fdr = gDR; break; }   // gP of the hit point: no extra evaluation
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
        float lod = clamp(log2(t * 2.0) + 1.5 * (1.0 - clamp(detailP, 0.0, 1.0)), 0.0, 7.0);
        vec3 nGeo = n;                                          // texture on the geometric normal, light on the bumped one
        if (reliefP > 0.3) {                                    // a knob: every pixel takes the same branch
            vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(n, t1);
            float e = 0.006 * max(t, 1.0), hl = lod + 1.5;
            // sampled in the folded space around fp (the fold stretches by fdr there)
            float ef = e * fdr, h0 = reliefH(fp, n, hl);
            vec3 g = t1 * (reliefH(fp + t1 * ef, n, hl) - h0) + t2 * (reliefH(fp + t2 * ef, n, hl) - h0);
            n = normalize(n - g / e * 0.05 * smoothstep(0.3, 1.0, reliefP));
        }
        vec3 tex = colour3(fp, nGeo, lod, 0.2 + 0.7 * clamp(paletteP, 0.0, 1.0));
        float tm = luma(tex);
        tex = max((tex - tm) * 1.5 + tm, 0.0) * 1.5;           // livelier colour, brighter
        vec3 L = normalize(vec3(0.5, 0.7, -0.4));
        float diff = max(dot(n, L), 0.0);
        float ao = 0.0;
        for (int k = 1; k <= 2; ++k) { float h = 0.06 * float(k); ao += (h - fieldD(q + n * h)) / h; }
        ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0);
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
