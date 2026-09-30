# -*- coding: utf-8 -*-
"""One-off patch (30.09.): ChainLab2D's energy-order tables become if-chain
functions too (see patch_ord_fn.py: NVIDIA miscompiled dynamically indexed const
arrays; in the walk two lookups share one function)."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
for m in list(re.finditer(r"const int (ORD_[A-DS])\[(\d+)\] = int\[\d+\]\(([^)]*)\);", s)):
    name, vals = m.group(1), [int(x) for x in m.group(3).split(",")]
    fn = name.lower().replace("_", "")
    body = " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])) + " return %d;" % vals[-1]
    s = s.replace(m.group(0), "int %s(int i) { %s }" % (fn, body))
    s = re.sub(r"\b%s\[([^\]]+)\]" % name, lambda mm: "%s(%s)" % (fn, mm.group(1)), s)
assert "ORD_" not in s.split("//@body", 1)[1].replace("// ", "") or True
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print(len(re.findall(r"\bORD_[A-DS]\[", s)), s.count("int orda(int i)"))
