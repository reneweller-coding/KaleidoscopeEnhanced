# -*- coding: utf-8 -*-
"""One-off patch (30.09.): stage A gets the identity too (as B, C, D already
have), at the calm end of its energy scale -- chains of any length 0..4, and
calm music leans to short, simple chains by itself."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
f = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(f, encoding="utf-8").read()
old = "const int ORD_A[11] = int[11](5, 4, 9, 1, 6, 10, 7, 8, 3, 0, 2);"
assert s.count(old) == 1
s = s.replace(old, "const int ORD_A[12] = int[12](11, 5, 4, 9, 1, 6, 10, 7, 8, 3, 0, 2);   // 11 = none (identity)")
old = "    k = ORD_A[k];\n"
assert s.count(old) == 1
s = s.replace(old, old + "    if (k == 11) return uv;                                  // none: the chain starts at stage B\n")
n = s.count("chainAP, 11)") + s.count("walkA.x, 11)") + s.count("walkA.y, 11)")
s = s.replace("chainAP, 11)", "chainAP, 12)").replace("walkA.x, 11)", "walkA.x, 12)").replace("walkA.y, 11)", "walkA.y, 12)")
s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, 11, 1\.3", lambda m: m.group(0).replace(", 11, ", ", 12, "), s)
s = s.replace("rolls a new chain of four continuous transforms from four classes: a global\n * map (",
              "rolls a new chain of up to four continuous transforms from four classes (each\n * with 'none' at its calm end): a global map (")
io.open(f, "w", encoding="utf-8", newline="\n").write(s)
print("ok", n, s.count(", 12"))
