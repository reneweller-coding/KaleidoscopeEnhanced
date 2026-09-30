# -*- coding: utf-8 -*-
"""One-off patch (30.09., idea round 4).
2D: Farris p3m1/p31m/p4g/cmm (sub-variants), Farris frieze, sn wallpaper,
    hyperbolic half-plane, Archimedean spiral (A); Koch fold (B); bend (D);
    mirrored power down to the square-root fold (C)
3D: torus-wrapped space, gyroid-warped space; 'amazing surface' core;
    octahedron and rod-lattice bodies"""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

g = os.path.join(SP, "gen.py")
s = io.open(g, encoding="utf-8").read()
# ---- Farris: more groups ----
old = "vec2 farrisWave(vec2 X, int kind, float n, float m)\n{\n    const float TAU = 6.2831853;\n"
assert s.count(old) == 1
s = s.replace(old, r'''vec2 hexWave3(vec2 X, float n, float m)
{
    const float TAU = 6.2831853;
    vec2 Y = vec2(X.x + X.y * 0.5773503, X.y * 1.1547005);
    return (cexpi(TAU * (n * Y.x + m * Y.y)) + cexpi(TAU * (m * Y.x - (n + m) * Y.y)) + cexpi(TAU * (-(n + m) * Y.x + n * Y.y))) / 3.0;
}
vec2 sqWave4(vec2 X, float n, float m)
{
    const float TAU = 6.2831853;
    return (cexpi(TAU * (n * X.x + m * X.y)) + cexpi(TAU * (-m * X.x + n * X.y))
          + cexpi(TAU * (-n * X.x - m * X.y)) + cexpi(TAU * (m * X.x - n * X.y))) / 4.0;
}
''' + old + r'''    if (kind == 6) return 0.5 * (hexWave3(X, n, m) + hexWave3(X, m, n));            // p3m1: p3 + mirrors
    if (kind == 7) return 0.5 * (hexWave3(X, n, m) + hexWave3(X, -m, -n));          // p31m
    if (kind == 8) return 0.5 * (sqWave4(X, n, m) + (mod(n + m, 2.0) < 0.5 ? 1.0 : -1.0) * sqWave4(X, m, n));   // p4g: p4 + glides
    if (kind == 9) {                                                                 // cmm: centred rectangular, mirrors both ways
        vec2 Z = X * vec2(0.8, 1.3);
        return 0.25 * (cexpi(TAU * (n * Z.x + m * Z.y)) + cexpi(-TAU * (n * Z.x + m * Z.y))
                     + cexpi(TAU * (n * Z.x - m * Z.y)) + cexpi(-TAU * (n * Z.x - m * Z.y)));
    }
''')
s = s.replace("// 2: p6, 3: p4m (square with mirrors), 4: pg, 5: pgg (glide reflections --\n// impossible as a fold, natural as a wave function).",
              "// 2: p6, 3: p4m (square with mirrors), 4: pg, 5: pgg (glide reflections --\n// impossible as a fold, natural as a wave function), 6: p3m1, 7: p31m, 8: p4g, 9: cmm.")
