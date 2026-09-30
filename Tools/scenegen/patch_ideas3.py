# -*- coding: utf-8 -*-
"""One-off patch (30.09., idea round 3): new chain classes.
2D A: Blaschke product, parabolic stream, elliptic coordinates, tan lattice,
      Newton map, Julia map, sphere kaleidoscope, quasicrystal
2D B: Sierpinski fold;  C: mirrored power;  D: vortex street, curl flow
Farris: glide groups pg, pgg
3D: inverted lattice, log-spherical Droste (spaces), hyperbolic honeycomb (core)"""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

LIB2 = r'''// ---- idea round 3 ----
// Blaschke product: z * prod (z - a)/(1 - conj(a) z) -- the unit disk wrapped
// onto itself several times around zeros that wander; conformal, continuous
// (its poles lie outside the disk and only fold far picture in).
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-8); }
vec2 tBlaschke(vec2 uv, vec2 c, float n, float t)
{
    vec2 z = (uv - c) * 2.2, B = z;
    for (int k = 0; k < 4; ++k) {
        if (float(k) >= n) break;
        float fk = float(k);
        vec2 a = 0.55 * vec2(cos(t * (0.3 + 0.07 * fk) + fk * 2.1), sin(t * (0.23 + 0.05 * fk) + fk * 1.3));
        B = cmul(B, cdiv(z - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z)));
    }
    return c + B * 0.45;
}
// Parabolic stream: in inverted coordinates a plain translation -- circles all
// touching at one point, the picture streaming through them (a parabolic Moebius flow).
vec2 tParabolic(vec2 uv, vec2 c, float scale, float travel)
{
    vec2 z = (uv - c) * scale;
    vec2 w = vec2(z.x, -z.y) / max(dot(z, z), 1e-5);
    return w * 0.3 + vec2(travel, 0.0);
}
// Elliptic coordinates around two foci: confocal ellipses and hyperbolas.
// nu uses acos without the sign of y (mirror-symmetric, hence continuous).
vec2 tElliptic(vec2 uv, vec2 c, float f, float travel)
{
    vec2 d = uv - c;
    float r1 = length(d + vec2(f, 0.0)), r2 = length(d - vec2(f, 0.0));
    float mu = log(max((r1 + r2) / (2.0 * f), 1.0) + sqrt(max(pow((r1 + r2) / (2.0 * f), 2.0) - 1.0, 0.0)));
    float nu = acos(clamp((r1 - r2) / (2.0 * f), -1.0, 1.0));
    return vec2(mu * 0.6 - travel, nu / 3.14159265 * 2.0);
}
// tan z: the plane in stripes, each a whole sphere of picture between two poles.
vec2 tTanLattice(vec2 uv, vec2 c, float k)
{
    vec2 z = (uv - c) * k;
    float den = cos(2.0 * z.x) + cosh(2.0 * z.y);
    return c + vec2(sin(2.0 * z.x), sinh(2.0 * z.y)) / max(den, 1e-4) * 0.25;
}
// Newton's method for z^3 = w, a few steps: the picture folded along the
// fractal borders of the three basins (a rational map: continuous off its poles).
vec2 tNewton(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.4, w = cexpi(t * 0.3);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        vec2 z2 = cmul(z, z);
        z -= cdiv(cmul(z2, z) - w, 3.0 * z2);
    }
    return c + z * 0.4;
}
// Julia map: z -> z^2 + k a few times, k wandering near the Mandelbrot border.
vec2 tJulia(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.4;
    vec2 k = 0.7885 * cexpi(t * 0.15 + 0.4);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        z = cmul(z, z) + k;
    }
    return c + z * 0.2;
}
// The polyhedral fold (Knighty) on the Riemann sphere: the plane lifted onto the
// turning sphere, folded by the tetrahedral/octahedral/icosahedral mirrors,
// projected back -- a spherical kaleidoscope with 12..120 copies.
vec3 polyFold(vec3 p, float n)
{
    float cospin = cos(3.14159265 / n), scospin = sqrt(max(0.75 - cospin * cospin, 1e-4));
    vec3 nc = vec3(-0.5, -cospin, scospin);
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= n) break;
        p.xy = abs(p.xy);
        p -= 2.0 * min(0.0, dot(p, nc)) * nc;
    }
    return p;
}
vec2 tSphereKaleido(vec2 uv, vec2 c, float n, float a1, float a2)
{
    vec2 z = (uv - c) * 2.5;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz;
    P.xz = rot2(a2) * P.xz;
    P = polyFold(P, n);
    return c + P.xy / max(1.0 - P.z, 1e-3) * 1.2;
}
// Quasicrystal (de Bruijn): n plane waves in n directions -- a pattern with
// n-fold symmetry that never repeats; phases drift, the pattern breathes.
vec2 tQuasi(vec2 uv, vec2 c, float n, float k, float t)
{
    vec2 x = (uv - c) * k, f = vec2(0.0);
    for (int j = 0; j < 7; ++j) {
        if (float(j) >= n) break;
        float a = 3.14159265 * float(j) / n;
        f += cexpi(dot(x, vec2(cos(a), sin(a))) * 6.2831853 + t * (0.5 + 0.13 * float(j)));
    }
    return c + f / n * 0.6;
}
// Sierpinski fold: the three mirrors of a triangle, then scale 2 -- a
// continuous iterated function system (every step a reflection or a scale).
vec2 tSierpinski(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 q = (uv - c) * 2.0;
    vec2 n1 = vec2(-0.8660254, 0.5), n2 = vec2(0.8660254, 0.5);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        q.x = abs(q.x);
        q -= 2.0 * min(0.0, dot(q, n1)) * n1;
        q -= 2.0 * min(0.0, dot(q, n2)) * n2;
        q = rot2(turn) * q;
        q = q * 2.0 - vec2(0.0, 1.0);
    }
    return c + q * 0.12;
}
// Mirrored power: z^alpha with the angle mirrored first (|arg z|), so any
// alpha -- also a drifting one -- stays continuous.
vec2 tPowerMirror(vec2 uv, vec2 c, float alpha)
{
    vec2 d = (uv - c) * 2.0;
    float r = length(d), a = abs(atan(d.y, d.x));
    return c + pow(r, alpha) * vec2(cos(alpha * a), sin(alpha * a)) * 0.45;
}
// Vortex street: four point vortices of alternating spin drifting past; each
// turns the picture near it by a bounded angle (a smooth, divergence-free flow).
vec2 tVortexStreet(vec2 uv, float strength, float t)
{
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        vec2 pk = vec2(0.5 + 0.45 * sin(t * 0.21 + fk * 1.57), 0.5 + (mod(fk, 2.0) - 0.5) * 0.35 + 0.1 * sin(t * 0.3 + fk));
        vec2 d = uv - pk;
        float g = strength * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) * exp(-dot(d, d) / 0.03);
        uv = pk + rot2(g) * d;
    }
    return uv;
}
// Curl flow: displaced along the curl of a noise field -- divergence-free, so
// the picture swirls like a fluid without bunching up.
vec2 tCurl(vec2 uv, float strength, float t)
{
    const float e = 0.01;
    vec2 q = uv * 3.0 + vec2(0.3 * t, -0.2 * t);
    float a = fbm3(q + vec2(0.0, e)), b = fbm3(q - vec2(0.0, e));
    float c1 = fbm3(q + vec2(e, 0.0)), d1 = fbm3(q - vec2(e, 0.0));
    return uv + strength * vec2(a - b, -(c1 - d1)) / (2.0 * e) * 0.02;
}
'''

