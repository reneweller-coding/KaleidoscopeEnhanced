# -*- coding: utf-8 -*-
"""Build src/ChainLabTunnel.glsl: a tunnel whose wall is a rolled 2D chain in relief.
The stage machine (classes, sub-variants, morph) is copied from ChainLab2D."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
lab2 = io.open(os.path.join(SP, "src", "ChainLab2D.glsl"), encoding="utf-8").read()
a = lab2.index("// The stage index and a sub-variant")
b = lab2.index("vec2 chain(vec2 p)")
STAGES = re.sub(r"\bgT\b", "gTC", lab2[a:b])      # the wall's chain flows at the 2D lab's calm pace
HEAD = r'''//@doc
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
'''
BODY = r'''
vec2 chain(vec2 uv)
{
    gIdW = 1.0;
    uv = stageA(uv);
    uv = mirrorUV(uv);
    uv = stageB(uv);
    uv = mirrorUV(uv);
    uv = stageC(uv);
    uv = mirrorUV(uv);
    uv = stageD(uv);
    // Never an empty chain: as the stages together approach 'none' (gIdW), a
    // calm six-fold kaleidoscope fades in -- the bare photo is never shown.
    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);
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
        float crest = smoothstep(0.45, 0.85, hgt);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 glow = neonOf(field + 1e-3, 2.0) * (crest * (0.6 + 1.2 * kick) + fres * 0.5);
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + glow * 0.25 * (0.5 + kick), glow + surf * 0.55, smoothstep(0.35, 0.65, st));
        col = mix(fogC, sc, exp(-t * (0.07 + 0.03 * swell)));
    }
    finish(col);
}
'''
io.open(os.path.join(SP, "src", "ChainLabTunnel.glsl"), "w", encoding="utf-8", newline="\n").write(HEAD + STAGES + BODY)
print("ok")
