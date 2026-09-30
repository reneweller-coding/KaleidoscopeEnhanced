# -*- coding: utf-8 -*-
"""One-off patch (30.09., round 5): wire the new transforms into the labs."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

def ifchain(name, vals, note):
    return "int %s(int i) { %s return %d; }   // %s" % (
        name, " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])), vals[-1], note)

# Newton of any degree
g = os.path.join(SP, "gen.py")
s = io.open(g, encoding="utf-8").read()
anchor = "// Julia map: z -> z^2 + k a few times, k wandering near the Mandelbrot border."
assert s.count(anchor) == 1
s = s.replace(anchor, r'''// Newton's method for z^n = w (n = 3..5): n basins, fractal borders.
vec2 tNewtonN(vec2 uv, vec2 c, float steps, float n, float t)
{
    vec2 z = (uv - c) * 2.4, w = cexpi(t * 0.3);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        vec2 zn1 = vec2(1.0, 0.0);
        for (int k = 0; k < 4; ++k) { if (float(k) >= n - 1.0) break; zn1 = cmul(zn1, z); }
        z -= cdiv(cmul(zn1, z) - w, n * zn1);
    }
    return c + z * 0.4;
}
''' + anchor)
io.open(g, "w", encoding="utf-8", newline="\n").write(s)

p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
ORD = {"orda": [11, 5, 20, 39, 14, 26, 41, 25, 4, 16, 33, 9, 15, 28, 24, 1, 29, 34, 12, 42, 17, 27, 30, 19, 31, 6, 40, 18, 32, 10, 7, 21, 35, 8, 3, 13, 22, 23, 36, 37, 38, 0, 2],
       "ordb": [0, 5, 3, 1, 10, 8, 14, 15, 2, 7, 9, 11, 12, 13, 4, 6],
       "ordc": [0, 5, 12, 8, 9, 10, 11, 7, 1, 4, 3, 6, 2],
       "ordd": [0, 5, 8, 2, 13, 7, 10, 11, 1, 12, 6, 9, 14, 4, 3]}
for name, vals in ORD.items():
    i = s.index("int %s(int i)" % name); j = s.index("\n", i)
    s = s[:i] + ifchain(name, vals, "energy order, %d classes" % len(vals)) + s[j:]
s = s.replace("    k = orda(k);\n", "    k = orda(k);\n"
    "    if (k == 30) return tJacobiWall(uv, gCw, 2.0 + 2.0 * v, v < 0.5 ? 0 : 1, gT);\n"
    "    if (k == 31) return tHypFlow(uv, gCw, v * 3.0, gT * 0.8);\n"
    "    if (k == 32) return tPoles(uv, gCw, 2.0 + floor(v * 2.99), gT);\n"
    "    if (k == 33) return tBiDroste(uv, gCt, 0.2 + 0.1 * v, 2.5 + 2.0 * v, gT * 0.5);\n"
    "    if (k == 34) return tHypSpiral(uv, gCt, 0.08 + 0.06 * v, 1.0 + floor(v * 2.99), gT * 2.0);\n"
    "    if (k == 35) return tZeta(uv, gCw, 4.0 + floor(v * 3.99), gT * 2.0);\n"
    "    if (k == 36) return tMandel(uv, gCw, 3.0, gT);\n"
    "    if (k == 37) return tShip(uv, gCw, 3.0, gT);\n"
    "    if (k == 38) return tPhoenix(uv, gCw, 3.0, gT);\n"
    "    if (k == 39) return tParabCoords(uv, gCt, 6.0 + 6.0 * v, gT * 1.5);\n"
    "    if (k == 40) return tCardioid(uv, gCw, 1.5 + v, gT);\n"
    "    if (k == 41) return tSunflower(uv, gCt, 1.0 + floor(v * 3.99), 2.0 + floor(fract(v * 4.0) * 2.99), gT * 0.6);\n"
    "    if (k == 42) return tBreathSphere(uv, gCw, 2.0 + floor(v * 3.99), gT);\n", 1)
s = s.replace("    k = ordb(k);\n", "    k = ordb(k);\n"
    "    if (k == 10) return tCurvedKaleido(uv, gCw, sides(v), gRot, 0.4 * vec2(sin(gT * 0.3), cos(gT * 0.23)));\n"
    "    if (k == 11) return tLevy(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.3));\n"
    "    if (k == 12) return tPythagoras(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.4));\n"
    "    if (k == 13) return tVicsek(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));\n"
    "    if (k == 14) return tQuasiMirror(uv, gCw, 4.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));\n"
    "    if (k == 15) return tQuasiMirror(uv, gCw, 6.0, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3));\n", 1)
s = s.replace("    k = ordc(k);\n", "    k = ordc(k);\n"
    "    if (k == 11) return tCayley(uv, gCw, 2.0 + 2.0 * v);\n"
    "    if (k == 12) return tFisheye(uv, gCw, 0.6 + 0.8 * v + 0.2 * sin(gT * 0.3));\n", 1)
s = s.replace("    k = ordd(k);\n", "    k = ordd(k);\n"
    "    if (k == 9) return tKarman(uv, 2.0 + 2.0 * gSpread, gT * 2.0);\n"
    "    if (k == 10) return tCylinderFlow(uv, gCw, 1.0 + gSpread, 0.5 * sin(gT * 0.3));\n"
    "    if (k == 11) return tDipole(uv, gCw, 1.0 + gSpread, gT);\n"
    "    if (k == 12) return tVortexPair(uv, gCw, 2.0 + 2.0 * gSpread, gT);\n"
    "    if (k == 13) return tInterference(uv, 40.0 + 20.0 * v, 1.0 + gSpread, gT * 2.0);\n"
    "    if (k == 14) return tKelvinHelmholtz(uv, 1.0 + gSpread, gT);\n", 1)
a = "tNewton(uv, gCw, 2.0 + floor(v * 1.99), gT)"
assert a in s
s = s.replace(a, "tNewtonN(uv, gCw, 2.0 + floor(fract(v * 2.0) * 1.99), 3.0 + floor(v * 2.99), gT)")
a = "tFarris(uv, gCw, int(floor(v * 9.99)), 1.5 + gSpread, gT * 1.5)"
assert a in s
s = s.replace(a, "tFarris(uv, gCw, int(floor(v * 13.99)), 1.5 + gSpread, gT * 1.5)")
for knob, walk, salt, n0, n1 in [("chainAP", "walkA", "1.3", 30, 43), ("chainBP", "walkB", "2.9", 10, 16),
                                 ("chainCP", "walkC", "4.7", 11, 13), ("chainDP", "walkD", "6.1", 9, 15)]:
    for pat in ["%s, %d)" % (knob, n0), "%s.x, %d)" % (walk, n0), "%s.y, %d)" % (walk, n0)]:
        assert pat in s, pat
        s = s.replace(pat, pat.replace(", %d)" % n0, ", %d)" % n1))
    s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, %d, %s" % (n0, re.escape(salt)),
               lambda m: m.group(0).replace(", %d, " % n0, ", %d, " % n1), s)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)

m3 = os.path.join(SP, "make_chainlab3d.py")
s = io.open(m3, encoding="utf-8").read()
for name, vals in [("ordsp", [0, 3, 15, 6, 7, 9, 14, 4, 10, 12, 2, 11, 5, 13, 8, 1]),
                   ("ordco", [0, 4, 8, 3, 15, 9, 6, 11, 10, 12, 1, 14, 7, 13, 2, 5]),
                   ("ordbo", [1, 9, 7, 10, 2, 11, 3, 5, 6, 12, 13, 0, 8, 4])]:
    i = s.index("int %s(int i)" % name); j = s.index("\n", i)
    s = s[:i] + ifchain(name, vals, "energy order, %d classes" % len(vals)) + s[j:]
for a, b in [("ordsp(pickStage(xs, 12)); float vs = subVar(xs, 12);", "ordsp(pickStage(xs, 16)); float vs = subVar(xs, 16);"),
             ("ordco(pickStage(xc, 11)); float vc = subVar(xc, 11);", "ordco(pickStage(xc, 16)); float vc = subVar(xc, 16);"),
             ("ordbo(pickStage(xb, 9)); float vb = subVar(xb, 9);", "ordbo(pickStage(xb, 14)); float vb = subVar(xb, 14);")]:
    assert a in s, a
    s = s.replace(a, b)
old = "    else if (ks == 10) q = fTorusWrap("
assert s.count(old) == 1
s = s.replace(old, '''    else if (ks == 12) q = fRepeat(fHalfSpace(p, 1.0), vec3(1.3));                  // hyperbolic half-space
    else if (ks == 13) { q = fPolarZ(fTwistZ(p, 0.6 + 0.3 * vs), 2.0); q.x -= 1.4; q = zRepeat(q, 0.6); }   // double helix
    else if (ks == 14) q = fRepeat(fLogCyl(p, 2.5 + vs), vec3(1.2));                  // log-cylindrical Droste
    else if (ks == 15) q = fPoly(fRepeat(p, vec3(1.6)), 5.0);                        // icosahedral lattice
''' + old)
old = "    gP = q;\n    float th = 1.0 + 0.3 * gSpread;"
assert s.count(old) == 1
s = s.replace(old, '''    else if (kc == 11) {                                    // pseudo-Kleinian (Knighty's constants)
        const vec3 CS = vec3(0.92436, 0.90756, 0.92436);
        for (int i = 0; i < 5; ++i) {
            q = 2.0 * clamp(q, -CS, CS) - q;
            float k = max((1.0 + 0.15 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.6;
    } else if (kc == 12) {                                  // kaliset: abs(p)/|p|^2 - c
        for (int i = 0; i < 4; ++i) {
            float r2 = max(dot(q, q), 0.08);
            q = abs(q) / r2 - vec3(0.5 + 0.3 * vc, 0.4, 0.6); gDR /= r2;
        }
        bs = 0.9;
    } else if (kc == 13) {                                  // dodecahedral KIFS
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(0.0, 0.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(0.0, 0.53, 0.85)); }
        bs = 1.2;
    } else if (kc == 14) {                                  // Sierpinski octahedron
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(1.0, 0.0, 0.0)); }
        bs = 1.0;
    } else if (kc == 15) {                                  // Apollonian sphere packing
        for (int i = 0; i < 4; ++i) {
            q = abs(fract(q * 0.25 + 0.25) * 4.0 - 2.0) - 1.0;   // mirrored repeat (continuous)
            float k = (1.1 + 0.2 * vc) / max(dot(q, q), 1e-3);
            q *= k; gDR *= k;
        }
        bs = 0.5;
    }
''' + old)
old = "    else if (kb == 7) d = sdOcta3(q, 0.6 * bs * th);"
assert s.count(old) == 1
s = s.replace(old, old + '''
    else if (kb == 9) d = sdSuperquad(q, 0.5 * bs * th, 2.5 + 6.0 * vb);                     // superquadric
    else if (kb == 10) d = max(abs(length(q) - 0.5 * bs * th) - 0.05 * bs, -sdOcta3(q, 0.75 * bs));   // hollow sphere
    else if (kb == 11) { vec3 w = q; w.x -= clamp(w.x, -0.25 * bs, 0.25 * bs); d = sdTorus3(w.xzy, 0.3 * bs, 0.07 * bs * th); }   // chain link
    else if (kb == 12) d = sdNeovius(q * (3.0 / bs), 0.4 + 0.8 * gSpread) * bs / 3.0;          // Neovius surface
    else if (kb == 13) d = sdLidinoid(q * (3.0 / bs), 0.05 + 0.05 * gSpread) * bs / 3.0;       // Lidinoid''')
io.open(m3, "w", encoding="utf-8", newline="\n").write(s)

q = os.path.join(SP, "promote_likes.py")
t = io.open(q, encoding="utf-8").read()
i = t.index('    "chainAP": ['); j = t.index("],", i) + 2
NA = ["none", "polar unwrap", "elliptic coordinates", "parabolic coordinates", "Farris wallpaper", "Farris frieze", "sunflower spirals",
      "quasicrystal", "Droste zoom", "Escher spiral Droste", "bipolar Droste", "hyperbolic Poincare tiling", "hyperbolic band",
      "hyperbolic half-plane", "sphere kaleidoscope", "log-polar spiral", "Archimedean spiral", "hyperbolic spiral",
      "rotating Riemann sphere", "breathing sphere", "Peirce quincuncial sphere", "Jacobi cn wallpaper", "Jacobi sn/dn wallpaper",
      "parabolic stream", "hyperbolic Moebius flow", "complex exponential", "cardioid coordinates", "Blaschke product",
      "wandering poles", "bipolar stream", "complex sine", "tan lattice", "zeta partial sum", "circle inversion", "Moebius stream",
      "loxodromic stream", "Newton map", "Julia map", "Mandelbrot map", "burning ship", "Phoenix Julia", "kaleidoscope", "tunnel"]
t = t[:i] + '    "chainAP": [None, ' + ", ".join('"%s"' % n for n in NA[1:]) + "]," + t[j:]
i = t.index('    "chainBP": ['); j = t.index("],", i) + 2
NB = ["mirror line", "p4m lattice", "kaleidoscope", "curved kaleidoscope", "Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror",
      "p6m lattice", "Sierpinski fold", "Koch fold", "Levy C fold", "Pythagoras-tree fold", "Vicsek fold", "iterated fold", "Apollonian inversion fold"]
t = t[:i] + '    "chainBP": [None, ' + ", ".join('"%s"' % n for n in NB) + "]," + t[j:]
i = t.index('    "chainCP": ['); j = t.index("],", i) + 2
NC = ["lens", "fisheye", "blossom", "Farris rosette", "mirrored power", "Cayley transform", "Joukowski map", "spiral", "complex square", "inversion", "kaleidoscope", "tunnel"]
t = t[:i] + '    "chainCP": [None, ' + ", ".join('"%s"' % n for n in NC) + "]," + t[j:]
i = t.index('    "chainDP": ['); j = t.index("],", i) + 2
ND = ["turning", "bend", "shear wave", "wave interference", "curl flow", "cylinder flow", "dipole field", "twirl", "vortex pair",
      "vortex street", "Karman street", "Kelvin-Helmholtz rolls", "domain warp", "ripple"]
t = t[:i] + '    "chainDP": [None, ' + ", ".join('"%s"' % n for n in ND) + "]," + t[j:]
for a, b in [('"4D-rotated lattice", "log-spherical Droste", "turning lattice", "torus-wrapped world",',
              '"4D-rotated lattice", "log-spherical Droste", "log-cylindrical Droste", "turning lattice", "torus-wrapped world", "hyperbolic half-space",'),
             ('"mirrored lattice", "octahedral lattice", "hexagonal lattice",', '"mirrored lattice", "octahedral lattice", "icosahedral lattice", "hexagonal lattice",'),
             ('"helix", "inverted lattice", "polar ring tunnel"],', '"helix", "double helix", "inverted lattice", "polar ring tunnel"],'),
             ('"sphere-inversion box fold", "hyperbolic honeycomb", "Kleinian fold", "amazing surface",',
              '"sphere-inversion box fold", "Apollonian sphere packing", "hyperbolic honeycomb", "Kleinian fold", "pseudo-Kleinian", "amazing surface", "kaliset",'),
             ('"tetrahedral KIFS", "icosahedral KIFS",', '"tetrahedral KIFS", "Sierpinski octahedron", "icosahedral KIFS", "dodecahedral KIFS",'),
             ('"bodyP": ["balls", "octahedra", "tori",', '"bodyP": ["balls", "superquadrics", "octahedra", "hollow spheres", "tori", "chain links",'),
             ('"Schwarz D surface", "blocks",', '"Schwarz D surface", "Neovius surface", "Lidinoid", "blocks",'),
             ('CLASSES["spaceP"][pick(v["spaceP"], 12)]', 'CLASSES["spaceP"][pick(v["spaceP"], 16)]'),
             ('CLASSES["coreP"][pick(v["coreP"], 11)]', 'CLASSES["coreP"][pick(v["coreP"], 16)]'),
             ('CLASSES["bodyP"][pick(v["bodyP"], 9)]', 'CLASSES["bodyP"][pick(v["bodyP"], 14)]')]:
    assert a in t, a
    t = t.replace(a, b)
io.open(q, "w", encoding="utf-8", newline="\n").write(t)
a = os.path.join(SP, "lab_audit.py")
t = io.open(a, encoding="utf-8").read()
t = t.replace('"chainAP": 30, "chainBP": 10, "chainCP": 11, "chainDP": 9,', '"chainAP": 43, "chainBP": 16, "chainCP": 13, "chainDP": 15,')
t = t.replace('"spaceP": 12, "coreP": 11, "bodyP": 9}', '"spaceP": 16, "coreP": 16, "bodyP": 14}')
io.open(a, "w", encoding="utf-8", newline="\n").write(t)
print("ok")