g = os.path.join(SP, "gen.py")
s = io.open(g, encoding="utf-8").read()
# after the rosette (which defines rosetteTerm/tRosette)
i = s.index("vec2 tRosette(vec2 uv, vec2 c, float p, float k, float t)")
j = s.index("\n}\n", i) + 3
s = s[:j] + LIB2 + s[j:]
# Farris glide groups pg (4) and pgg (5) on a rectangular lattice
old = "    vec2 w = cexpi(TAU * (n * X.x + m * X.y)) + cexpi(TAU * (-m * X.x + n * X.y))"
assert s.count(old) == 1
s = s.replace(old, '''    if (kind == 4 || kind == 5) {                               // glide groups on a rectangular lattice
        float sg = mod(n, 2.0) < 0.5 ? 1.0 : -1.0;                 // (-1)^n: the half-step of the glide
        vec2 w = cexpi(TAU * (n * X.x + m * X.y * 0.7)) + sg * cexpi(TAU * (n * X.x - m * X.y * 0.7));
        if (kind == 5) w += cexpi(-TAU * (n * X.x + m * X.y * 0.7)) + sg * cexpi(TAU * (-n * X.x + m * X.y * 0.7));
        return w / (kind == 5 ? 4.0 : 2.0);
    }
''' + old)
s = s.replace("// 2: p6, 3: p4m (square with mirrors).", "// 2: p6, 3: p4m (square with mirrors), 4: pg, 5: pgg (glide reflections --\n// impossible as a fold, natural as a wave function).")
# 3D: log-spherical Droste space and hyperbolic ball fold
anchor = "// Twist around z (keep k small: it stretches space)."
s = s.replace(anchor, r'''// Log-spherical Droste in 3D: around a centre the radius is folded in log
// scale (mirrored triangle wave), so the world repeats inward and outward in
// shells at every scale; gDR carries the local scale.
vec3 fLogSphere(vec3 p, vec3 c, float K, float zoom)
{
    vec3 d = p - c;
    float r = max(length(d), 1e-4), lk = log(K);
    float u = log(r) / lk - zoom;
    float tri = abs(fract(u * 0.5) * 2.0 - 1.0);
    float rn = exp(tri * lk) * 0.6;
    gDR *= rn / r;
    return d / r * rn;
}
// Hyperbolic honeycomb in the Poincare ball: the octahedral mirrors plus the
// sphere orthogonal to the unit ball (centre k(1,1,1), R^2 = |c|^2 - 1),
// repeated -- cells shrinking without end toward the ball's rim.
vec3 fHyperBall(vec3 p, float k)
{
    vec3 c = vec3(k);
    float R2 = dot(c, c) - 1.0;
    for (int i = 0; i < 7; ++i) {
        p = abs(p);
        if (p.x < p.y) p.xy = p.yx;
        if (p.x < p.z) p.xz = p.zx;
        if (p.y < p.z) p.yz = p.zy;
        vec3 d = p - c;
        float dd = dot(d, d);
        if (dd < R2) { float f = R2 / dd; p = c + d * f; gDR *= f; }
    }
    return p;
}
''' + anchor)
io.open(g, "w", encoding="utf-8", newline="\n").write(s)

