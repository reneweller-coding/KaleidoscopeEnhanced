# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the loxodromic stream as stage-A class 13, placed
after the Moebius stream on the energy scale."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
old = ("int orda(int i) { if (i == 0) return 11; if (i == 1) return 5; if (i == 2) return 4; if (i == 3) return 9; "
       "if (i == 4) return 1; if (i == 5) return 12; if (i == 6) return 6; if (i == 7) return 10; if (i == 8) return 7; "
       "if (i == 9) return 8; if (i == 10) return 3; if (i == 11) return 0; return 2; }")
assert s.count(old) == 1
vals = [11, 5, 4, 9, 1, 12, 6, 10, 7, 8, 3, 13, 0, 2]
s = s.replace(old, "int orda(int i) { " + " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])) + " return %d; }" % vals[-1])
old = "    k = orda(k);\n"
assert s.count(old) == 1
s = s.replace(old, old + "    if (k == 13) {\n"
              "        vec2 pa = gCw + 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3)), pb = gCw - 0.25 * vec2(cos(gT * 0.3), sin(gT * 0.3));\n"
              "        return tLoxo(uv, pa, pb, 1.0 + floor(v * 2.99), gT * 2.0);\n    }\n")
for pat in ["chainAP, 13)", "walkA.x, 13)", "walkA.y, 13)"]:
    assert pat in s, pat
    s = s.replace(pat, pat.replace("13)", "14)"))
s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, 13, 1\.3", lambda m: m.group(0).replace(", 13, ", ", 14, "), s)
s = s.replace("bipolar\n * stream, rotating Riemann sphere)", "bipolar\n * stream, rotating Riemann sphere, loxodromic stream)")
io.open(p, "w", encoding="utf-8", newline="\n").write(s)

q = os.path.join(SP, "promote_likes.py")
t = io.open(q, encoding="utf-8").read()
old = '"Moebius stream", "kaleidoscope", "tunnel"],'
assert old in t
t = t.replace(old, '"Moebius stream", "loxodromic stream", "kaleidoscope", "tunnel"],')
io.open(q, "w", encoding="utf-8", newline="\n").write(t)
q = os.path.join(SP, "lab_audit.py")
t = io.open(q, encoding="utf-8").read().replace('"chainAP": 13,', '"chainAP": 14,')
io.open(q, "w", encoding="utf-8", newline="\n").write(t)
print("ok", s.count(", 14)"))
