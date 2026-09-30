# -*- coding: utf-8 -*-
"""Write chain scenes (composed continuous transforms) to src/<Name>.glsl.
Each spec: name, one-line description of the chain, GLSL chain body."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
M = "uv = mirrorUV(uv);"
W = "vec2 cw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));"
ROT = "float rot = 0.02 * sceneTime + 0.2 * audioPhase;"
SPECS = [
 ("ChainSpiralKaleido", "a log-polar spiral (endless zoom) seen through a six-fold kaleidoscope",
  [W, ROT, "uv = tSpiral(uv, vec2(0.5), 6.0, 1.0, gT * 2.0);", M, "uv = tKaleido(uv, cw, 6.0, rot);"]),
 ("ChainKaleidoSpiral", "a six-fold kaleidoscope wound into an endlessly zooming log-polar spiral",
  [W, ROT, "uv = tKaleido(uv, cw, 6.0, rot);", M, "uv = tSpiral(uv, vec2(0.5), 4.0, 1.2, gT * 2.0);"]),
 ("ChainMobiusKaleido", "a Moebius map streaming the photo between two wandering poles, then folded eight-fold",
  [W, ROT, "vec2 pa = vec2(0.5) + 0.3 * vec2(sin(gT), cos(gT * 0.7)), pb = vec2(0.5) - 0.3 * vec2(sin(gT * 0.8), cos(gT));",
   "uv = tMobius(uv, pa, pb, 0.25 + 0.2 * gSpread);", M, "uv = tKaleido(uv, cw, 8.0, rot);"]),
 ("ChainKaleidoMobius", "a kaleidoscope whose mirror image is then streamed through a Moebius map",
  [W, ROT, "uv = tKaleido(uv, cw, 6.0, rot);", M,
   "vec2 pa = vec2(0.5) + 0.25 * vec2(sin(gT), cos(gT * 0.7)), pb = vec2(0.5) - 0.25 * vec2(sin(gT * 0.8), cos(gT));",
   "uv = tMobius(uv, pa, pb, 0.3 + 0.2 * gSpread);"]),
 ("ChainInvertFold", "a circle inversion of the photo, folded by an iterated fractal kaleidoscope",
  [W, "uv = tInvert(uv, cw, 0.25 + 0.1 * gSpread);", M, "uv = tFold(uv, 0.4 + 0.3 * sin(gT), 1.25, 3.0);"]),
 ("ChainFoldSpiral", "an iterated fractal fold wound into a zooming log-polar spiral",
  ["uv = tFold(uv, 0.5 + 0.3 * sin(gT * 0.7), 1.3, 3.0);", M, "uv = tSpiral(uv, vec2(0.5), 4.0, 1.0, gT * 2.0);"]),
 ("ChainSquareKaleido", "the photo squared in the complex plane (every angle doubled), then folded five-fold",
  [W, ROT, "uv = tSquare(uv, cw, 1.6 + 0.6 * gSpread);", M, "uv = tKaleido(uv, vec2(0.5), 5.0, rot);"]),
 ("ChainTwirlP4m", "a slowly breathing twirl folded into a square mirror lattice (p4m)",
  [W, "uv = tTwirl(uv, cw, 2.5 * sin(gT * 0.6), 0.35 + 0.2 * gSpread);", "uv = tP4m(uv, 3.0);"]),
 ("ChainWarpKaleidoSpiral", "a flowing domain warp, folded six-fold, then wound into a zooming spiral",
  [W, ROT, "uv = tWarp(uv, 0.1 + 0.25 * gSpread, gT);", "uv = tKaleido(uv, cw, 6.0, rot);", M,
   "uv = tSpiral(uv, vec2(0.5), 6.0, 0.8, gT * 1.5);"]),
 ("ChainSpiralInvertKaleido", "a zooming spiral, turned inside out by a circle inversion, then folded",
  [W, ROT, "uv = tSpiral(uv, vec2(0.5), 4.0, 1.0, gT * 1.5);", M, "uv = tInvert(uv, cw, 0.3 + 0.1 * gSpread);", M,
   "uv = tKaleido(uv, vec2(0.5), 6.0, rot);"]),
 ("ChainMobiusFoldTwirl", "a Moebius stream, an iterated fold and a breathing twirl in sequence",
  [W, "vec2 pa = vec2(0.5) + 0.3 * vec2(sin(gT), cos(gT * 0.7)), pb = vec2(0.5) - 0.3 * vec2(sin(gT * 0.8), cos(gT));",
   "uv = tMobius(uv, pa, pb, 0.3);", M, "uv = tFold(uv, 0.3 + 0.2 * sin(gT), 1.2, 2.0);", M,
   "uv = tTwirl(uv, cw, 2.0 * sin(gT * 0.5), 0.3 + 0.2 * gSpread);"]),
 ("ChainP4mSpiralKaleidoWarp", "four stages: a square mirror lattice, a zooming spiral, a kaleidoscope and a warp",
  [W, ROT, "uv = tP4m(uv, 2.0);", "uv = tSpiral(uv, vec2(0.5), 4.0, 1.0, gT * 1.5);", M,
   "uv = tKaleido(uv, cw, 6.0, rot);", "uv = tWarp(uv, 0.05 + 0.15 * gSpread, gT);"]),
]
CT = "vec2 ct = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));   // the wandering tunnel centre"
SPECS2 = [
 ("ChainTunnelKaleido", "a tunnel around a wandering centre, its walls folded by a six-fold kaleidoscope",
  [W, ROT, CT, "uv = tTunnel(uv, ct, 0.25, gT * 3.0);", M, "uv = tKaleido(uv, cw, 6.0, rot);"]),
 ("ChainKaleidoTunnel", "a turning kaleidoscope whose image lines a tunnel around a wandering centre",
  [W, ROT, CT, "uv = tKaleido(uv, cw, 6.0, rot);", M, "uv = tTunnel(uv, ct, 0.25, gT * 3.0);"]),
 ("ChainTunnelHex", "a tunnel around a wandering centre, its walls tiled by a six-fold mirror lattice",
  [CT, "uv = tTunnel(uv, ct, 0.3, gT * 3.0);", M, "uv = tHex(uv, 2.5 + gSpread);"]),
 ("ChainHexTunnel", "a six-fold mirror lattice lining a tunnel around a wandering centre",
  [CT, "uv = tHex(uv, 3.0);", M, "uv = tTunnel(uv, ct, 0.25, gT * 3.0);"]),
 ("ChainExpKaleido", "the complex exponential (a spiral of repeating bands), folded eight-fold",
  [W, ROT, "uv = tExp(uv, cw, 3.0 + 2.0 * gSpread);", M, "uv = tKaleido(uv, vec2(0.5), 8.0, rot);"]),
 ("ChainSinFold", "the complex sine (a lattice of saddles), folded by an iterated fractal kaleidoscope",
  [W, "uv = tSin(uv, cw, 4.0 + 2.0 * gSpread);", M, "uv = tFold(uv, 0.4 + 0.3 * sin(gT), 1.25, 3.0);"]),
 ("ChainDrosteKaleido", "a Droste zoom (the picture repeating inward at every scale), folded six-fold",
  [W, ROT, CT, "uv = tDroste(uv, ct, 3.0, gT * 1.5);", M, "uv = tKaleido(uv, cw, 6.0, rot);"]),
 ("ChainRippleHex", "radial ripples spreading from a wandering centre, over a six-fold mirror lattice",
  [CT, "uv = tRipple(uv, ct, 30.0, 0.01 + 0.03 * gSpread, gT * 8.0);", "uv = tHex(uv, 3.0);"]),
 ("ChainTunnelLens", "a tunnel around a wandering centre, seen through a drifting magnifying lens",
  [W, CT, "uv = tTunnel(uv, ct, 0.25, gT * 3.0);", M, "uv = tLens(uv, cw, 0.4, 0.4 + 0.4 * sin(gT));"]),
 ("ChainPolarKaleidoWave", "a polar unwrap, folded six-fold, then rippled by a shear wave",
  [W, ROT, CT, "uv = tPolar(uv, ct, 1.5);", M, "uv = tKaleido(uv, cw, 6.0, rot);", "uv = tWave(uv, 8.0, 0.02 + 0.04 * gSpread, gT * 4.0);"]),
 ("ChainMirrorTunnelSpiral", "a turning mirror line, a tunnel around a wandering centre, and a zooming spiral",
  [ROT, CT, "uv = tMirrorLine(uv, vec2(0.5), rot * 2.0);", "uv = tTunnel(uv, ct, 0.25, gT * 2.0);", M,
   "uv = tSpiral(uv, vec2(0.5), 4.0, 1.0, gT * 1.5);"]),
 ("ChainWaveDrosteHex", "a shear wave, a Droste zoom and a six-fold mirror lattice in sequence",
  [CT, "uv = tWave(uv, 6.0, 0.02 + 0.04 * gSpread, gT * 3.0);", "uv = tDroste(uv, ct, 2.5, gT);", M, "uv = tHex(uv, 2.0);"]),
]
TEMPLATE = """//@doc
 * @brief {NAME}: a chain of continuous transforms -- {DESC}.  Every stage is
 * continuous and the stages are joined by the photo's mirror repeat, so the
 * whole map is seamless; the photograph flows through it endlessly and never
 * repeats.  Rendered as the photo, as a lit relief of it, or as glowing edges
 * or as glowing contour lines (styleP blends through them).  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow through the chain (integrated, jump-free)
 *   audioPhase      -> the kaleidoscope turns (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the edges flare (light)
 *   audioMode       -> the tint: cool in minor, warm in major
 *   audioSwell      -> the relief light (slow)
 *
 * Knobs: styleP (photo / relief / glowing edges / contour lines), speedP (flow speed), detailP (texture sharpness), hueP.
//@params styleP speedP detailP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gSpread;
vec2 chain(vec2 p)
{{
    vec2 uv = p * 0.5 + 0.5;
{CHAIN}
    return uv;
}}

void main()
{{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    vec2 grad;
    vec3 ph = imgChain(p, 1.0 - 1.2 * clamp(detailP, 0.0, 1.0), grad);
    float m = luma(ph);
    vec3 photo = max((ph - m) * 1.4 + m, 0.0);
    // Relief: the chain's photo lit from a slowly circling light.
    float la = 0.1 * sceneTime;
    float relief = clamp(0.5 + dot(grad, vec2(cos(la), sin(la))) * 5.0, 0.0, 1.0);
    vec3 reliefC = photo * (0.3 + 1.2 * relief) + vec3(1.0) * pow(relief, 6.0) * (0.1 + 0.3 * swell);
    // Glowing edges: gradient magnitude as neon in the photo's colour.
    float edge = smoothstep(0.02, 0.25, length(grad));
    vec3 neon = glowColour(ph, p, hueP * 0.159) * edge * (1.2 + 1.2 * kick) + photo * 0.06;
    // Isolines of the chain's luma: glowing contour lines.
    float xi = m * 12.0;
    float pxi = fwidth(xi) + 1e-4;
    float iso = smoothstep(pxi * 1.5, 0.0, abs(fract(xi) - 0.5) - 0.5 + pxi * 1.5);
    vec3 isoC = glowColour(ph, p, hueP * 0.159) * iso * (1.0 + kick) + photo * 0.08;
    float st = clamp(styleP, 0.0, 1.0) * 3.0;               // 0 photo, 1 relief, 2 edges, 3 isolines
    vec3 col = mix(photo, reliefC, smoothstep(0.0, 1.0, st));
    col = mix(col, neon, smoothstep(1.0, 2.0, st));
    col = mix(col, isoC, smoothstep(2.0, 3.0, st));
    col *= mix(vec3(0.9, 0.97, 1.08), vec3(1.08, 0.98, 0.9), mode);
    col += glowColour(ph, p, hueP * 0.159) * edge * kick * 0.3 * (1.0 - smoothstep(1.0, 2.0, st));
    finish(col);
}}
"""
import sys
for name, desc, lines in (SPECS2 if '2' in sys.argv[1:] else SPECS + SPECS2 if 'all' in sys.argv[1:] else SPECS):
    body = "\n".join("    " + l for l in lines)
    io.open(os.path.join(SP, "src", name + ".glsl"), "w", encoding="utf-8").write(
        TEMPLATE.format(NAME=name.upper(), DESC=desc, CHAIN=body))
    print(name)