def ifchain(name, vals, note):
    return "int %s(int i) { %s return %d; }   // %s" % (
        name, " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])), vals[-1], note)

p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
ORD = {"orda": ([11, 5, 20, 14, 25, 4, 16, 9, 15, 24, 1, 12, 17, 19, 6, 18, 10, 7, 21, 8, 3, 13, 22, 23, 0, 2], "energy order, 26 classes"),
       "ordb": ([0, 5, 3, 1, 2, 7, 4, 6], "none, mirror line, p4m, kaleidoscope, p6m, Sierpinski, fold, Apollonian"),
       "ordc": ([0, 5, 8, 9, 10, 7, 1, 4, 3, 6, 2], "none, lens, blossom, rosette, power, Joukowski, spiral, square, inversion, kaleidoscope, tunnel"),
       "ordd": ([0, 5, 2, 7, 1, 6, 4, 3], "none, turning, wave, curl, twirl, vortex street, warp, ripple")}
for name, (vals, note) in ORD.items():
    i = s.index("int %s(int i)" % name); j = s.index("\n", i)
    s = s[:i] + ifchain(name, vals, note) + s[j:]
s = s.replace("    k = orda(k);\n", "    k = orda(k);\n"
    "    if (k == 18) return tBlaschke(uv, gCw, 2.0 + floor(v * 2.99), gT);\n"
    "    if (k == 19) return tParabolic(uv, gCw, 0.8 + 0.6 * v, gT * 0.8);\n"
    "    if (k == 20) return tElliptic(uv, gCt, 0.15 + 0.1 * v, gT * 1.5);\n"
    "    if (k == 21) return tTanLattice(uv, gCw, 2.5 + 2.0 * v);\n"
    "    if (k == 22) return tNewton(uv, gCw, 2.0 + floor(v * 1.99), gT);\n"
    "    if (k == 23) return tJulia(uv, gCw, 2.0 + floor(v * 1.99), gT);\n"
    "    if (k == 24) return tSphereKaleido(uv, gCw, 3.0 + floor(v * 2.99), 0.4 * sin(gT * 0.3), gT * 0.4 + gRot);\n"
    "    if (k == 25) return tQuasi(uv, gCw, v < 0.5 ? 5.0 : 7.0, 2.0 + 1.5 * fract(v * 2.0), gT * 1.5);\n", 1)
s = s.replace("    k = ordb(k);\n", "    k = ordb(k);\n    if (k == 7) return tSierpinski(uv, gCw, 3.0 + floor(v * 1.99), 0.3 * sin(gT * 0.4));\n", 1)
s = s.replace("    k = ordc(k);\n", "    k = ordc(k);\n    if (k == 10) return tPowerMirror(uv, gCw, 1.5 + 1.2 * v + 0.4 * sin(gT * 0.3));\n", 1)
s = s.replace("    k = ordd(k);\n", "    k = ordd(k);\n"
    "    if (k == 6) return tVortexStreet(uv, 1.5 + 2.0 * gSpread, gT * 2.0);\n"
    "    if (k == 7) return tCurl(uv, 0.4 + 0.8 * gSpread, gT);\n", 1)
s = s.replace("tFarris(uv, gCw, int(floor(v * 3.99)), 1.5 + gSpread, gT * 1.5)", "tFarris(uv, gCw, int(floor(v * 5.99)), 1.5 + gSpread, gT * 1.5)")
for knob, walk, salt, n0, n1 in [("chainAP", "walkA", "1.3", 18, 26), ("chainBP", "walkB", "2.9", 7, 8),
                                 ("chainCP", "walkC", "4.7", 10, 11), ("chainDP", "walkD", "6.1", 6, 8)]:
    for pat in ["%s, %d)" % (knob, n0), "%s.x, %d)" % (walk, n0), "%s.y, %d)" % (walk, n0)]:
        assert pat in s, pat
        s = s.replace(pat, pat.replace(", %d)" % n0, ", %d)" % n1))
    s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, %d, %s" % (n0, re.escape(salt)),
               lambda m: m.group(0).replace(", %d, " % n0, ", %d, " % n1), s)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)

