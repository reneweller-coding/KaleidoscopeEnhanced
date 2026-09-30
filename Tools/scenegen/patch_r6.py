# -*- coding: utf-8 -*-
"""One-off patch (30.09., round 6): 50 more transforms.
2D A (+15): little planet, rotating Mercator, Weierstrass p, Schwarz-Christoffel
  polygon, theta wave, Chebyshev, Henon, Ikeda, Chirikov, Cassini ovals, Klein
  invariants (tetra/octa), Gumowski-Mira, Zaslavsky web, spherical Droste, cubic Julia
2D B (+7): modular group mirror, Schottky mirror, p3m1 triangle mirror, Pappus
  chain, origami folds, Steiner (inversion-conjugated kaleidoscope), spiral kaleidoscope
2D C (+5): gravitational lens, binary lens, Lorentz boost, log vortex, zone lens
2D D (+5): gravitational wave, double gyre, Taylor-Green, convection cells, Gerstner waves
3D (+18): spaces bent cells, twisted Droste, warped lattice, rolled world;
  cores Mandelbulb, cross-Menger, Mandalay box, mixed Sierpinski, spherical KIFS,
  twisted octa KIFS; bodies stellated octahedron, Steinmetz, twisted pillar,
  rhombic dodecahedron, icosahedron, linked rings, gear, pills"""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

