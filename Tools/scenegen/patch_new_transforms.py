# -*- coding: utf-8 -*-
"""One-off patch (30.09.): new classes -- the rotating Riemann sphere (stage A),
the blossom (stage C); in ChainLab3D the solid chain texture (time as the third
axis: the chain's slices along the folded depth) and the Schwarz P / D bodies."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

def rw(path, fn):
    p = os.path.join(SP, path)
    s = io.open(p, encoding="utf-8").read()
    s = fn(s)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)

def lab2(s):
    # energy order: Riemann after the spiral (A), blossom after the lens (C)
    old = "const int ORD_A[12] = int[12](11, 5, 4, 9, 1, 6, 10, 7, 8, 3, 0, 2);"
    assert s.count(old) == 1
    s = s.replace(old, "const int ORD_A[13] = int[13](11, 5, 4, 9, 1, 12, 6, 10, 7, 8, 3, 0, 2);")
    old = "const int ORD_C[8] = int[8](0, 5, 7, 1, 4, 3, 6, 2);"
    assert s.count(old) == 1
    s = s.replace(old, "const int ORD_C[9] = int[9](0, 5, 8, 7, 1, 4, 3, 6, 2);")
    old = "    if (k == 11) return uv;                                  // none: the chain starts at stage B\n"
    assert s.count(old) == 1
    s = s.replace(old, old + "    if (k == 12) return tRiemann(uv, gCw, 2.0 + 1.5 * v, 0.7 * sin(gT * 0.4) + v * 3.0, gT * 0.8 + gRot);\n")
    old = "    k = ORD_C[k];\n"
    assert s.count(old) == 1
    s = s.replace(old, old + "    if (k == 8) return tPetal(uv, gCw, 3.0 + floor(v * 5.99), 0.15 + 0.2 * gSpread, gT * 2.0);\n")
    # class counts: A 12 -> 13, C 8 -> 9 (knobs, app walk, hash walk)
    for knob, walk, n0, n1 in [("chainAP", "walkA", 12, 13), ("chainCP", "walkC", 8, 9)]:
        for pat in ["%s, %d)" % (knob, n0), "%s.x, %d)" % (walk, n0), "%s.y, %d)" % (walk, n0)]:
            assert pat in s, pat
            s = s.replace(pat, pat.replace(", %d)" % n0, ", %d)" % n1))
    s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, 12, 1\.3", lambda m: m.group(0).replace(", 12, ", ", 13, "), s)
    s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, 8, 4\.7", lambda m: m.group(0).replace(", 8, ", ", 9, "), s)
    s = s.replace("exponential, sine, inversion, hyperbolic Poincare tiling, bipolar\n * stream)",
                  "exponential, sine, inversion, hyperbolic Poincare tiling, bipolar\n * stream, rotating Riemann sphere)")
    s = s.replace("inversion, square, lens, kaleidoscope, Joukowski)", "inversion, square, lens, kaleidoscope, Joukowski, blossom)")
    return s

def lab3(s):
    # Schwarz P / D bodies
    old = "    int kb = pickStage(bodyP, 5);  float vb = subVar(bodyP, 5);"
    assert s.count(old) == 1
    s = s.replace(old, "    int kb = pickStage(bodyP, 7);  float vb = subVar(bodyP, 7);")
    old = "    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th)"
    assert s.count(old) == 1
    s = s.replace(old, "    else if (kb == 5) { vec3 w = q * (3.0 / bs); d = (abs(cos(w.x) + cos(w.y) + cos(w.z)) - 0.35 - 0.3 * gSpread) / 2.2 * bs / 3.0; }   // Schwarz P\n"
                       "    else if (kb == 6) { vec3 w = q * (3.0 / bs); vec3 sn = sin(w), cs = cos(w);                     // Schwarz D\n"
                       "        d = (abs(sn.x * sn.y * sn.z + sn.x * cs.y * cs.z + cs.x * sn.y * cs.z + cs.x * cs.y * sn.z) - 0.25 - 0.2 * gSpread) / 2.2 * bs / 3.0; }\n"
                       + old)
    s = s.replace("end body (block, ball, torus, gyroid\n * membrane, cross)", "end body (block, ball, torus, gyroid\n * membrane, cross, Schwarz P and D minimal surfaces)")
    # solid chain texture
    s = s.replace("//@params spaceP coreP bodyP chainAP chainBP chainCP chainDP morphP styleP",
                  "//@params spaceP coreP bodyP solidP chainAP chainBP chainCP chainDP morphP styleP")
    old = 'io.open(os.path.join(SP, "src", "ChainLab3D.glsl"), "w", encoding="utf-8").write(HEAD + STAGES + FIELD + MAIN)'
    assert s.count(old) == 1
    s = s.replace(old, '''SOLID = r"""
// The solid chain texture: time as the third axis.  A 2D chain whose
// parameters run with time IS a volume (x, y, t); read with the folded depth
// as t, every body is cut from a block in which the chain evolves slice by
// slice -- no triplanar seams, and the real time keeps the block changing.
vec3 solidChain3(vec3 q, float lod, float pal)
{
    float tc = gTC, tr = gRot;
    gTC += 0.35 * q.z;
    gRot += 0.25 * q.z;
    vec3 c = chainPlane(q.xy * 0.35 + 0.5, lod, pal);
    gTC = tc; gRot = tr;
    return c;
}
vec3 colour3(vec3 q, vec3 n, float lod, float pal)
{
    return solidP >= 0.5 ? solidChain3(q, lod, pal) : photoChain3(q, n, lod, pal);
}
"""
MAIN = MAIN.replace("void main()", SOLID + "\\nvoid main()", 1)
MAIN = MAIN.replace("vec3 tex = photoChain3(fp, n, lod, ", "vec3 tex = colour3(fp, n, lod, ")
assert "colour3(fp" in MAIN
''' + old)
    s = s.replace(" * Knobs: spaceP / coreP / bodyP (the 3D chain, rolled per start), chainAP..chainDP",
                  " * Knobs: spaceP / coreP / bodyP (the 3D chain, rolled per start), solidP (the colour\n"
                  " * chain projected on three planes, or as a solid texture with the depth as its\n"
                  " * time axis), chainAP..chainDP")
    return s

rw(os.path.join("src", "ChainLab2D.glsl"), lab2)
rw("make_chainlab3d.py", lab3)

def tools(s):
    s = s.replace('"bodyP": ["blocks", "balls", "tori", "gyroid membrane", "crosses"],',
                  '"bodyP": ["blocks", "balls", "tori", "gyroid membrane", "crosses", "Schwarz P surface", "Schwarz D surface"],')
    s = s.replace('CLASSES["bodyP"][pick(v["bodyP"], 5)]', 'CLASSES["bodyP"][pick(v["bodyP"], 7)]')
    s = s.replace('"log-polar spiral", "complex exponential",', '"log-polar spiral", "rotating Riemann sphere", "complex exponential",')
    s = s.replace('"chainCP": [None, "lens", "Joukowski map",', '"chainCP": [None, "lens", "blossom", "Joukowski map",')
    s = s.replace('PIN = ["spaceP", "coreP", "bodyP",', 'PIN = ["spaceP", "coreP", "bodyP", "solidP",')
    return s
rw("promote_likes.py", tools)
rw("lab_audit.py", lambda s: s.replace('"chainAP": 12,', '"chainAP": 13,').replace('"chainCP": 8,', '"chainCP": 9,').replace('"bodyP": 5}', '"bodyP": 7}'))
print("ok")
