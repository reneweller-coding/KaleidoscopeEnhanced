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
    if (k == 6) return tKaleido(uv, vec2(0.5), sides(v), -gRot);
    return tJoukowski(uv, gCw, 0.5 + 0.2 * sin(gTC * 0.4) + 0.1 * v, 2.0);
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
    int k0 = pickStage(chainAP, 11); float v = subVar(chainAP, 11);
    if (morphStage() != 1) return stageAk(uv, k0, v);
    float kf = float(k0) + gMw;
    int i0 = int(mod(floor(kf), 11.0)), i1 = int(mod(floor(kf) + 1.0, 11.0));
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
    int k0 = pickStage(chainCP, 8); float v = subVar(chainCP, 8);
    if (morphStage() != 3) return stageCk(uv, k0, v);
    float kf = float(k0) + gMw;
    int i0 = int(mod(floor(kf), 8.0)), i1 = int(mod(floor(kf) + 1.0, 8.0));
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
    return (1.0 - gH * wallHeight(w, c)) - length(q.xy - axisXY(q.z));
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
        float crest = smoothstep(0.55, 0.9, hgt);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 glow = neonOf(field + 1e-3, 2.0) * (crest * (0.6 + 1.2 * kick) + fres * 0.5);
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + glow * 0.25 * (0.5 + kick), glow + surf * 0.35, smoothstep(0.35, 0.65, st));
        col = mix(fogC, sc, exp(-t * (0.07 + 0.03 * swell)));
    }
    finish(col);
}