LIB = r'''// ---- idea round 4 ----
// Farris frieze: a power series in w = exp(i z) -- periodic along the band,
// fading across it; the band folded (mirrored) so friezes stack endlessly.
vec2 tFrieze(vec2 uv, vec2 c, float period, float t)
{
    vec2 z = (uv - c) * vec2(6.2831853 / period, 3.0);
    z.y = abs(fract(z.y / 3.0 * 0.5 + 0.25) * 2.0 - 1.0) * 1.5;          // mirrored band, 0..1.5
    vec2 w = exp(-z.y) * cexpi(z.x);
    vec2 w2 = cmul(w, w), w3 = cmul(w2, w);
    vec2 f = cmul(cexpi(t * 0.5), w) + cmul(cexpi(-t * 0.7 + 1.0), w2) * 0.7 + cmul(cexpi(t * 0.3 + 2.0), w3) * 0.5;
    return c + f * 0.4;
}
// Jacobi sn/cn wallpaper: cn itself (m = 1/2) as a doubly periodic picture,
// its value turned with time (the colours travel round every cell).
vec2 tEllipticWall(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = (uv - c) * scale * 1.8540747;
    vec2 N, D;
    cnTheta(z * 0.8472131, N, D);
    vec2 zeta = cdiv(N, D);
    return c + cmul(zeta, cexpi(t * 0.3)) * 0.3;
}
// The hyperbolic plane in the upper half-plane: z = (w - i)/(w + i) to the
// disk; the lower half is the mirror image; a horizontal shift is an exact
// hyperbolic (parabolic) motion -- the tiling crawls along the horizon line.
vec2 tHalfPlane(vec2 uv, vec2 c, float p, float q, float scale, float travel)
{
    vec2 w = (uv - c) * scale;
    w.y = abs(w.y) + 0.04;
    w.x += travel;
    vec2 z = cdiv(w - vec2(0.0, 1.0), w + vec2(0.0, 1.0));
    return c + poincareFold(z, p, q) * 0.9;
}
// Archimedean spiral coordinates: r against the angle -- arms of equal
// spacing; one turn shifts both outputs by exactly one mirror period.
vec2 tArchimedes(vec2 uv, vec2 c, float k, float travel)
{
    vec2 d = uv - c;
    float r = length(d) * k, a = atan(d.y, d.x) / 3.14159265;
    return vec2(r - a - travel, r + a);
}
// Koch fold: the snowflake's mirrors and a scale of 3, repeated.
vec2 tKoch(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    const vec2 n = vec2(-0.5, 0.8660254);
    float sc = 1.0;
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p.x = abs(p.x);
        p.x -= 0.5;
        p -= 2.0 * min(0.0, dot(p, n)) * n;
        p *= 3.0; sc *= 3.0;
        p.x -= 1.5;
    }
    return c + p / sc * 1.4;
}
// Bend: the picture turned by an angle that grows across it (a bounded bend).
vec2 tBend(vec2 uv, float k)
{
    return 0.5 + rot2(k * (uv.x - 0.5)) * (uv - 0.5);
}
'''
anchor = "// ---- idea round 3 ----"
assert s.count(anchor) == 1
s = s.replace(anchor, LIB + anchor)
# ---- 3D ----
anchor = "// Twist around z (keep k small: it stretches space)."
s = s.replace(anchor, r'''// The world wrapped round a great ring (radius R, in the xz plane): the
// distance to the ring, the height and the arc length become the new axes.
// The arc repeat divides 2 pi R into whole periods (no seam where the angle
// wraps); gDR corrects the stretch inside the ring.
vec3 fTorusWrap(vec3 p, float R, float cell)
{
    float rho = length(p.xz);
    float arc = atan(p.z, p.x) * R;
    float per = 6.2831853 * R / max(floor(6.2831853 * R / (4.0 * cell) + 0.5), 1.0) / 4.0;   // whole periods round the ring
    gDR *= max(R / max(rho, 0.5), 1.0);
    vec3 q = vec3(rho - R, p.y, arc);
    return per * (abs(mod(q / per - 1.0, 4.0) - 2.0) - 1.0) * vec3(1.0, 1.0, 1.0);
}
// Gyroid-warped space: every point shifted along a gyroid-like field (smooth;
// the shift's slope is bounded, gDR takes it).
vec3 fGyroidWarp(vec3 p, float s, float t)
{
    gDR *= 1.0 + 1.3 * s;
    return p + s * sin(p.yzx * 1.3 + vec3(t, 1.7 * t, 2.3 + t));
}
float sdOcta3(vec3 p, float s) { p = abs(p); return (p.x + p.y + p.z - s) * 0.57735027; }
''' + anchor)
io.open(g, "w", encoding="utf-8", newline="\n").write(s)