m3 = os.path.join(SP, "make_chainlab3d.py")
s = io.open(m3, encoding="utf-8").read()
for name, vals, note in [("ordsp", [0, 3, 6, 7, 9, 4, 2, 5, 8, 1], "lattice, octa lattice, hexagons, 4D lattice, log-spherical Droste, turning, twisted, helix, inverted lattice, polar ring tunnel"),
                         ("ordco", [0, 4, 8, 3, 9, 6, 1, 7, 2, 5], "none, plane folds, polyhedral, sphere-inversion box, hyperbolic honeycomb, Kleinian, tetra, icosa, octa, Menger")]:
    i = s.index("int %s(int i)" % name); j = s.index("\n", i)
    s = s[:i] + ifchain(name, vals, note) + s[j:]
for a, b in [("ordsp(pickStage(xs, 8)); float vs = subVar(xs, 8);", "ordsp(pickStage(xs, 10)); float vs = subVar(xs, 10);"),
             ("ordco(pickStage(xc, 9)); float vc = subVar(xc, 9);", "ordco(pickStage(xc, 10)); float vc = subVar(xc, 10);")]:
    assert a in s, a
    s = s.replace(a, b)
old = "    else q = f4DLattice("
assert s.count(old) == 1
s = s.replace(old, '''    else if (ks == 8) {                                     // inverted lattice: the world seen through a sphere inversion ahead of us
        q = fInvert(p - (gCam + vec3(0.0, 0.0, 5.0)), 2.5); q = fRepeat(q, vec3(0.8 + 0.3 * vs));
    }
    else if (ks == 9) q = fRepeat(fLogSphere(p, gCam + vec3(0.0, 0.0, 6.0), 2.5 + vs, gT * 0.05), vec3(0.5));   // 3D Droste shells
    else if (ks == 7) q = f4DLattice(''')
