# -*- coding: utf-8 -*-
"""One-off patch (30.09.): a chain is never empty.  Every stage reports how much
'none' it shows (a share while fading), gIdW is their product; as it rises a calm
six-fold kaleidoscope fades in -- continuously, so a stage walking into 'none'
while the others are empty never makes the picture jump to the bare photo."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

def rw(path, fn):
    p = os.path.join(SP, path)
    s = io.open(p, encoding="utf-8").read()
    s = fn(s)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)

FALLBACK = ("    // Never an empty chain: as the stages together approach 'none' (gIdW), a\n"
            "    // calm six-fold kaleidoscope fades in -- the bare photo is never shown.\n"
            "    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);\n")

def lab2(s):
    # the share of 'none' each stage shows
    n = 0
    s, k = re.subn(r"    if \(!walks\((\d)\)\) return stage([A-D])k\(uv, k0, v0\);\n",
                   lambda m: "    if (!walks(%s)) { gIdW *= (k0 == 0 ? 1.0 : 0.0); return stage%sk(uv, k0, v0); }\n" % (m.group(1), m.group(2)), s)
    n += k
    s, k = re.subn(r"(        int j0 = pickStage\(walk[A-D]\.x, \d+\), j1 = pickStage\(walk[A-D]\.y, \d+\);\n)",
                   r"\1        gIdW *= (j0 == 0 ? 1.0 - f : 0.0) + (j1 == 0 ? f : 0.0);\n", s)
    n += k
    s, k = re.subn(r"(    float f = walkFade\(kf\);\n)",
                   r"\1    gIdW *= (i0 == 0 ? 1.0 - f : 0.0) + (i1 == 0 ? f : 0.0);\n", s)
    n += k
    assert n == 12, n
    # the global, declared inside the part the 3D/tunnel labs copy
    anchor = "// The stage index and a sub-variant"
    assert s.count(anchor) == 1
    s = s.replace(anchor, "float gIdW = 1.0;   // how much of the chain is 'none' (product over the stages)\n" + anchor)
    old = "    uv = stageD(uv);\n    return uv;\n}\n"
    assert s.count(old) == 1
    s = s.replace(old, "    uv = stageD(uv);\n" + FALLBACK + "    return uv;\n}\n")
    old = "    vec2 uv = p * 0.5 + 0.5;\n    uv = stageA(uv);\n"
    assert s.count(old) == 1
    s = s.replace(old, "    vec2 uv = p * 0.5 + 0.5;\n    gIdW = 1.0;\n    uv = stageA(uv);\n")
    return s

def other(s):
    old = "    uv = stageA(uv);\n    uv = mirrorUV(uv);\n"
    assert s.count(old) == 1
    s = s.replace(old, "    gIdW = 1.0;\n" + old)
    old = "    return stageD(uv);\n}\n"
    assert s.count(old) == 1
    return s.replace(old, "    uv = stageD(uv);\n" + FALLBACK + "    return uv;\n}\n")

rw(os.path.join("src", "ChainLab2D.glsl"), lab2)
rw("make_chainlab3d.py", other)
rw("make_chainlabtunnel.py", other)
print("ok")