def ifchain(name, vals, note):
    return "int %s(int i) { %s return %d; }   // %s" % (
        name, " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])), vals[-1], note)

p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
for name, vals, note in [("orda", [11, 5, 20, 14, 26, 25, 4, 16, 9, 15, 28, 24, 1, 29, 12, 17, 27, 19, 6, 18, 10, 7, 21, 8, 3, 13, 22, 23, 0, 2], "energy order, 30 classes"),
                         ("ordb", [0, 5, 3, 1, 8, 2, 7, 9, 4, 6], "none, mirror line, p4m, kaleidoscope, Penrose, p6m, Sierpinski, Koch, fold, Apollonian"),
                         ("ordd", [0, 5, 8, 2, 7, 1, 6, 4, 3], "none, turning, bend, wave, curl, twirl, vortex street, warp, ripple")]:
    i = s.index("int %s(int i)" % name); j = s.index("\n", i)
    s = s[:i] + ifchain(name, vals, note) + s[j:]
s = s.replace("    k = orda(k);\n", "    k = orda(k);\n"
    "    if (k == 26) return tFrieze(uv, gCw, 0.35 + 0.3 * v, gT * 1.5);\n"
    "    if (k == 27) return tEllipticWall(uv, gCw, 2.0 + 2.0 * v, gT);\n"
    "    if (k == 28) { int j = int(floor(v * 2.99)); vec2 pq = j == 0 ? vec2(5.0, 4.0) : j == 1 ? vec2(7.0, 3.0) : vec2(4.0, 6.0);\n"
    "                   return tHalfPlane(uv, gCt, pq.x, pq.y, 3.0 + 2.0 * v, gT * 0.8); }\n"
    "    if (k == 29) return tArchimedes(uv, gCt, 4.0 + 6.0 * v, gT * 2.0);\n", 1)
s = s.replace("    k = ordb(k);\n", "    k = ordb(k);\n    if (k == 9) return tKoch(uv, gCw, 2.0 + floor(v * 1.99), 0.3 * sin(gT * 0.3));\n", 1)
s = s.replace("    k = ordd(k);\n", "    k = ordd(k);\n    if (k == 8) return tBend(uv, 1.8 * sin(gT * 0.4 + v * 6.28));\n", 1)
s = s.replace("tFarris(uv, gCw, int(floor(v * 5.99)), 1.5 + gSpread, gT * 1.5)", "tFarris(uv, gCw, int(floor(v * 9.99)), 1.5 + gSpread, gT * 1.5)")
a = "tPowerMirror(uv, gCw, 1.5 + 1.2 * v + 0.4 * sin(gT * 0.3))"
assert a in s
s = s.replace(a, "tPowerMirror(uv, gCw, 0.5 + 2.3 * v + 0.3 * sin(gT * 0.3))   /* 0.5: the square-root fold */")
for knob, walk, salt, n0, n1 in [("chainAP", "walkA", "1.3", 26, 30), ("chainBP", "walkB", "2.9", 9, 10), ("chainDP", "walkD", "6.1", 8, 9)]:
    for pat in ["%s, %d)" % (knob, n0), "%s.x, %d)" % (walk, n0), "%s.y, %d)" % (walk, n0)]:
        assert pat in s, pat
        s = s.replace(pat, pat.replace(", %d)" % n0, ", %d)" % n1))
    s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, %d, %s" % (n0, re.escape(salt)),
               lambda m: m.group(0).replace(", %d, " % n0, ", %d, " % n1), s)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)

m3 = os.path.join(SP, "make_chainlab3d.py")
s = io.open(m3, encoding="utf-8").read()
for name, vals, note in [("ordsp", [0, 3, 6, 7, 9, 4, 10, 2, 11, 5, 8, 1], "... turning, torus wrap, twisted, gyroid warp, helix, inverted lattice, polar ring tunnel"),
                         ("ordco", [0, 4, 8, 3, 9, 6, 10, 1, 7, 2, 5], "... hyperbolic honeycomb, Kleinian, amazing surface, tetra, icosa, octa, Menger"),
                         ("ordbo", [1, 7, 2, 3, 5, 6, 0, 8, 4], "balls, octahedra, tori, gyroid, Schwarz P, Schwarz D, blocks, rod lattice, crosses")]:
    i = s.index("int %s(int i)" % name); j = s.index("\n", i)
    s = s[:i] + ifchain(name, vals, note) + s[j:]
for a, b in [("ordsp(pickStage(xs, 10)); float vs = subVar(xs, 10);", "ordsp(pickStage(xs, 12)); float vs = subVar(xs, 12);"),
             ("ordco(pickStage(xc, 10)); float vc = subVar(xc, 10);", "ordco(pickStage(xc, 11)); float vc = subVar(xc, 11);"),
             ("ordbo(pickStage(xb, 7)); float vb = subVar(xb, 7);", "ordbo(pickStage(xb, 9)); float vb = subVar(xb, 9);")]:
    assert a in s, a
    s = s.replace(a, b)