def rd(p): return io.open(os.path.join(SP, p), encoding="utf-8").read()
def wr(p, s): io.open(os.path.join(SP, p), "w", encoding="utf-8", newline="\n").write(s)
def ifchain(name, vals, note):
    return "int %s(int i) { %s return %d; }   // %s" % (
        name, " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])), vals[-1], note)
def parse_ord(src, name):
    i = src.index("int %s(int i)" % name); j = src.index("\n", i)
    return [int(x) for x in re.findall(r"return (\d+);", src[i:j])]
def insert_after(lst, after, new):
    i = lst.index(after); return lst[:i + 1] + [new] + lst[i + 1:]

LIB2 = r'''// ---- round 6 ----
// Little planet: the photo as an equirectangular panorama on a turning
// sphere, seen stereographically (longitude jumps by one mirror period: seamless).
vec2 tLittlePlanet(vec2 uv, vec2 c, float zoom, float a1, float a2)
{
    vec2 z = (uv - c) * zoom;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz;
    P.xy = rot2(a2) * P.xy;
    return vec2(atan(P.y, P.x) / 3.14159265, asin(clamp(P.z, -1.0, 1.0)) / 1.5707963 * 0.5 + 0.5);
}
// Rotating Mercator: the screen is the Mercator map of a turning sphere that
// carries the photo stereographically -- loxodromes become straight lines.
vec2 tMercator(vec2 uv, vec2 c, float scale, float a1, float a2)
{
    vec2 m = (uv - c) * scale;
    float lon = m.x * 3.14159265, lat = atan(sinh(m.y * 3.14159265));
    vec3 P = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
    P.yz = rot2(a1) * P.yz;
    P.xy = rot2(a2) * P.xy;
    return c + P.xy / max(1.0 - P.z, 0.05) * 0.35;
}
// Weierstrass p on the square lattice (lemniscatic case): p ~ 1/sn^2.
vec2 tWeierstrass(vec2 uv, vec2 c, float scale, float t)
{
    vec2 z = (uv - c) * scale * 1.8540747;
    vec2 t1, t2, t3, t4;
    thetaAll(z * 0.8472131, t1, t2, t3, t4);
    vec2 q = cdiv(t4, t1) * 0.8473;                        // 1 / sn
    return c + cmul(cmul(q, q), cexpi(t * 0.3)) * 0.12;
}
// Schwarz-Christoffel: the unit disk onto a regular n-gon,
// sc(z) = z 2F1(1/n, 2/n; 1 + 1/n; z^n); outside the disk folded in.
vec2 tPolygonMap(vec2 uv, vec2 c, float n, float t)
{
    vec2 z = cmul((uv - c) * 2.2, cexpi(t * 0.2));
    float r2 = dot(z, z);
    if (r2 > 1.0) z /= r2;
    vec2 zn = vec2(1.0, 0.0);
    for (int k = 0; k < 6; ++k) { if (float(k) >= n) break; zn = cmul(zn, z); }
    float a = 1.0 / n, b = 2.0 / n, cc = 1.0 + 1.0 / n;
    vec2 term = vec2(1.0, 0.0), sum = vec2(1.0, 0.0);
    for (int k = 0; k < 12; ++k) {
        float fk = float(k);
        term = cmul(term, zn) * ((a + fk) * (b + fk) / ((cc + fk) * (fk + 1.0)));
        sum += term;
    }
    return c + cmul(z, sum) * 0.45;
}
// Jacobi theta_3 with a wandering complex nome: quasi-periodic waves.
vec2 tThetaWave(vec2 uv, vec2 c, float k, float t)
{
    vec2 z = (uv - c) * k;
    vec2 q = 0.4 * cexpi(t * 0.3), q2 = cmul(q, q);
    vec2 f = vec2(1.0, 0.0), qsq = vec2(1.0, 0.0), qp = q;
    for (int n = 1; n <= 4; ++n) {
        qsq = cmul(qsq, qp); qp = cmul(qp, q2);           // q^(n^2)
        f += 2.0 * cmul(qsq, ccos(2.0 * float(n) * z));
    }
    return c + f * 0.2;
}
// Chebyshev polynomial T_n (recurrence): the plane folded like cos(n acos z).
vec2 tChebyshev(vec2 uv, vec2 c, float n, float k)
{
    vec2 z = (uv - c) * k, t0 = vec2(1.0, 0.0), t1 = z;
    for (int i = 1; i < 7; ++i) { if (float(i) >= n) break; vec2 t2 = 2.0 * cmul(z, t1) - t0; t0 = t1; t1 = t2; }
    return c + t1 * 0.3;
}
// Henon map, a few steps (a drifting).
vec2 tHenon(vec2 uv, vec2 c, float steps, float t)
{
    vec2 p = (uv - c) * 2.5;
    float a = 1.2 + 0.2 * sin(t * 0.2);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; p = vec2(1.0 - a * p.x * p.x + p.y, 0.3 * p.x); }
    return c + p * 0.4;
}
// Ikeda map (the laser in a ring cavity), a few steps.
vec2 tIkeda(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 3.0;
    float u = 0.8 + 0.1 * sin(t * 0.2);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        z = vec2(1.0, 0.0) + u * cmul(z, cexpi(0.4 - 6.0 / (1.0 + dot(z, z))));
    }
    return c + z * 0.3;
}
// Chirikov standard map (kicked rotor): islands and chaos.
vec2 tChirikov(vec2 uv, vec2 c, float K, float steps)
{
    vec2 q = (uv - c) * 6.2831853;
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; q.y += K * sin(q.x); q.x += q.y; }
    return c + q / 6.2831853 * 0.5;
}
// Cassini ovals: log-polar of z^2 - a^2 (lemniscate at the critical size).
vec2 tCassini(vec2 uv, vec2 c, float a, float travel)
{
    vec2 z = (uv - c) * 2.0;
    vec2 w = cmul(z, z) - vec2(a * a, 0.0);
    return vec2(0.25 * log(max(dot(w, w), 1e-10)) - travel, atan(w.y, w.x) / 3.14159265);
}
// Klein's tetrahedral / octahedral invariants: rational maps with the symmetry
// of a Platonic solid on a turning sphere; f(1/z) = f(z), so |z| > 1 is folded
// in (no overflow, continuous); the value is read as a sphere point.
vec2 tKleinInv(vec2 uv, vec2 c, float kind, float a1, float a2)
{
    vec2 z = (uv - c) * 2.0;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz; P.xy = rot2(a2) * P.xy;
    z = P.xy / max(1.0 - P.z, 1e-3);
    if (dot(z, z) > 1.0) z = vec2(z.x, -z.y) / dot(z, z);
    vec2 z2 = cmul(z, z), z4 = cmul(z2, z2), N, D;
    if (kind < 0.5) {
        vec2 i2 = vec2(-z2.y, z2.x) * 3.4641016;
        vec2 phi = z4 - i2 + vec2(1.0, 0.0), psi = z4 + i2 + vec2(1.0, 0.0);
        N = cmul(cmul(phi, phi), phi); D = cmul(cmul(psi, psi), psi);
    } else {
        vec2 a = cmul(z4, z4) + 14.0 * z4 + vec2(1.0, 0.0);
        vec2 b = z4 - vec2(1.0, 0.0), b2 = cmul(b, b);
        N = cmul(cmul(a, a), a); D = 108.0 * cmul(z4, cmul(b2, b2));
    }
    float nn = dot(N, N), dd = dot(D, D);
    vec2 ND = vec2(N.x * D.x + N.y * D.y, N.y * D.x - N.x * D.y);
    vec3 Q = vec3(2.0 * ND, nn - dd) / max(nn + dd, 1e-20);
    return vec2(atan(Q.y, Q.x) / 3.14159265, asin(clamp(Q.z, -1.0, 1.0)) / 1.5707963 * 0.5 + 0.5);
}
// Gumowski-Mira map, a few steps.
float gmF(float x, float mu) { return mu * x + 2.0 * (1.0 - mu) * x * x / (1.0 + x * x); }
vec2 tGumowski(vec2 uv, vec2 c, float mu, float steps)
{
    vec2 p = (uv - c) * 12.0;
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= steps) break;
        float x = p.y + 0.008 * (1.0 - 0.05 * p.y * p.y) * p.y + gmF(p.x, mu);
        p = vec2(x, -p.x + gmF(x, mu));
    }
    return c + p * 0.05;
}
// Zaslavsky web map: a kick and a turn by 2 pi / q -- a q-fold stochastic web.
vec2 tZaslavsky(vec2 uv, vec2 c, float q, float K, float steps)
{
    vec2 p = (uv - c) * 18.0;
    float a = 6.2831853 / q;
    for (int i = 0; i < 5; ++i) {
        if (float(i) >= steps) break;
        float u = p.x + K * sin(p.y);
        p = vec2(u * cos(a) + p.y * sin(a), -u * sin(a) + p.y * cos(a));
    }
    return c + p / 18.0;
}
// Spherical Droste: a twisted Droste between two antipodal points of a
// turning sphere -- the poles travel, even through infinity.
vec2 tSphereDroste(vec2 uv, vec2 c, float K, float zoom, float a1, float a2)
{
    vec2 z = (uv - c) * 2.0;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.yz = rot2(a1) * P.yz; P.xy = rot2(a2) * P.xy;
    vec2 w = P.xy / max(1.0 - P.z, 1e-4);
    vec2 L = vec2(log(max(length(w), 1e-6)), atan(w.y, w.x));
    float lk = log(K), b = -lk / 3.14159265;
    vec2 W = vec2(L.x - b * L.y, L.y + b * L.x);
    float tri = abs(fract((W.x / lk - zoom) * 0.5) * 2.0 - 1.0);
    return c + exp(tri * lk - lk) * cexpi(W.y) * 0.45;
}
// Cubic Julia: z^3 + k, k wandering.
vec2 tJulia3(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.2, k = 0.55 * cexpi(t * 0.13 + 1.0);
    for (int i = 0; i < 3; ++i) { if (float(i) >= steps) break; z = cmul(cmul(z, z), z) + k; }
    return c + z * 0.3;
}
// ---- symmetries ----
// The modular group PSL(2,Z) as a mirror group ((2,3,inf) triangles): in the
// half-plane, mirrors x = 0, x = 1/2 and the unit circle, repeated.
vec2 tModular(vec2 uv, vec2 c, float scale, float travel)
{
    vec2 w = (uv - c) * scale;
    w.y = abs(w.y) + 0.03;
    w.x += travel;
    for (int i = 0; i < 12; ++i) {
        w.x = abs(fract(w.x + 0.5) - 0.5);
        float r2 = dot(w, w);
        if (r2 < 1.0) w /= r2;
    }
    return c + vec2(w.x, log(w.y) * 0.6) * 0.9;
}
// Schottky mirror group: inversions in four circles (tangent at r = 0.707).
vec2 tSchottky(vec2 uv, vec2 c, float r, float turn)
{
    vec2 z = rot2(turn) * (uv - c) * 2.5;
    for (int i = 0; i < 8; ++i)
        for (int k = 0; k < 4; ++k) {
            vec2 cc = cexpi(1.5707963 * float(k)), d = z - cc;
            float dd = dot(d, d);
            if (dd < r * r) z = cc + d * (r * r / dd);
        }
    return c + z * 0.4;
}
// p3m1: the equilateral-triangle mirror group (three mirrors through every
// three-fold centre): hexagonal cell, angle folded into the 60-degree wedge
// whose rays run through the cell's corners.
vec2 tTriMirror(vec2 uv, vec2 c, float cells, float turn)
{
    vec2 q = rot2(turn) * (uv - c) * cells;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float an = abs(mod(atan(h.y, h.x) - 0.5235988, 2.0943951) - 1.0471976);
    return c + length(h) * cexpi(an) / cells * 2.0;
}
// Pappus chain: inversion about a point turns the arbelos into a strip; the
// strip mirror-repeated and inverted back gives the endless chain of circles.
vec2 tPappus(vec2 uv, vec2 c, float width, float travel)
{
    vec2 p = c + vec2(0.35, 0.0), d = uv - p;
    vec2 w = d / max(dot(d, d), 1e-5);
    w.y = width * (abs(mod(w.y / width - 1.0 + travel, 4.0) - 2.0) - 1.0);
    return p + w / max(dot(w, w), 1e-5) * 0.8;
}
// Origami: up to four mirror lines (folds) turning slowly.
vec2 tOrigami(vec2 uv, vec2 c, float n, float t)
{
    for (int k = 0; k < 4; ++k) {
        if (float(k) >= n) break;
        float fk = float(k);
        vec2 nn = cexpi(t * (0.1 + 0.03 * fk) + fk * 1.7);
        vec2 pk = c + 0.18 * cexpi(fk * 2.3 + t * 0.07);
        float s = dot(uv - pk, nn);
        uv -= nn * (s - abs(s));
    }
    return uv;
}
// Steiner: a kaleidoscope seen through a circle inversion -- its mirrors
// become circles through the inversion point.
vec2 tSteiner(vec2 uv, vec2 c, float n, float rot)
{
    vec2 d = (uv - c) * 2.0 + vec2(0.3, 0.0);
    vec2 w = d / max(dot(d, d), 1e-6) - vec2(1.2, 0.0);
    float sec = 6.2831853 / n;
    float an = abs(mod(atan(w.y, w.x) + rot, sec) - 0.5 * sec);
    w = length(w) * cexpi(an) + vec2(1.2, 0.0);
    return c + (w / max(dot(w, w), 1e-6) - vec2(0.3, 0.0)) * 0.5;
}
// Spiral kaleidoscope: the sectors twist with the log-radius.
vec2 tSpiralKaleido(vec2 uv, vec2 c, float sides, float twist, float rot)
{
    vec2 d = uv - c;
    float r = max(length(d), 1e-5), sec = 6.2831853 / sides;
    float an = abs(mod(atan(d.y, d.x) + twist * log(r) + rot, sec) - 0.5 * sec);
    return c + r * cexpi(an);
}
// ---- second maps ----
// Gravitational lens (point mass): the source seen through an Einstein ring.
vec2 tGravLens(vec2 uv, vec2 c, float rE, vec2 pos)
{
    vec2 d = uv - c - pos;
    return uv - rE * rE * d / max(dot(d, d), 1e-5);
}
// Binary lens: two masses orbiting -- caustic folds.
vec2 tBinaryLens(vec2 uv, vec2 c, float rE, float t)
{
    vec2 d1 = uv - c - 0.12 * cexpi(t), d2 = uv - c + 0.12 * cexpi(t);
    return uv - rE * rE * (d1 / max(dot(d1, d1), 1e-5) + 0.6 * d2 / max(dot(d2, d2), 1e-5));
}
// Lorentz boost (hyperbolic rotation): squeezed along the diagonals.
vec2 tBoost(vec2 uv, vec2 c, float phi)
{
    vec2 d = uv - c;
    float ch = cosh(phi), sh = sinh(phi);
    return c + vec2(d.x * ch + d.y * sh, d.x * sh + d.y * ch);
}
// Log vortex: turned by an angle growing with log r (a spiral sink).
vec2 tLogVortex(vec2 uv, vec2 c, float k)
{
    vec2 d = uv - c;
    return c + rot2(k * log(max(length(d), 1e-4))) * d;
}
// Zone lens: the magnification oscillates with r^2 (a smooth Fresnel lens).
vec2 tZoneLens(vec2 uv, vec2 c, float a, float k)
{
    vec2 d = uv - c;
    return c + d * (1.0 + a * sin(k * dot(d, d)));
}
// ---- flows ----
// Gravitational wave: plus and cross polarisation, travelling out.
vec2 tGravWave(vec2 uv, vec2 c, float h, float t)
{
    vec2 d = uv - c;
    float ph = sin(length(d) * 25.0 - t * 3.0) * exp(-length(d) * 1.5);
    return uv + h * ph * (cos(t * 0.3) * vec2(d.x, -d.y) + sin(t * 0.3) * vec2(d.y, d.x));
}
// Double gyre (the textbook time-periodic flow), advected four steps.
vec2 tDoubleGyre(vec2 uv, float A, float t)
{
    vec2 p = mirrorUV(uv) * vec2(2.0, 1.0);
    float s = 0.25 * sin(0.6 * t);
    for (int i = 0; i < 4; ++i) {
        float f = s * p.x * p.x + (1.0 - 2.0 * s) * p.x, dfx = 2.0 * s * p.x + 1.0 - 2.0 * s;
        p += 0.04 * 3.14159265 * A * vec2(-sin(3.14159265 * f) * cos(3.14159265 * p.y), cos(3.14159265 * f) * sin(3.14159265 * p.y) * dfx);
    }
    return p / vec2(2.0, 1.0);
}
// Taylor-Green vortices, amplitude breathing.
vec2 tTaylorGreen(vec2 uv, float A, float t)
{
    vec2 p = uv * 9.424778;
    float a = A * sin(t * 0.4);
    for (int i = 0; i < 4; ++i) p += 0.08 * a * vec2(sin(p.x) * cos(p.y), -cos(p.x) * sin(p.y));
    return p / 9.424778;
}
// Convection cells: displaced along the gradient of a hexagonal wave field.
vec2 tConvection(vec2 uv, float k, float s, float t)
{
    vec2 g = vec2(0.0);
    for (int j = 0; j < 3; ++j) {
        vec2 e = cexpi(2.0943951 * float(j));
        g -= k * e * sin(k * dot(e, uv) + t * 0.3);
    }
    return uv + s * g * 0.002;
}
// Gerstner waves: three trochoidal waves, horizontal displacement.
vec2 tGerstner(vec2 uv, float A, float t)
{
    for (int j = 0; j < 3; ++j) {
        vec2 dir = cexpi(0.7 + 1.9 * float(j));
        uv += A * dir * cos(dot(dir, uv) * (14.0 + 5.0 * float(j)) - t * (1.5 + 0.4 * float(j))) * 0.012;
    }
    return uv;
}
'''
LIB3 = r'''// ---- round 6 (3D) ----
vec3 fRollZ(vec3 p, float R, float cell)
{
    float rho = length(p.xy), arc = atan(p.y, p.x) * R;
    float per = 6.2831853 * R / max(floor(6.2831853 * R / (4.0 * cell) + 0.5), 1.0) / 4.0;
    gDR *= max(R / max(rho, 0.5), 1.0);
    vec3 q = vec3(rho - R, arc, p.z);
    return per * (abs(mod(q / per - 1.0, 4.0) - 2.0) - 1.0);
}
float sdTetra3(vec3 p, float s) { return (max(abs(p.x + p.y) - p.z, abs(p.x - p.y) + p.z) - s) * 0.57735027; }
float sdIcosa3(vec3 p, float s)
{
    p = abs(p);
    const float g = 1.618034, ig = 0.618034;
    float d = dot(p, vec3(1.0));
    d = max(d, dot(p, vec3(0.0, ig, g)));
    d = max(d, dot(p, vec3(ig, g, 0.0)));
    d = max(d, dot(p, vec3(g, 0.0, ig)));
    return (d * 0.57735027 - s);
}
'''
g = rd("gen.py")
anchor = "// ---- idea round 4 ----"
assert g.count(anchor) == 1
g = g.replace(anchor, LIB2 + anchor)
anchor3 = "// Twist around z (keep k small: it stretches space)."
assert g.count(anchor3) == 1
g = g.replace(anchor3, LIB3 + anchor3)
wr("gen.py", g)

# ---- 2D wiring ----
from chain_classes import CLASSES as CC
s = rd(os.path.join("src", "ChainLab2D.glsl"))
names = {}
for knob, fn in [("chainAP", "orda"), ("chainBP", "ordb"), ("chainCP", "ordc"), ("chainDP", "ordd")]:
    o = parse_ord(s, fn)
    assert len(o) == len(CC[knob]), (knob, len(o), len(CC[knob]))
    names[knob] = {o[i]: (CC[knob][i] or "none") for i in range(len(o))}
NEW2 = {
 "chainAP": [(43, "little planet", 16), (44, "rotating Mercator", 43), (56, "spherical Droste", 33), (52, "Cassini ovals", 39),
             (53, "Klein invariants", 24), (45, "Weierstrass p", 30), (46, "Schwarz-Christoffel polygon", 17), (47, "theta wave", 27),
             (48, "Chebyshev fold", 31), (55, "Zaslavsky web", 23), (54, "Gumowski-Mira", 55), (51, "Chirikov map", 54),
             (49, "Henon map", 51), (50, "Ikeda map", 49), (57, "cubic Julia", 38)],
 "chainBP": [(20, "origami folds", 5), (18, "p3m1 triangle mirror", 3), (22, "spiral kaleidoscope", 1), (21, "Steiner kaleidoscope", 10),
             (16, "modular group mirror", 15), (19, "Pappus chain", 11), (17, "Schottky mirror", 6)],
 "chainCP": [(17, "zone lens", 5), (15, "Lorentz boost", 12), (13, "gravitational lens", 11), (14, "binary lens", 13), (16, "log vortex", 1)],
 "chainDP": [(19, "Gerstner waves", 2), (18, "convection cells", 13), (17, "Taylor-Green vortices", 11), (16, "double gyre", 12), (15, "gravitational wave", 9)],
}
FN = {"chainAP": "orda", "chainBP": "ordb", "chainCP": "ordc", "chainDP": "ordd"}
newlists = {}
for knob, adds in NEW2.items():
    o = parse_ord(s, FN[knob])
    for nid, nm, after in adds:
        o = insert_after(o, after, nid); names[knob][nid] = nm
    i = s.index("int %s(int i)" % FN[knob]); j = s.index("\n", i)
    s = s[:i] + ifchain(FN[knob], o, "energy order, %d classes" % len(o)) + s[j:]
    newlists[knob] = [None if names[knob][k] == "none" else names[knob][k] for k in o]
s = s.replace("    k = orda(k);\n", "    k = orda(k);\n"
    "    if (k == 43) return tLittlePlanet(uv, gCw, 2.0 + 1.5 * v, 0.6 * sin(gT * 0.3), gT * 0.4 + gRot);\n"
    "    if (k == 44) return tMercator(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gT * 0.3) + 0.8, gT * 0.4 + gRot);\n"
    "    if (k == 45) return tWeierstrass(uv, gCw, 2.0 + 2.0 * v, gT);\n"
    "    if (k == 46) return tPolygonMap(uv, gCw, 3.0 + floor(v * 3.99), gT);\n"
    "    if (k == 47) return tThetaWave(uv, gCw, 3.0 + 3.0 * v, gT);\n"
    "    if (k == 48) return tChebyshev(uv, gCw, 3.0 + floor(v * 3.99), 1.4 + 0.6 * sin(gT * 0.2));\n"
    "    if (k == 49) return tHenon(uv, gCw, 3.0, gT);\n"
    "    if (k == 50) return tIkeda(uv, gCw, 3.0, gT);\n"
    "    if (k == 51) return tChirikov(uv, gCw, 0.8 + 0.6 * v + 0.3 * sin(gT * 0.2), 3.0);\n"
    "    if (k == 52) return tCassini(uv, gCt, 0.6 + 0.4 * sin(gT * 0.25), gT * 1.2);\n"
    "    if (k == 53) return tKleinInv(uv, gCw, v < 0.5 ? 0.0 : 1.0, 0.6 * sin(gT * 0.3), gT * 0.3 + gRot);\n"
    "    if (k == 54) return tGumowski(uv, gCw, -0.4 + 0.3 * sin(gT * 0.15) + 0.2 * v, 3.0);\n"
    "    if (k == 55) return tZaslavsky(uv, gCw, 4.0 + floor(v * 3.99), 1.0 + 0.4 * sin(gT * 0.2), 4.0);\n"
    "    if (k == 56) return tSphereDroste(uv, gCw, 2.5 + 2.0 * v, gT * 0.5, 0.6 * sin(gT * 0.2), gT * 0.3);\n"
    "    if (k == 57) return tJulia3(uv, gCw, 2.0, gT);\n", 1)
s = s.replace("    k = ordb(k);\n", "    k = ordb(k);\n"
    "    if (k == 16) return tModular(uv, gCw, 2.0 + 1.5 * v, gT * 0.5);\n"
    "    if (k == 17) return tSchottky(uv, gCw, 0.6 + 0.1 * v, gRot);\n"
    "    if (k == 18) return tTriMirror(uv, gCw, 2.0 + 1.5 * v, gRot);\n"
    "    if (k == 19) return tPappus(uv, gCw, 0.8 + 0.6 * v, gT * 0.5);\n"
    "    if (k == 20) return tOrigami(uv, gCw, 2.0 + floor(v * 2.99), gT);\n"
    "    if (k == 21) return tSteiner(uv, gCw, sides(v), gRot);\n"
    "    if (k == 22) return tSpiralKaleido(uv, gCw, sides(v), 1.0 + 1.5 * sin(gT * 0.2), gRot);\n", 1)
s = s.replace("    k = ordc(k);\n", "    k = ordc(k);\n"
    "    if (k == 13) return tGravLens(uv, gCw, 0.12 + 0.06 * v, 0.2 * vec2(sin(gT * 0.4), cos(gT * 0.31)));\n"
    "    if (k == 14) return tBinaryLens(uv, gCw, 0.1 + 0.05 * v, gT * 0.5);\n"
    "    if (k == 15) return tBoost(uv, gCw, 0.6 * sin(gT * 0.3 + v * 6.28));\n"
    "    if (k == 16) return tLogVortex(uv, gCw, 0.5 + 1.0 * sin(gT * 0.2));\n"
    "    if (k == 17) return tZoneLens(uv, gCw, 0.15 + 0.1 * v, 30.0 + 20.0 * v);\n", 1)
s = s.replace("    k = ordd(k);\n", "    k = ordd(k);\n"
    "    if (k == 15) return tGravWave(uv, gCw, 0.4 + 0.6 * gSpread, gT * 2.0);\n"
    "    if (k == 16) return tDoubleGyre(uv, 0.5 + 0.5 * gSpread, gT * 2.0);\n"
    "    if (k == 17) return tTaylorGreen(uv, 1.0 + gSpread, gT * 2.0);\n"
    "    if (k == 18) return tConvection(uv, 20.0 + 10.0 * v, 1.0 + gSpread, gT * 2.0);\n"
    "    if (k == 19) return tGerstner(uv, 1.0 + gSpread, gT * 3.0);\n", 1)
for knob, walk, salt in [("chainAP", "walkA", "1.3"), ("chainBP", "walkB", "2.9"), ("chainCP", "walkC", "4.7"), ("chainDP", "walkD", "6.1")]:
    n0 = len(CC[knob]); n1 = len(newlists[knob])
    for pat in ["%s, %d)" % (knob, n0), "%s.x, %d)" % (walk, n0), "%s.y, %d)" % (walk, n0)]:
        assert pat in s, pat
        s = s.replace(pat, pat.replace(", %d)" % n0, ", %d)" % n1))
    s, k = re.subn(r"walkPick\(c( \+ 1\.0)?, k0, v0, %d, %s" % (n0, re.escape(salt)),
                   lambda m: m.group(0).replace(", %d, " % n0, ", %d, " % n1), s)
    assert k == 2, (knob, k)
wr(os.path.join("src", "ChainLab2D.glsl"), s)

# ---- 3D wiring ----
m = rd("make_chainlab3d.py")
names3 = {}
for knob, fn in [("spaceP", "ordsp"), ("coreP", "ordco"), ("bodyP", "ordbo")]:
    o = parse_ord(m, fn)
    assert len(o) == len(CC[knob]), (knob, len(o), len(CC[knob]))
    names3[knob] = {o[i]: CC[knob][i] for i in range(len(o))}
NEW3 = {
 "spaceP": [(19, "rolled world", 6), (16, "bent cells", 4), (18, "noise-warped lattice", 11), (17, "twisted 3D Droste", 9)],
 "coreP": [(20, "spherical KIFS", 3), (18, "Mandalay box", 15), (16, "Mandelbulb", 10), (19, "mixed Sierpinski", 1),
           (21, "twisted octahedral KIFS", 2), (17, "cross-Menger", 5)],
 "bodyP": [(21, "pills", 1), (17, "rhombic dodecahedra", 7), (18, "icosahedra", 17), (19, "linked rings", 11),
           (16, "twisted pillars", 0), (14, "stellated octahedra", 8), (15, "Steinmetz solids", 14), (20, "gears", 4)],
}
FN3 = {"spaceP": ("ordsp", "xs", "vs"), "coreP": ("ordco", "xc", "vc"), "bodyP": ("ordbo", "xb", "vb")}
for knob, adds in NEW3.items():
    fn, xv, vv = FN3[knob]
    o = parse_ord(m, fn)
    n0 = len(o)
    for nid, nm, after in adds:
        o = insert_after(o, after, nid); names3[knob][nid] = nm
    i = m.index("int %s(int i)" % fn); j = m.index("\n", i)
    m = m[:i] + ifchain(fn, o, "energy order, %d classes" % len(o)) + m[j:]
    a = "%s(pickStage(%s, %d)); float %s = subVar(%s, %d);" % (fn, xv, n0, vv, xv, n0)
    assert a in m, a
    m = m.replace(a, "%s(pickStage(%s, %d)); float %s = subVar(%s, %d);" % (fn, xv, len(o), vv, xv, len(o)))
    newlists[knob] = [names3[knob][k] for k in o]
old = "    else if (ks == 15) q = fPoly(fRepeat(p, vec3(1.6)), 5.0);                        // icosahedral lattice\n"
assert m.count(old) == 1
m = m.replace(old, old +
 "    else if (ks == 16) { q = fRepeat(p, vec3(1.5)); float kb2 = 0.35 + 0.25 * vs; q.xy = rot2(kb2 * q.x) * q.xy; gDR *= 1.0 + 1.5 * kb2; }   // bent cells\n"
 "    else if (ks == 17) { vec3 cc = gCam + vec3(0.0, 0.0, 6.0); float lr = log(max(length(p - cc), 1e-3));\n"
 "        q = fLogSphere(p, cc, 2.5 + vs, gT * 0.05); q.xy = rot2(0.9 * lr) * q.xy; gDR *= 1.9; q = fRepeat(fScale(q, 2.5, vec3(0.0)), vec3(1.4)); }   // twisted 3D Droste\n"
 "    else if (ks == 18) { float ws = 0.3 + 0.2 * vs; q = fRepeat(fWarp(p, ws, gT * 0.05), vec3(1.4)); gDR *= 1.0 + 2.5 * ws; }   // noise-warped lattice\n"
 "    else if (ks == 19) q = fRollZ(p, 3.2 + vs, 1.2);                                   // the world rolled round the flight axis\n")
old = "    gP = q;\n    float th = 1.0 + 0.3 * gSpread;"
assert m.count(old) == 1
m = m.replace(old, '''    else if (kc == 16) {                                    // Mandelbulb (power 8): its own distance estimate
        vec3 z = q * 1.3, c0 = z; float dr = 1.0, r = length(z);
        for (int i = 0; i < 3; ++i) {
            r = length(z); if (r > 2.0) break;
            float th0 = acos(clamp(z.z / max(r, 1e-4), -1.0, 1.0)) * 8.0 + gRot * 0.3, ph0 = atan(z.y, z.x) * 8.0;
            dr = pow(r, 7.0) * 8.0 * dr + 1.0;
            z = pow(r, 8.0) * vec3(sin(th0) * cos(ph0), sin(th0) * sin(ph0), cos(th0)) + c0;
        }
        r = length(z);
        gP = c0;
        return 0.5 * log(max(r, 1e-4)) * r / dr / 1.3 / gDR * 0.8;
    } else if (kc == 17) {                                  // cross-Menger: Menger folds, scale 2.4 about the arm
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fScale(q, 2.4, vec3(1.4, 1.4, 0.0)); if (q.z < -0.7) q.z += 1.4; }
        bs = 2.2;
    } else if (kc == 18) {                                  // Mandalay box: octahedral fold, box fold, sphere fold
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fBox(q, 0.8); q = fSphere(q, 0.4, 1.0); q = fScale(q, 1.7, vec3(0.6, 0.3, 0.2) * (1.0 + vc)); }
        bs = 1.3;
    } else if (kc == 19) {                                  // mixed Sierpinski: tetra and octa folds alternating
        for (int i = 0; i < 4; ++i) { if (i == 1 || i == 3) q = fOcta(q); else q = fTetra(q); q = fScale(q, 1.8, vec3(0.8 + 0.3 * vc)); }
        bs = 1.6;
    } else if (kc == 20) {                                  // spherical KIFS: abs, sphere fold, turn, scale 2
        for (int i = 0; i < 3; ++i) { q = abs(q); q = fSphere(q, 0.4, 0.9); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.3 * vc); q = fScale(q, 2.0, vec3(0.9)); }
        bs = 1.3;
    } else if (kc == 21) {                                  // twisted octahedral KIFS: the turn grows per round
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.2, 1.0, 0.5), gRot * 0.4 + 0.35 * float(i + 1) + vc); q = fScale(q, 1.7, vec3(0.7, 0.35, 0.1)); }
        bs = 1.4;
    }
''' + old)
old = "    else if (kb == 8) d = min(min(length(q.xy), length(q.yz)), length(q.zx)) - 0.1 * bs * th;   // rod lattice\n"
assert m.count(old) == 1
m = m.replace(old, old +
 "    else if (kb == 14) d = min(sdTetra3(q, 0.4 * bs * th), sdTetra3(-q, 0.4 * bs * th));   // stellated octahedron\n"
 "    else if (kb == 15) d = max(max(length(q.xy), length(q.yz)), length(q.zx)) - 0.4 * bs * th;   // Steinmetz tricylinder\n"
 "    else if (kb == 16) { vec3 w = q; w.xz = rot2(q.y * 2.5) * w.xz; d = sdBox3(w, vec3(0.16, 0.6, 0.16) * bs * th) * 0.6; }   // twisted pillar\n"
 "    else if (kb == 17) d = (max(max(abs(q.x) + abs(q.y), abs(q.y) + abs(q.z)), abs(q.z) + abs(q.x)) - 0.6 * bs * th) * 0.7071;   // rhombic dodecahedron\n"
 "    else if (kb == 18) d = sdIcosa3(q, 0.45 * bs * th);                                  // icosahedron\n"
 "    else if (kb == 19) { float R = 0.38 * bs, r0 = 0.07 * bs * th; vec3 a = q + vec3(0.2 * bs, 0.0, 0.0), b = q - vec3(0.2 * bs, 0.0, 0.0);\n"
 "        d = min(length(vec2(length(a.xy) - R, a.z)) - r0, length(vec2(length(b.xz) - R, b.y)) - r0); }   // linked rings\n"
 "    else if (kb == 20) { float rho = length(q.xy), Rr = 0.45 * bs + 0.06 * bs * smoothstep(-0.3, 0.3, sin(12.0 * atan(q.y, q.x)));\n"
 "        d = max(max(rho - Rr, 0.2 * bs - rho), abs(q.z) - 0.08 * bs * th) * 0.7; }   // gear\n"
 "    else if (kb == 21) { vec3 w = q; w.x -= clamp(w.x, -0.3 * bs, 0.3 * bs); d = length(w) - 0.15 * bs * th; }   // pill\n")
wr("make_chainlab3d.py", m)

# ---- class names (single source) ----
out = ['# -*- coding: utf-8 -*-', '"""The chain labs\' stage classes in their energy order (calm .. energetic), as',
       'the shaders pick them (position = pickStage(knob, len)).  Single source for',
       'promote_likes.py (descriptions) and gen.py (the "// @chainclasses" lines the app',
       'reads for the shader-info overlay, key v).  None = the identity."""', 'CLASSES = {']
for k, v in CC.items():
    out.append('    %r: %r,' % (k, newlists.get(k, v)))
out.append('}')
wr("chain_classes.py", "\n".join(out) + "\n")
a = rd("lab_audit.py")
a = re.sub(r'CLASSES = \{[^}]*\}', 'CLASSES = {%s}' % ", ".join('"%s": %d' % (k, len(newlists.get(k, CC[k]))) for k in
           ["chainAP", "chainBP", "chainCP", "chainDP", "styleP", "spaceP", "coreP", "bodyP"]), a, count=1)
wr("lab_audit.py", a)
print({k: len(v) for k, v in newlists.items()})
