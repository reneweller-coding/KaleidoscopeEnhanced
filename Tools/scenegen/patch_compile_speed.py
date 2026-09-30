# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the chain labs compiled for 3.5..12 s without the
driver cache -- the app's background warm-up then froze the picture (the
reported stutters when a chain scene faded in).  Cause: every call site of
chain() got its own inlined copy (5 for the mip footprint, 1 for the colour
field, 13 in the flow style, x 4 positions x 4 stages for the order, x 2 while
the order fades).  Now:
  * imgChain evaluates the chain ONCE; footprint and luma gradient come from
    screen derivatives of the mirrored coordinates (continuous over all seams);
    the colour field and the LIC flow reuse them (the flow linearised);
  * loops the compiler must not unroll (the count comes from loopN(), which
    depends on a uniform) hold the order, the two orders of an order fade, the
    three triplanar planes and the tunnel's normal/footprint samples -- one
    inlined copy each instead of many."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

def rw(path, pairs):
    p = os.path.join(SP, path)
    s = io.open(p, encoding="utf-8").read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:70])
        s = s.replace(old, new)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)
    print(path, "ok")

g = os.path.join(SP, "gen.py")
s = io.open(g, encoding="utf-8").read()
i = s.index("vec3 imgChain(vec2 p, float bias, out vec2 grad)\n{")
j = s.index("\n}\n", i) + 3
s = s[:i] + '''// A loop count the compiler cannot see through (it depends on a uniform), so
// the loop is NOT unrolled and its body -- a whole chain -- is inlined once.
int loopN(int n) { return n + int(min(interpolation, 0.0)); }
vec2 gChainM, gChainDx, gChainDy;    // mirrored chain coordinate of this pixel and its derivatives per pixel
vec3 imgChain(vec2 p, float bias, out vec2 grad)
{
    vec2 c0 = chain(p);
    vec2 m0 = mirrorUV(c0);
    // Footprint from the screen derivatives of the MIRRORED coordinate: it is
    // continuous over every seam of the chain, so one evaluation suffices
    // (it used to be five, each an inlined copy of the whole chain).
    vec2 dx = dFdx(m0), dy = dFdy(m0);
    gChainM = m0; gChainDx = dx; gChainDy = dy;
    float lod = clamp(log2(max(max(length(dx), length(dy)) * 1024.0, 1.0)) + bias, 0.0, 9.0);
    vec3 col = imgLod(c0, lod);
    float l = luma(col);
    grad = vec2(dFdx(l), dFdy(l)) * 1.5;                         // luma change per 1.5 px, as before
    return col;
}
''' + s[j:]
io.open(g, "w", encoding="utf-8", newline="\n").write(s)
print("gen.py ok")

rw(os.path.join("src", "ChainLab2D.glsl"), [
    ("    vec2 cm = mirrorUV(chain(p));\n", "    vec2 cm = gChainM;                                          // the one chain evaluation (imgChain)\n"),
    ("            float nz = noise2(mirrorUV(chain(p + fd * fk * hpx)) * 70.0);",
     "            float nz = noise2((gChainM + (gChainDx * fd.x + gChainDy * fd.y) * fk * 3.0) * 70.0);   // the chain linearised along the flow"),
    ("    for (int pos = 0; pos < 4; ++pos) {\n        uv = applyStage((code >> (2 * pos)) & 3, uv);\n        if (pos < 3) uv = mirrorUV(uv);\n    }\n    return uv;",
     "    int n = loopN(4);\n    for (int pos = 0; pos < n; ++pos) {                     // not unrolled: the four stages are inlined once\n        uv = applyStage((code >> (2 * pos)) & 3, uv);\n        if (pos < 3) uv = mirrorUV(uv);\n    }\n    return uv;"),
    ('''    gIdW = 1.0;
    vec2 a = runOrder(uv, permCode(o0));
    if (f > 0.0 && o1 != o0) {
        float gi = gIdW;
        gIdW = 1.0;
        vec2 b = runOrder(uv, permCode(o1));
        gIdW = mix(gi, gIdW, f);
        a = morphMix(a, b, f);
    }''',
     '''    // One loop over the one or two orders: the chain is inlined once.
    int nOrd = (f > 0.0 && o1 != o0) ? loopN(2) : loopN(1);
    vec2 a = uv, b = uv;
    float g0 = 1.0, g1 = 1.0;
    for (int k = 0; k < nOrd; ++k) {
        gIdW = 1.0;
        vec2 r = runOrder(uv, permCode(k == 0 ? o0 : o1));
        if (k == 0) { a = r; g0 = gIdW; } else { b = r; g1 = gIdW; }
    }
    gIdW = g0;
    if (nOrd > 1) { gIdW = mix(g0, g1, f); a = morphMix(a, b, f); }'''),
])
print("done")
