# -*- coding: utf-8 -*-
"""One-off patch (30.09., literature round): stage-A classes 14 Farris
wallpaper, 15 hyperbolic band, 16 spiral Droste; ChainLab3D: space 7
(4D-rotated lattice), cores 7 (icosahedral KIFS) and 8 (polyhedral kaleidoscope)."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

def rw(path, fn):
    p = os.path.join(SP, path)
    s = io.open(p, encoding="utf-8").read()
    s = fn(s)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)

def ifchain(name, vals, note):
    return "int %s(int i) { %s return %d; }   // %s" % (
        name, " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])), vals[-1], note)

def lab2(s):
    i = s.index("int orda(int i)"); j = s.index("\n", i)
    s = s[:i] + ifchain("orda", [11, 5, 14, 4, 16, 9, 15, 1, 12, 6, 10, 7, 8, 3, 13, 0, 2],
                        "11 none, 14 Farris, 16 spiral Droste, 15 hyperbolic band") + s[j:]
    old = "    k = orda(k);\n"
    s = s.replace(old, old +
        "    if (k == 14) return tFarris(uv, gCw, int(floor(v * 3.99)), 1.5 + gSpread, gT * 1.5);\n"
        "    if (k == 15) {\n"
        "        int j = int(floor(v * 3.99));\n"
        "        vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : j == 2 ? vec2(4.0, 5.0) : vec2(6.0, 4.0);\n"
        "        return tHyperBand(uv, gCt, pq.x, pq.y, 0.8 + 0.4 * v, gT * 1.2);\n    }\n"
        "    if (k == 16) return tDrosteSpiral(uv, gCt, 4.0 + 12.0 * v, gT * 0.6);\n", 1)
    for pat in ["chainAP, 14)", "walkA.x, 14)", "walkA.y, 14)"]:
        assert pat in s, pat
        s = s.replace(pat, pat.replace("14)", "17)"))
    s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, 14, 1\.3", lambda m: m.group(0).replace(", 14, ", ", 17, "), s)
    s = s.replace("rotating Riemann sphere, loxodromic stream)",
                  "rotating Riemann sphere, loxodromic stream, Farris wallpaper\n * functions, the hyperbolic band, Escher's spiral Droste)")
    return s

def lab3(s):
    i = s.index("int ordsp(int i)"); j = s.index("\n", i)
    s = s[:i] + ifchain("ordsp", [0, 3, 6, 7, 4, 2, 5, 1],
                        "lattice, octahedral lattice, hexagons, 4D-rotated lattice, turning, twisted, helix, polar ring tunnel") + s[j:]
    i = s.index("int ordco(int i)"); j = s.index("\n", i)
    s = s[:i] + ifchain("ordco", [0, 4, 8, 3, 6, 1, 7, 2, 5],
                        "none, plane folds, polyhedral kaleidoscope, sphere-inversion box, Kleinian, tetra KIFS, icosa KIFS, octa KIFS, Menger") + s[j:]
    for a, b in [("int ks = ordsp(pickStage(xs, 7)); float vs = subVar(xs, 7);", "int ks = ordsp(pickStage(xs, 8)); float vs = subVar(xs, 8);"),
                 ("int kc = ordco(pickStage(xc, 7)); float vc = subVar(xc, 7);", "int kc = ordco(pickStage(xc, 9)); float vc = subVar(xc, 9);")]:
        assert a in s, a
        s = s.replace(a, b)
    old = "    else q = zRepeat(fHexXY(p, 2.2 + 0.6 * vs), 1.2);"
    assert old in s
    s = s.replace(old, "    else if (ks == 6) q = zRepeat(fHexXY(p, 2.2 + 0.6 * vs), 1.2);\n"
                       "    else q = f4DLattice(p, 1.3 + 0.3 * vs, 0.35 * sin(gT * 0.04) + gRot * 0.3, 0.25 * sin(gT * 0.031 + 1.0), 0.6 * sin(gT * 0.023));   // 4D-rotated lattice")
    old = "    gP = q;\n    float th = 1.0 + 0.3 * gSpread;"
    assert s.count(old) == 1
    s = s.replace(old, '''    else if (kc == 7) {
        // icosahedral KIFS (Knighty): the icosahedral fold, a turn, scale 2
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.4 + 0.3 * vc); q = fScale(q, 1.9, vec3(0.55, 0.3, 0.9)); }
        bs = 1.2;
    } else if (kc == 8) {
        // polyhedral kaleidoscope: one polyhedral fold (tetra / octa / icosa by the
        // sub-variant) around each lattice cell, the body pushed off the axis
        q = fPoly(q, 3.0 + floor(vc * 2.99)); q.z -= 0.35;
        bs = 0.7;
    }
''' + old)
    s = s.replace("turning lattice, helix, hexagonal lattice)", "turning lattice, helix, hexagonal lattice, a lattice turned in 4D)")
    s = s.replace("Menger sponge,\n * Kleinian fold)", "Menger sponge,\n * Kleinian fold, icosahedral KIFS, polyhedral kaleidoscope)")
    return s

rw(os.path.join("src", "ChainLab2D.glsl"), lab2)
rw("make_chainlab3d.py", lab3)

def tools(s):
    s = s.replace('"chainAP": [None, "polar unwrap", "Droste zoom",',
                  '"chainAP": [None, "polar unwrap", "Farris wallpaper", "Droste zoom", "Escher spiral Droste",')
    s = s.replace('"hyperbolic Poincare tiling", "log-polar spiral",', '"hyperbolic Poincare tiling", "hyperbolic band", "log-polar spiral",')
    s = s.replace('"spaceP": ["mirrored lattice", "polar ring tunnel", "twisted lattice", "octahedral lattice", "turning lattice"],',
                  '"spaceP": ["mirrored lattice", "octahedral lattice", "hexagonal lattice", "4D-rotated lattice", "turning lattice", "twisted lattice", "helix", "polar ring tunnel"],')
    s = s.replace('"coreP": ["no fold core", "tetrahedral KIFS", "octahedral KIFS", "sphere-inversion box fold", "plane folds", "Menger sponge"],',
                  '"coreP": ["no fold core", "plane folds", "polyhedral kaleidoscope", "sphere-inversion box fold", "Kleinian fold", "tetrahedral KIFS", "icosahedral KIFS", "octahedral KIFS", "Menger sponge"],')
    s = s.replace('CLASSES["spaceP"][pick(v["spaceP"], 5)]', 'CLASSES["spaceP"][pick(v["spaceP"], 8)]')
    s = s.replace('CLASSES["coreP"][pick(v["coreP"], 6)]', 'CLASSES["coreP"][pick(v["coreP"], 9)]')
    s = s.replace('"bodyP": ["blocks", "balls", "tori", "gyroid membrane", "crosses", "Schwarz P surface", "Schwarz D surface"],',
                  '"bodyP": ["balls", "tori", "gyroid membrane", "Schwarz P surface", "Schwarz D surface", "blocks", "crosses"],')
    return s
rw("promote_likes.py", tools)
rw("lab_audit.py", lambda s: s.replace('"chainAP": 14,', '"chainAP": 17,').replace('"spaceP": 5, "coreP": 6,', '"spaceP": 8, "coreP": 9,'))
print("ok")
