# -*- coding: utf-8 -*-
"""One-off patch (30.09.): ChainLab3D's energy-order tables become functions.
The NVIDIA compiler returned entry 0 of ORD_BO for any index inside fieldK
(three dynamically indexed const arrays in one function; the same lookup in
main was right) -- the body never changed.  An if-chain cannot be miscompiled
that way."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SP, "make_chainlab3d.py")
s = io.open(p, encoding="utf-8").read()
TABLES = {"ORD_SP": ([0, 3, 6, 4, 2, 5, 1], "lattice, octahedral lattice, hexagons, turning, twisted, helix, polar ring tunnel"),
          "ORD_CO": ([0, 4, 3, 6, 1, 2, 5], "none, plane folds, sphere-inversion box, Kleinian, tetra KIFS, octa KIFS, Menger"),
          "ORD_BO": ([1, 2, 3, 5, 6, 0, 4], "balls, tori, gyroid, Schwarz P, Schwarz D, blocks, crosses")}
for name, (vals, note) in TABLES.items():
    old = "const int %s[7] = int[7](%s);" % (name, ", ".join(map(str, vals)))
    i = s.index(old)
    j = s.index("\n", i)
    body = " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])) + " return %d;" % vals[-1]
    fn = "int %s(int i) { %s }   // %s" % (name.lower().replace("_", ""), body, note)
    s = s[:i] + fn + s[j:]
    s = s.replace("%s[pickStage(" % name, "%s(pickStage(" % name.lower().replace("_", ""))
s = s.replace("ordsp(pickStage(xs, 7)];", "ordsp(pickStage(xs, 7));")
s = s.replace("ordco(pickStage(xc, 7)];", "ordco(pickStage(xc, 7));")
s = s.replace("ordbo(pickStage(xb, 7)];", "ordbo(pickStage(xb, 7));")
s = s.replace("// The structure classes in order of energy (calm .. energetic), as the chain's:",
              "// The structure classes in order of energy (calm .. energetic), as the chain's\n"
              "// (if-chains, not const arrays: NVIDIA returned entry 0 for three arrays\n"
              "// indexed in one function -- the body never changed):")
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print(s.count("ordbo(pickStage(xb, 7))"), s.count("ORD_BO"))
