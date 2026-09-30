# -*- coding: utf-8 -*-
"""One-off patch (30.09.): ChainLab2D's walk is steered by the app when it can
(uniforms walkA..walkD, walkS, walkHost -- EffectShader::stepChainWalk), and
the classes of every stage are ordered calm..energetic so the music's energy
picks the region.  Without the app (editor) the hash walk stays."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
f = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(f, encoding="utf-8").read()

# 1. energy order: the first line of every stage function maps the class
#    position (calm..energetic) to the transform.
ORD = {"A": "int[11](5, 4, 9, 1, 6, 10, 7, 8, 3, 0, 2)",   # polar, Droste, Poincare, spiral, exp, bipolar, sin, inversion, Moebius, kaleidoscope, tunnel
       "B": "int[6](0, 5, 3, 1, 2, 4)",                      # none, mirror line, p4m, kaleidoscope, p6m, fold
       "C": "int[8](0, 5, 7, 1, 4, 3, 6, 2)",                # none, lens, Joukowski, spiral, square, inversion, kaleidoscope, tunnel
       "D": "int[6](0, 5, 2, 1, 4, 3)"}                      # none, turning, wave, twirl, warp, ripple
head = ("// The classes of every stage in order of energy (calm .. energetic): a knob\n"
        "// value, rolled or walked, picks a position on that scale, so the music's\n"
        "// energy can choose the region (EffectShader::stepChainWalk).\n")
for X, o in ORD.items():
    head += "const int ORD_%s[%s] = %s;\n" % (X, o.split("(")[0][4:-1], o)
head += "const int ORD_S[5] = int[5](0, 1, 3, 4, 2);   // photo, relief, contours, flow, glowing edges\n"
head += ("// The app's walk: per stage (shown knob value, target, fade 0..1); walkHost = 1\n"
         "// when the app steers (otherwise the hash walk below runs, e.g. in the editor).\n"
         "uniform vec3 walkA, walkB, walkC, walkD, walkS;\nuniform float walkHost;\n\n")
a = s.index("// Stage A: a global map.")
s = s[:a] + head + s[a:]
for X in "ABCD":
    sig = "vec2 stage%sk(vec2 uv, int k, float v)\n{\n" % X
    assert s.count(sig) == 1, X
    s = s.replace(sig, sig + "    k = ORD_%s[k];\n" % X)

# 2. the wrappers take the app's walk when it steers
for X, IDX, N in [("A", 1, 11), ("B", 2, 6), ("C", 3, 8), ("D", 4, 6)]:
    old = "    if (!walks(%d)) return stage%sk(uv, k0, v0);\n" % (IDX, X)
    assert s.count(old) == 1, X
    new = old + ("    if (walkHost > 0.5 && walkAll()) {\n"
                 "        float f = smoothstep(0.0, 1.0, walk%(X)s.z);\n"
                 "        int j0 = pickStage(walk%(X)s.x, %(N)d), j1 = pickStage(walk%(X)s.y, %(N)d);\n"
                 "        if (f <= 0.0) return stage%(X)sk(uv, j0, subVar(walk%(X)s.x, %(N)d));\n"
                 "        return morphMix(stage%(X)sk(uv, j0, subVar(walk%(X)s.x, %(N)d)), stage%(X)sk(uv, j1, subVar(walk%(X)s.y, %(N)d)), f);\n"
                 "    }\n") % dict(X=X, N=N)
    s = s.replace(old, new)

# 3. the look: app walk, and the energy order for every path
old = """    s0 = pickStage(styleP, 5); s1 = s0;
    if (walkAll()) {"""
assert s.count(old) == 1
new = """    s0 = pickStage(styleP, 5); s1 = s0;
    if (walkHost > 0.5 && walkAll()) {
        s0 = pickStage(walkS.x, 5); s1 = pickStage(walkS.y, 5);
        sf = smoothstep(0.0, 1.0, walkS.z);
    } else if (walkAll()) {"""
s = s.replace(old, new)
old = "    vec3 col = mix(looks[s0], looks[s1], sf);\n"
assert s.count(old) == 1
s = s.replace(old, "    s0 = ORD_S[s0]; s1 = ORD_S[s1];                            // position on the calm..energetic scale -> look\n" + old)
old = "    if (s0 == 4 || (s1 == 4 && sf > 0.0)) {"
assert s.count(old) == 1
s = s.replace(old, "    if (ORD_S[s0] == 4 || (ORD_S[s1] == 4 && sf > 0.0)) {")
io.open(f, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
