//@doc
 * @brief CHAIN LAB 2D: the chain laboratory -- every time the scene starts it
 * rolls a new chain of four continuous transforms from four classes: a global
 * map (kaleidoscope, log-polar spiral, tunnel, Moebius, Droste, polar,
 * exponential, sine, inversion), a symmetry (none, kaleidoscope, p6m, p4m,
 * iterated fold, mirror line), a second global map (none, spiral, tunnel,
 * inversion, square, lens, kaleidoscope) and a warp (none, twirl, shear wave,
 * ripple, domain warp, turning).  With the sub-variants (number of mirrors,
 * spiral arms, lattice size) that is tens of thousands of chains in one file.
 * Every stage is continuous and the stages are joined by the photo's mirror
 * repeat, so each chain is seamless; the photograph flows through it without
 * end.  Rendered as the photo, a lit relief, glowing edges or contour lines,
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
 * runs), morphP (which stage, if any, morphs on through its class while the
 * scene runs -- driven by the music, always as a cross-fade), styleP (photo / relief / glowing edges / contour lines), speedP (flow
 * speed), detailP (texture sharpness), paletteP (photo colours / colour field), hueP.
//@params chainAP chainBP chainCP chainDP morphP styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gSpread, gRot, gMw;
vec2 gCw, gCt;
// The stage index and a sub-variant 0..1 from one rolled knob.
int pickStage(float x, int n) { return int(min(floor(clamp(x, 0.0, 1.0) * float(n)), float(n - 1))); }
float subVar(float x, int n) { return fract(clamp(x, 0.0, 0.9999) * float(n)); }
float evenArms(float v) { return 2.0 * (1.0 + floor(v * 3.99)); }        // 2, 4, 6, 8 (seamless spiral)
float sides(float v) { return 5.0 + floor(v * 4.99); }                     // 5 .. 9 mirrors

// Stage A: a global map.
vec2 stageAk(vec2 uv, int k, float v)
{
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
    return tInvert(uv, gCw, 0.22 + 0.08 * v + 0.1 * gSpread);
}
// Stage B: a symmetry.
vec2 stageBk(vec2 uv, int k, float v)
{
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
    if (k == 0) return uv;
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 1.0, gT * 1.5);
    if (k == 2) return tTunnel(uv, gCt, 0.25, gT * 2.5);
    if (k == 3) return tInvert(uv, gCw, 0.28 + 0.1 * gSpread);
    if (k == 4) return tSquare(uv, gCw, 1.4 + 0.4 * v + 0.6 * gSpread);
    if (k == 5) return tLens(uv, gCw, 0.35 + 0.15 * v, 0.4 + 0.4 * sin(gT));
    return tKaleido(uv, vec2(0.5), sides(v), -gRot);
}
// Stage D: a warp.
vec2 stageDk(vec2 uv, int k, float v)
{
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gT * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gT * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gT * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gT);
    return tRot(uv, vec2(0.5), 0.5 * sin(gT * 0.3 + v * 6.28));
}