old = "    gP = q;\n    float th = 1.0 + 0.3 * gSpread;"
assert s.count(old) == 1
s = s.replace(old, '''    else if (kc == 9) {
        // hyperbolic honeycomb: the cell mapped into the Poincare ball, folded
        q = fHyperBall(q * 0.8, 0.85 + 0.1 * vc) / 0.8;
        bs = 0.45;
    }
''' + old)
io.open(m3, "w", encoding="utf-8", newline="\n").write(s)

q = os.path.join(SP, "promote_likes.py")
t = io.open(q, encoding="utf-8").read()
i = t.index('    "chainAP": ['); j = t.index("],", i) + 2
t = t[:i] + ('    "chainAP": [None, "polar unwrap", "elliptic coordinates", "Farris wallpaper", "quasicrystal", "Droste zoom", "Escher spiral Droste",\n'
             '                "hyperbolic Poincare tiling", "hyperbolic band", "sphere kaleidoscope", "log-polar spiral", "rotating Riemann sphere",\n'
             '                "Peirce quincuncial sphere", "parabolic stream", "complex exponential", "Blaschke product", "bipolar stream",\n'
             '                "complex sine", "tan lattice", "circle inversion", "Moebius stream", "loxodromic stream", "Newton map", "Julia map",\n'
             '                "kaleidoscope", "tunnel"],') + t[j:]
t = t.replace('"iterated fold", "Apollonian inversion fold"],', '"Sierpinski fold", "iterated fold", "Apollonian inversion fold"],')
t = t.replace('"chainBP": [None, "mirror line", "p4m lattice", "kaleidoscope", "p6m lattice", "Sierpinski fold", "iterated fold",', '"chainBP": [None, "mirror line", "p4m lattice", "kaleidoscope", "p6m lattice", "Sierpinski fold", "iterated fold",')
t = t.replace('"chainCP": [None, "lens", "blossom", "Farris rosette", "Joukowski map",', '"chainCP": [None, "lens", "blossom", "Farris rosette", "mirrored power", "Joukowski map",')
t = t.replace('"chainDP": [None, "turning", "shear wave", "twirl", "domain warp", "ripple"],', '"chainDP": [None, "turning", "shear wave", "curl flow", "twirl", "vortex street", "domain warp", "ripple"],')
t = t.replace('"spaceP": ["mirrored lattice", "octahedral lattice", "hexagonal lattice", "4D-rotated lattice", "turning lattice", "twisted lattice", "helix", "polar ring tunnel"],',
              '"spaceP": ["mirrored lattice", "octahedral lattice", "hexagonal lattice", "4D-rotated lattice", "log-spherical Droste", "turning lattice", "twisted lattice", "helix", "inverted lattice", "polar ring tunnel"],')
t = t.replace('"coreP": ["no fold core", "plane folds", "polyhedral kaleidoscope", "sphere-inversion box fold", "Kleinian fold",',
              '"coreP": ["no fold core", "plane folds", "polyhedral kaleidoscope", "sphere-inversion box fold", "hyperbolic honeycomb", "Kleinian fold",')
t = t.replace('CLASSES["spaceP"][pick(v["spaceP"], 8)]', 'CLASSES["spaceP"][pick(v["spaceP"], 10)]').replace('CLASSES["coreP"][pick(v["coreP"], 9)]', 'CLASSES["coreP"][pick(v["coreP"], 10)]')
io.open(q, "w", encoding="utf-8", newline="\n").write(t)
a = os.path.join(SP, "lab_audit.py")
t = io.open(a, encoding="utf-8").read()
t = t.replace('"chainAP": 18, "chainBP": 7, "chainCP": 10, "chainDP": 6,', '"chainAP": 26, "chainBP": 8, "chainCP": 11, "chainDP": 8,').replace('"spaceP": 8, "coreP": 9,', '"spaceP": 10, "coreP": 10,')
io.open(a, "w", encoding="utf-8", newline="\n").write(t)
print("ok")