old = "    else if (ks == 7) q = f4DLattice("
assert s.count(old) == 1
s = s.replace(old, "    else if (ks == 10) q = fTorusWrap(p, 7.0 + 3.0 * vs, 1.3);                       // the world wrapped round a great ring\n"
                   "    else if (ks == 11) q = fRepeat(fGyroidWarp(p, 0.25 + 0.15 * vs, gT * 0.05), vec3(1.4));   // gyroid-warped lattice\n" + old)
old = "    gP = q;\n    float th = 1.0 + 0.3 * gSpread;"
s = s.replace(old, '''    else if (kc == 10) {
        // 'amazing surface' (Kali): box folds in xy only, sphere fold, turn, scale --
        // layered, sheet-like fractal terraces
        for (int i = 0; i < 4; ++i) {
            q.xy = clamp(q.xy, -1.0, 1.0) * 2.0 - q.xy;
            float r2 = max(dot(q, q), 1e-4);
            float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
            q *= k; gDR *= k;
            q = fRot(q, vec3(0.0, 0.0, 1.0), 0.3 + 0.4 * vc + 0.2 * sin(gRot));
            q = fScale(q, 1.5, vec3(0.0));
        }
        bs = 1.6;
    }
''' + old)
old = "    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th)"
assert s.count(old) == 1
s = s.replace(old, "    else if (kb == 7) d = sdOcta3(q, 0.6 * bs * th);                                  // octahedron\n"
                   "    else if (kb == 8) d = min(min(length(q.xy), length(q.yz)), length(q.zx)) - 0.1 * bs * th;   // rod lattice\n" + old)
io.open(m3, "w", encoding="utf-8", newline="\n").write(s)

q = os.path.join(SP, "promote_likes.py")
t = io.open(q, encoding="utf-8").read()
for a, b in [('"Farris wallpaper", "quasicrystal",', '"Farris wallpaper", "Farris frieze", "quasicrystal",'),
             ('"hyperbolic band", "sphere kaleidoscope", "log-polar spiral", "rotating Riemann sphere",\n                "Peirce quincuncial sphere",',
              '"hyperbolic band", "hyperbolic half-plane", "sphere kaleidoscope", "log-polar spiral", "Archimedean spiral",\n                "rotating Riemann sphere", "Peirce quincuncial sphere", "Jacobi cn wallpaper",'),
             ('"Sierpinski fold", "iterated fold",', '"Sierpinski fold", "Koch fold", "iterated fold",'),
             ('"chainDP": [None, "turning", "shear wave",', '"chainDP": [None, "turning", "bend", "shear wave",'),
             ('"turning lattice", "twisted lattice", "helix",', '"turning lattice", "torus-wrapped world", "twisted lattice", "gyroid-warped lattice", "helix",'),
             ('"hyperbolic honeycomb", "Kleinian fold",', '"hyperbolic honeycomb", "Kleinian fold", "amazing surface",'),
             ('"bodyP": ["balls", "tori",', '"bodyP": ["balls", "octahedra", "tori",'),
             ('"Schwarz D surface", "blocks", "crosses"],', '"Schwarz D surface", "blocks", "rod lattice", "crosses"],'),
             ('CLASSES["spaceP"][pick(v["spaceP"], 10)]', 'CLASSES["spaceP"][pick(v["spaceP"], 12)]'),
             ('CLASSES["coreP"][pick(v["coreP"], 10)]', 'CLASSES["coreP"][pick(v["coreP"], 11)]'),
             ('CLASSES["bodyP"][pick(v["bodyP"], 7)]', 'CLASSES["bodyP"][pick(v["bodyP"], 9)]')]:
    assert a in t, a
    t = t.replace(a, b)
io.open(q, "w", encoding="utf-8", newline="\n").write(t)
a = os.path.join(SP, "lab_audit.py")
t = io.open(a, encoding="utf-8").read()
t = t.replace('"chainAP": 26, "chainBP": 9, "chainCP": 11, "chainDP": 8,', '"chainAP": 30, "chainBP": 10, "chainCP": 11, "chainDP": 9,')
t = t.replace('"spaceP": 10, "coreP": 10, "bodyP": 7}', '"spaceP": 12, "coreP": 11, "bodyP": 9}')
io.open(a, "w", encoding="utf-8", newline="\n").write(t)
print("ok")
