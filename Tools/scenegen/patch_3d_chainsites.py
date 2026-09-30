# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the 3D lab's colour chain is inlined at every call
site; measured, the chain -- not the 3D world -- made the lab's cold compile
jump from 3.8 to 11 s.  (1) The colour chain keeps its rolled order but does
not walk it (the order fade doubled the whole chain); (2) photo and solid
texture share one triplanar projection (3 chain sites instead of 6)."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SP, "make_chainlab3d.py")
s = io.open(p, encoding="utf-8").read()
old = 'STAGES = re.sub(r"\\bgT\\b", "gTC", lab2[a:b])      # the colour chain flows at the 2D lab\'s calm pace\n'
assert s.count(old) == 1, "stages"
s = s.replace(old, old + '''# The colour chain keeps its rolled order but does not walk it: the order fade
# evaluates the whole chain twice, and the chain is inlined at every one of the
# lab's call sites -- it tripled the cold compile time.  Without the walkO
# uniform the app never starts an order walk here (EffectShader::startWalk).
_ow = "    if (walkHost > 0.5 && walkAll()) { o0 = pickStage(walkO.x, 24); o1 = pickStage(walkO.y, 24); f = smoothstep(0.0, 1.0, walkO.z); }\\n"
assert STAGES.count(_ow) == 1
STAGES = STAGES.replace(_ow, "").replace("uniform vec3 walkO;\\n", "")
''')
old = '''vec3 colour3(vec3 q, vec3 n, float lod, float pal)
{
    return solidP >= 0.5 ? solidChain3(q, n, lod, pal) : photoChain3(q, n, lod, pal);
}'''
assert s.count(old) == 1, "colour3"
s = s.replace(old, '''vec3 colour3(vec3 q, vec3 n, float lod, float pal)
{
    // One triplanar projection for both looks: the solid texture is the same
    // three planes with the depth along each normal as the chain's time (the
    // photo look has depth 0) -- three chain call sites instead of six.
    float sd = solidP >= 0.5 ? 1.0 : 0.0;
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return chainSlice(q.yz * 0.35 + 0.5, q.x * sd, lod, pal) * w.x + chainSlice(q.zx * 0.35 + 0.5, q.y * sd, lod, pal) * w.y
         + chainSlice(q.xy * 0.35 + 0.5, q.z * sd, lod, pal) * w.z;
}''')
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
