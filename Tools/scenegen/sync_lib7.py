# -*- coding: utf-8 -*-
"""Copies chain_lib7.glsl (the round-7 transforms) into gen.py's CHAIN_LIB, replacing the earlier copy."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
g = io.open(os.path.join(SP, "gen.py"), encoding="utf-8", newline="").read()
lib = io.open(os.path.join(SP, "chain_lib7.glsl"), encoding="utf-8", newline="").read()
a = g.index("// ---- round 7 (23.10.2026)")
b = g.index("// ---- idea round 4 ----")
io.open(os.path.join(SP, "gen.py"), "w", encoding="utf-8", newline="").write(g[:a] + lib + g[b:])
print("synced")
