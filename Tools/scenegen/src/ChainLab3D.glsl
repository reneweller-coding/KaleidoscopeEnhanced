//@doc
 * @brief CHAIN LAB 3D: the 3D chain laboratory -- every start rolls a new
 * raymarched world from three classes of continuous space transforms: a space
 * (mirrored lattice, polar ring tunnel, twisted lattice, octahedral lattice,
 * turning lattice), a fold core (none, tetrahedral KIFS, octahedral KIFS, a
 * sphere-inversion box fold, plane folds) and an end body (block, ball, torus, gyroid
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
 *   audioSwell      -> the fog glow and the colour saturation (slow)
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

// Stage A: a global map.
vec2 stageAk(vec2 uv, int k, float v)
{
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
    return tInvert(uv, gCw, 0.22 + 0.08 * v + 0.1 * gSpread);
}
// Stage B: a symmetry.
vec2 stageBk(vec2 uv, int k, float v)
{
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
    if (k == 0) return uv;
    if (k == 1) return tSpiral(uv, vec2(0.5), evenArms(v), 1.0, gTC * 1.5);
    if (k == 2) return tTunnel(uv, gCt, 0.25, gTC * 2.5);
    if (k == 3) return tInvert(uv, gCw, 0.28 + 0.1 * gSpread);
    if (k == 4) return tSquare(uv, gCw, 1.4 + 0.4 * v + 0.6 * gSpread);
    if (k == 5) return tLens(uv, gCw, 0.35 + 0.15 * v, 0.4 + 0.4 * sin(gTC));
    return tKaleido(uv, vec2(0.5), sides(v), -gRot);
}
// Stage D: a warp.
vec2 stageDk(vec2 uv, int k, float v)
{
    if (k == 0) return uv;
    if (k == 1) return tTwirl(uv, gCw, 2.5 * sin(gTC * 0.6), 0.3 + 0.1 * v + 0.2 * gSpread);
    if (k == 2) return tWave(uv, 6.0 + 4.0 * v, 0.02 + 0.04 * gSpread, gTC * 4.0);
    if (k == 3) return tRipple(uv, gCt, 25.0 + 15.0 * v, 0.01 + 0.03 * gSpread, gTC * 8.0);
    if (k == 4) return tWarp(uv, 0.05 + 0.15 * gSpread, gTC);
    return tRot(uv, vec2(0.5), 0.5 * sin(gTC * 0.3 + v * 6.28));
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

vec3 zRepeat(vec3 q, float c) { q.z = c * (abs(mod(q.z / c - 1.0, 4.0) - 2.0) - 1.0); return q; }
float field3(vec3 p)
{
    int ks = pickStage(spaceP, 5); float vs = subVar(spaceP, 5);
    int kc = pickStage(coreP, 5);  float vc = subVar(coreP, 5);
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
    vec3 rd = cf * normalize(vec3(p, 1.1));
    float t = 0.05; float d = 1.0; bool hit = false;
    for (int i = 0; i < 100; ++i) {
        d = fieldD(ro + rd * t);
        if (abs(d) < 0.0008 * t) { hit = true; break; }
        t += d * 0.8;
        if (t > 30.0) break;
    }
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.9, 0.7), mode);
    vec3 fogC = glowColour(imgK(vec2(0.5) + 0.2 * p, 5.0), p, hueP * 0.159) * (0.05 + 0.12 * swell);
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
        vec3 rim = rimC * fres * (0.4 + 1.5 * kick) + surf * 0.15;
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + rimC * fres * (0.15 + 0.6 * kick), rim * 1.3 + rimC * 0.05 * ao, smoothstep(0.5, 1.0, st));
        col = mix(fogC, sc, exp(-t * (0.06 + 0.04 * swell)));
    }
    finish(col);
}