// Chain morph: morphP picks (once per start) which stage wanders -- none, A, B,
// C or D.  That stage then walks through its class, driven by time and the
// integrated music (sceneAdvance, which surges on flux and harmonic changes):
// it holds a transform, then cross-fades to the next one.  The fade mixes the
// two MIRRORED outputs, each continuous, so the picture never jumps.
int morphStage() { return pickStage(morphP, 5); }
vec2 morphMix(vec2 a, vec2 b, float f) { return mix(mirrorUV(a), mirrorUV(b), f); }
vec2 stageA(vec2 uv)
{
    int k0 = pickStage(chainAP, 9); float v = subVar(chainAP, 9);
    if (morphStage() != 1) return stageAk(uv, k0, v);
    float kf = float(k0) + gMw;
    int i0 = int(mod(floor(kf), 9.0)), i1 = int(mod(floor(kf) + 1.0, 9.0));
    float f = smoothstep(0.55, 1.0, fract(kf));
    if (f <= 0.0) return stageAk(uv, i0, v);
    return morphMix(stageAk(uv, i0, v), stageAk(uv, i1, v), f);
}
vec2 stageB(vec2 uv)
{
    int k0 = pickStage(chainBP, 6); float v = subVar(chainBP, 6);
    if (morphStage() != 2) return stageBk(uv, k0, v);
    float kf = float(k0) + gMw;
    int i0 = int(mod(floor(kf), 6.0)), i1 = int(mod(floor(kf) + 1.0, 6.0));
    float f = smoothstep(0.55, 1.0, fract(kf));
    if (f <= 0.0) return stageBk(uv, i0, v);
    return morphMix(stageBk(uv, i0, v), stageBk(uv, i1, v), f);
}
vec2 stageC(vec2 uv)
{
    int k0 = pickStage(chainCP, 7); float v = subVar(chainCP, 7);
    if (morphStage() != 3) return stageCk(uv, k0, v);
    float kf = float(k0) + gMw;
    int i0 = int(mod(floor(kf), 7.0)), i1 = int(mod(floor(kf) + 1.0, 7.0));
    float f = smoothstep(0.55, 1.0, fract(kf));
    if (f <= 0.0) return stageCk(uv, i0, v);
    return morphMix(stageCk(uv, i0, v), stageCk(uv, i1, v), f);
}
vec2 stageD(vec2 uv)
{
    int k0 = pickStage(chainDP, 6); float v = subVar(chainDP, 6);
    if (morphStage() != 4) return stageDk(uv, k0, v);
    float kf = float(k0) + gMw;
    int i0 = int(mod(floor(kf), 6.0)), i1 = int(mod(floor(kf) + 1.0, 6.0));
    float f = smoothstep(0.55, 1.0, fract(kf));
    if (f <= 0.0) return stageDk(uv, i0, v);
    return morphMix(stageDk(uv, i0, v), stageDk(uv, i1, v), f);
}
vec2 chain(vec2 p)
{
    vec2 uv = p * 0.5 + 0.5;
    uv = stageA(uv);
    uv = mirrorUV(uv);
    uv = stageB(uv);
    uv = mirrorUV(uv);
    uv = stageC(uv);
    uv = mirrorUV(uv);
    uv = stageD(uv);
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
    photo = mix(photo, field, 0.25 + 0.7 * clamp(paletteP, 0.0, 1.0));
    // Relief: the chain's photo lit from a slowly circling light.
    float la = 0.1 * sceneTime;
    float relief = clamp(0.5 + dot(grad, vec2(cos(la), sin(la))) * 5.0, 0.0, 1.0);
    vec3 reliefC = photo * (0.3 + 1.2 * relief) + vec3(1.0) * pow(relief, 6.0) * (0.1 + 0.3 * swell);
    // Glowing edges: gradient magnitude as neon.
    vec3 gc = mix(glowColour(ph, p, hueP * 0.159), neonOf(field + 1e-3, 2.0), clamp(paletteP, 0.0, 1.0));
    float edge = smoothstep(0.02, 0.25, length(grad));
    vec3 neon = gc * edge * (1.5 + 1.2 * kick) + photo * 0.1;
    // Isolines of the chain's luma: glowing contour lines.
    float xi = m * 12.0;
    float pxi = fwidth(xi) + 1e-4;
    float iso = smoothstep(pxi * 1.5, 0.0, abs(fract(xi) - 0.5) - 0.5 + pxi * 1.5);
    vec3 isoC = gc * iso * (1.3 + kick) + photo * 0.12;
    // The rolled style snaps to a pure look (blends between two looks are muddy);
    // it is constant while the scene runs, so the snap never shows as a jump.
    float st = clamp(styleP, 0.0, 1.0) * 3.0;               // 0 photo, 1 relief, 2 edges, 3 isolines
    st = floor(st) + smoothstep(0.35, 0.65, fract(st));
    vec3 col = mix(photo, reliefC, smoothstep(0.0, 1.0, st));
    col = mix(col, neon, smoothstep(1.0, 2.0, st));
    col = mix(col, isoC, smoothstep(2.0, 3.0, st));
    col *= mix(vec3(0.9, 0.97, 1.08), vec3(1.08, 0.98, 0.9), mode);
    col += gc * edge * kick * 0.3 * (1.0 - smoothstep(1.0, 2.0, st));
    finish(col);
}
