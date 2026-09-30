# -*- coding: utf-8 -*-
"""One-off patch (30.09.), follow-up: (1) gIdW is declared inside the part the
3D/tunnel labs copy; (2) the weak classes (mirror line, lens, turning, wave:
alone they leave the photo nearly bare) count as 'none' for the never-empty rule."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()

decl = "float gIdW = 1.0;   // how much of the chain is 'none' (product over the stages)\n"
anchor = "// The stage index and a sub-variant 0..1 from one rolled knob.\n"
assert s.count(decl) == 1 and s.count(anchor) == 1
s = s.replace(decl, "")
s = s.replace(anchor, anchor + "float gIdW = 1.0;   // how much of the chain is 'none' or too weak to carry it (product over the stages)\n")

# weak = position on the energy scale up to: A 0 (none), B 1 (mirror line), C 1 (lens), D 2 (turning, wave)
WEAK = {"A": 0, "B": 1, "C": 1, "D": 2}
for X, w in WEAK.items():
    a = s.index("vec2 stage%s(vec2 uv)\n{" % X)
    b = s.index("\n}\n", a)
    blk = s[a:b]
    n = blk.count("== 0 ?")
    assert n == 5, (X, n)
    blk = blk.replace("== 0 ?", "<= %d ?" % w)
    s = s[:a] + blk + s[b:]
s = s.replace("    // Never an empty chain: as the stages together approach 'none' (gIdW), a\n",
              "    // Never an empty chain: as the stages together approach 'none' -- or only\n"
              "    // weak classes that leave the photo nearly bare (gIdW) -- a\n")
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
