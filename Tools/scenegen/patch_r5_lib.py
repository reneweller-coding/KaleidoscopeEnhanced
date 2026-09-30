# -*- coding: utf-8 -*-
"""One-off patch (30.09., round 5): library functions for 50 more transforms."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
g = os.path.join(SP, "gen.py")
s = io.open(g, encoding="utf-8").read()

LIB2 = r'''// ---- round 5 ----
// Jacobi theta functions for m = 1/2 (q = e^-pi), all four, complex argument.
void thetaAll(vec2 v, out vec2 t1, out vec2 t2, out vec2 t3, out vec2 t4)
{
    float n = floor(v.y / 3.14159265 + 0.5);
    v -= n * vec2(3.14159265, 3.14159265);
    v.x = mod(v.x + 3.14159265, 6.2831853) - 3.14159265;
    const float q14 = 0.4559381, q94 = 0.0008505, q1 = 0.0432139, q4 = 3.487e-6;
    t1 = 2.0 * (q14 * csin(v) - q94 * csin(3.0 * v));
    t2 = 2.0 * (q14 * ccos(v) + q94 * ccos(3.0 * v));
    t3 = vec2(1.0, 0.0) + 2.0 * (q1 * ccos(2.0 * v) + q4 * ccos(4.0 * v));
    t4 = vec2(1.0, 0.0) + 2.0 * (-q1 * ccos(2.0 * v) + q4 * ccos(4.0 * v));
}
// sn and dn wallpapers (other poles and zeros than cn), values turned with time.
vec2 tJacobiWall(vec2 uv, vec2 c, float scale, int which, float t)
{
    vec2 z = (uv - c) * scale * 1.8540747;
    vec2 t1, t2, t3, t4;
    thetaAll(z * 0.8472131, t1, t2, t3, t4);
    vec2 f = which == 0 ? cdiv(t1, t4) * 1.1803 : cdiv(t3, t4) * 0.8409;   // sn: th3(0)/th2(0); dn: th4(0)/th3(0)
    return c + cmul(f, cexpi(t * 0.3)) * 0.3;
}
// Hyperbolic Moebius flow: two fixed points on the unit circle, the picture
// streaming from one to the other along circular arcs (flow parameter = time).
vec2 tHypFlow(vec2 uv, vec2 c, float a, float t)
{
    vec2 z = (uv - c) * 2.0;
    vec2 p = cexpi(a), q = -p;
    vec2 w = cdiv(z - p, z - q);                                 // fixed points to 0 and infinity
    float lr = 0.5 * log(max(dot(w, w), 1e-10)) - t, an = atan(w.y, w.x);
    return vec2(lr * 0.5, an / 3.14159265 * 2.0);                 // log-polar of the flow: seamless (angle jumps by 4)
}
// Wandering poles: sum of k / (z - p_k) -- a rational map, flowers around every pole.
vec2 tPoles(vec2 uv, vec2 c, float n, float t)
{
    vec2 z = (uv - c) * 2.0, f = vec2(0.0);
    for (int k = 0; k < 5; ++k) {
        if (float(k) >= n) break;
        float fk = float(k);
        vec2 pk = 0.7 * vec2(sin(t * (0.21 + 0.05 * fk) + fk * 1.9), cos(t * (0.17 + 0.04 * fk) + fk * 2.7));
        f += cdiv(cexpi(fk * 1.3), z - pk) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0);
    }
    return c + f * 0.12;
}
// Bipolar Droste: the spiral Droste between two holes (log of the cross-ratio).
vec2 tBiDroste(vec2 uv, vec2 c, float f, float K, float zoom)
{
    vec2 w = cdiv(uv - c + vec2(f, 0.0), uv - c - vec2(f, 0.0));
    vec2 L = vec2(0.5 * log(max(dot(w, w), 1e-10)), atan(w.y, w.x));
    float lk = log(K), b = -lk / 3.14159265;
    vec2 W = vec2(L.x - b * L.y, L.y + b * L.x);
    float tri = abs(fract((W.x / lk - zoom) * 0.5) * 2.0 - 1.0);
    return c + exp(tri * lk - lk) * cexpi(W.y) * 0.45;
}
// Hyperbolic spiral r = a / theta: a tunnel whose rings are wound.
vec2 tHypSpiral(vec2 uv, vec2 c, float a, float wind, float travel)
{
    vec2 d = uv - c;
    float an = atan(d.y, d.x) / 3.14159265;
    return vec2(a / max(length(d), 1e-3) + an * wind - travel, an * 2.0);
}
// Riemann zeta, partial sum of n^-s: a few rotating spirals interfering.
vec2 tZeta(vec2 uv, vec2 c, float terms, float t)
{
    vec2 sv = (uv - c) * vec2(2.0, 14.0) + vec2(0.5, t);
    vec2 f = vec2(0.0);
    for (int n = 1; n <= 7; ++n) {
        if (float(n) > terms) break;
        float ln = log(float(n));
        f += exp(-sv.x * ln) * cexpi(-sv.y * ln);
    }
    return c + f * 0.2;
}
// Mandelbrot parameter map: z = 0, z <- z^2 + (the point), a few times.
vec2 tMandel(vec2 uv, vec2 c, float steps, float t)
{
    vec2 k = (uv - c) * 2.2 + vec2(-0.5, 0.0) + 0.1 * cexpi(t * 0.2);
    vec2 z = vec2(0.0);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; z = cmul(z, z) + k; }
    return c + z * 0.3;
}
// Burning ship: |Re| and |Im| before squaring (the mirror makes the ship).
vec2 tShip(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.2, k = vec2(-0.4, -0.55) + 0.12 * cexpi(t * 0.2);
    for (int i = 0; i < 4; ++i) { if (float(i) >= steps) break; z = abs(z); z = cmul(z, z) + k; }
    return c + z * 0.3;
}
// Phoenix Julia: z_{n+1} = z^2 + k + p z_{n-1} (a memory term).
vec2 tPhoenix(vec2 uv, vec2 c, float steps, float t)
{
    vec2 z = (uv - c) * 2.2, zp = vec2(0.0);
    vec2 k = vec2(0.5667, 0.0) + 0.05 * cexpi(t * 0.2), pp = vec2(-0.5, 0.0);
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= steps) break;
        vec2 zn = cmul(z, z) + k + cmul(pp, zp);
        zp = z; z = zn;
    }
    return c + z * 0.3;
}
// Parabolic coordinates (sigma, tau): nested parabolas, mirror-folded.
vec2 tParabCoords(vec2 uv, vec2 c, float k, float travel)
{
    vec2 d = (uv - c) * k;
    float r = length(d);
    float sg = sqrt(max(r + d.x, 0.0)), ta = sqrt(max(r - d.x, 0.0));
    return vec2(sg - travel, ta);
}
// Cardioid coordinates: sqrt(1 - 4z) with the angle mirrored (the main bulb of
// the Mandelbrot set unrolled).
vec2 tCardioid(vec2 uv, vec2 c, float k, float t)
{
    vec2 z = (uv - c) * k;
    vec2 w = vec2(1.0, 0.0) - 4.0 * z;
    float r = sqrt(length(w)), a = abs(atan(w.y, w.x)) * 0.5;
    return c + r * cexpi(a + t * 0.2) * 0.35;
}
// Sunflower: two log-spiral families crossed (the parastichies of a seed head).
vec2 tSunflower(vec2 uv, vec2 c, float m1, float m2, float zoom)
{
    vec2 d = uv - c;
    float lr = log(max(length(d), 1e-5)) * 1.5 - zoom, an = atan(d.y, d.x) / 3.14159265;
    return vec2(lr + an * m1, lr - an * m2);
}
// Breathing sphere: the Riemann sphere bulged by a spherical harmonic, turning.
vec2 tBreathSphere(vec2 uv, vec2 c, float m, float t)
{
    vec2 z = (uv - c) * 2.2;
    float s = dot(z, z);
    vec3 P = vec3(2.0 * z, s - 1.0) / (s + 1.0);
    P.xz = rot2(t * 0.3) * P.xz;
    float ph = atan(P.y, P.x), th = acos(clamp(P.z, -1.0, 1.0));
    float Y = pow(sin(th), m) * cos(m * ph + t);
    P *= 1.0 + 0.35 * Y;
    return c + P.xy / max(1.3 - P.z, 0.05) * 0.5;
}
// Cayley transform: the upper half-plane to the disk (and back out again).
vec2 tCayley(vec2 uv, vec2 c, float k)
{
    vec2 w = (uv - c) * k;
    return c + cdiv(w - vec2(0.0, 1.0), w + vec2(0.0, 1.0)) * 0.45;
}
// Fisheye / barrel: radius raised to a drifting power.
vec2 tFisheye(vec2 uv, vec2 c, float e)
{
    vec2 d = uv - c;
    float r = length(d);
    return c + d * pow(max(r, 1e-4) * 1.6, e - 1.0);
}
// Curved kaleidoscope: a kaleidoscope in hyperbolic-disk coordinates -- its
// mirrors are circular arcs (the fold conjugated by a moving disk automorphism).
vec2 tCurvedKaleido(vec2 uv, vec2 c, float sides, float rot, vec2 a)
{
    vec2 z = (uv - c) * 1.6;
    vec2 w = cdiv(z - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z));
    float sec = 6.2831853 / sides;
    float an = abs(mod(atan(w.y, w.x), sec) - 0.5 * sec) + rot;
    w = length(w) * cexpi(an);
    z = cdiv(w + a, vec2(1.0, 0.0) + cmul(vec2(a.x, -a.y), w));
    return c + z / 1.6;
}
// Levy C-curve fold: turn 45 deg, scale sqrt 2, mirror -- repeated.
vec2 tLevy(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    float sc = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p = rot2(0.7853982) * p * 1.4142136; sc *= 1.4142136;
        p.x = abs(p.x) - 0.7;
    }
    return c + p / sc * 1.2;
}
// Pythagoras-tree fold: mirror, turn 45 deg about the branch point, scale sqrt 2.
vec2 tPythagoras(vec2 uv, vec2 c, float iters, float bend)
{
    vec2 p = (uv - c) * 2.5 + vec2(0.0, 0.8);
    float sc = 1.0;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p.x = abs(p.x);
        p -= vec2(0.0, 1.0);
        p = rot2(0.7853982 + bend) * p * 1.4142136; sc *= 1.4142136;
    }
    return c + p / sc * 0.9;
}
// Vicsek (cross) fold: abs, sort, scale 3 about the arm.
vec2 tVicsek(vec2 uv, vec2 c, float iters, float turn)
{
    vec2 p = rot2(turn) * (uv - c) * 2.0;
    float sc = 1.0;
    for (int i = 0; i < 4; ++i) {
        if (float(i) >= iters) break;
        p = abs(p);
        if (p.x < p.y) p = p.yx;
        p = p * 3.0 - vec2(2.0, 0.0); sc *= 3.0;
    }
    return c + p / sc * 1.5;
}
// ---- multigrid quasicrystals (de Bruijn): N line families at pi/N ----
// N = 4: Ammann-Beenker (8-fold), N = 5: Penrose (10-fold), N = 6: 12-fold,
// N = 7: 14-fold.  As penroseFind, for any N (up to 7).
vec2 gridE(int j, float N) { float a = 3.14159265 * float(j) / N; return vec2(cos(a), sin(a)); }
float gridG(int j) { return fract(0.1234 + 0.6180339 * float(j)) - 0.5; }
bool multiGridFind(vec2 x, float N, out vec2 ab, out int rr, out int ss, out vec2 base, out vec2 nrs)
{
    vec2 pg = x * 2.0 / N;
    ab = vec2(0.5); rr = 0; ss = 1; base = vec2(0.0); nrs = vec2(0.0);
    for (int r = 0; r < 6; ++r) {
        if (float(r) >= N - 1.0) break;
        for (int s = 1; s < 7; ++s) {
            if (s <= r || float(s) >= N) continue;
            vec2 er = gridE(r, N), es = gridE(s, N);
            float gr = gridG(r), gs = gridG(s);
            float det = er.x * es.y - er.y * es.x;
            float nr0 = floor(dot(pg, er) + gr), ns0 = floor(dot(pg, es) + gs);
            for (int dr = -1; dr <= 1; ++dr)
            for (int ds = -1; ds <= 1; ++ds) {
                float nr = nr0 + float(dr), ns = ns0 + float(ds);
                vec2 p = vec2((nr - gr) * es.y - (ns - gs) * er.y, (ns - gs) * er.x - (nr - gr) * es.x) / det;
                vec2 b0 = nr * er + ns * es;
                for (int j = 0; j < 7; ++j) {
                    if (float(j) >= N) break;
                    if (j != r && j != s) b0 += ceil(dot(p, gridE(j, N)) + gridG(j)) * gridE(j, N);
                }
                vec2 d = x - b0;
                float a = (d.x * es.y - d.y * es.x) / det, b = (er.x * d.y - er.y * d.x) / det;
                if (a >= 0.0 && a <= 1.0 && b >= 0.0 && b <= 1.0) {
                    ab = vec2(a, b); rr = r; ss = s; base = b0; nrs = vec2(nr, ns);
                    return true;
                }
            }
        }
    }
    return false;
}
vec2 tQuasiMirror(vec2 uv, vec2 c, float N, float cells, vec2 drift)
{
    vec2 ab, base, nrs; int r, s;
    multiGridFind((uv - c) * cells + drift, N, ab, r, s, base, nrs);
    vec2 f = min(ab, 1.0 - ab);
    return c + vec2(min(f.x, f.y), max(f.x, f.y)) * 0.9;
}
// ---- flows (stage D): smooth displacements ----
// Karman street: vortices of alternating spin shed from an obstacle, drifting
// downstream and fading in and out (no vortex ever appears or vanishes at once).
vec2 tKarman(vec2 uv, float strength, float t)
{
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        float ph = fract(t * 0.08 + fk / 6.0);                   // life 0..1, positions wrap while invisible
        vec2 pk = vec2(-0.1 + 1.2 * ph, 0.5 + (mod(fk, 2.0) < 0.5 ? 0.12 : -0.12));
        float life = sin(3.14159265 * ph);
        vec2 d = uv - pk;
        float g = strength * life * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) * exp(-dot(d, d) / 0.02);
        uv = pk + rot2(g) * d;
    }
    return uv;
}
// Flow round a cylinder with circulation (potential flow), as a displacement.
vec2 tCylinderFlow(vec2 uv, vec2 c, float strength, float circ)
{
    vec2 z = (uv - c) * 4.0;
    float r2 = max(dot(z, z), 0.36);
    vec2 zi = cdiv(vec2(1.0, 0.0), cmul(z, z));
    vec2 vel = vec2(1.0, 0.0) - zi + circ * vec2(-z.y, z.x) / r2;   // conj(dw/dz)
    return uv + strength * vec2(vel.x, -vel.y) * 0.03 * smoothstep(0.36, 1.0, dot(z, z));
}
// Dipole field lines as a displacement.
vec2 tDipole(vec2 uv, vec2 c, float strength, float t)
{
    vec2 d = (uv - c) * 3.0;
    vec2 m = cexpi(t * 0.3);
    float r2 = max(dot(d, d), 0.05);
    vec2 B = (3.0 * dot(m, d) * d / r2 - m) / (r2 * sqrt(r2));
    return uv + strength * B / (1.0 + length(B)) * 0.04;
}
// Two vortices orbiting each other.
vec2 tVortexPair(vec2 uv, vec2 c, float strength, float t)
{
    for (int k = 0; k < 2; ++k) {
        vec2 pk = c + 0.18 * cexpi(t * 0.5 + 3.14159265 * float(k));
        vec2 d = uv - pk;
        uv = pk + rot2(strength * exp(-dot(d, d) / 0.04)) * d;
    }
    return uv;
}
// Interference of two wave sources: displaced along the wave field's gradient.
vec2 tInterference(vec2 uv, float k, float strength, float t)
{
    vec2 s1 = vec2(0.3, 0.5) + 0.1 * cexpi(t * 0.2), s2 = vec2(0.7, 0.5) - 0.1 * cexpi(t * 0.23);
    vec2 d1 = uv - s1, d2 = uv - s2;
    float r1 = max(length(d1), 1e-3), r2 = max(length(d2), 1e-3);
    vec2 g = cos(r1 * k - t * 3.0) * d1 / r1 + cos(r2 * k - t * 3.0) * d2 / r2;
    return uv + strength * g * 0.01;
}
// Kelvin-Helmholtz: a shear layer rolling up into a row of billows.
vec2 tKelvinHelmholtz(vec2 uv, float strength, float t)
{
    float y = uv.y - 0.5;
    float roll = exp(-y * y / 0.02);
    vec2 cellc = vec2(floor(uv.x * 4.0 + t * 0.2) + 0.5 - t * 0.2, 2.0) / 4.0;   // billow centres drift
    float a = strength * roll * sin(6.2831853 * (uv.x * 4.0 + t * 0.2));
    return uv + vec2(0.04 * strength * tanh(y * 10.0), 0.0) + 0.03 * vec2(-sin(a), cos(a) - 1.0) * roll;
}
'''
anchor = "// ---- idea round 4 ----"
assert s.count(anchor) == 1
s = s.replace(anchor, LIB2 + anchor)

# Farris p1, p2, pm, cm (kinds 10..13) on an oblique / rectangular lattice
old = "    if (kind == 6) return 0.5 * (hexWave3(X, n, m) + hexWave3(X, m, n));            // p3m1: p3 + mirrors\n"
assert s.count(old) == 1
s = s.replace(old, old + r'''    if (kind >= 10) {                                                                // p1, p2, pm, cm
        vec2 Z = kind == 13 ? X * vec2(0.8, 1.3) : vec2(X.x + 0.3 * X.y, X.y * 1.1);       // oblique / centred lattice
        vec2 w = cexpi(TAU * (n * Z.x + m * Z.y));
        if (kind == 11) w += cexpi(-TAU * (n * Z.x + m * Z.y));                         // p2: half-turns
        if (kind == 12 || kind == 13) w += cexpi(TAU * (n * Z.x - m * Z.y));            // pm / cm: one mirror
        return w / (kind == 10 ? 1.0 : 2.0);
    }
''')

# 3D library additions
LIB3 = r'''// ---- round 5 (3D) ----
// Upper half-space model of hyperbolic space (height = |y|): the lattice
// shrinks without end toward the floor plane, its scale falling as 1/h.
vec3 fHalfSpace(vec3 p, float c)
{
    float h = abs(p.y) + 0.35;
    gDR *= 1.0 / h;
    return vec3(p.x / h, log(h) * 1.6, p.z / h);
}
// Log-cylindrical Droste: the distance to the flight axis folded in log scale.
vec3 fLogCyl(vec3 p, float K)
{
    float rho = max(length(p.xy), 1e-3), lk = log(K);
    float tri = abs(fract(log(rho) / lk * 0.5) * 2.0 - 1.0);
    float rn = exp(tri * lk) * 0.8;
    gDR *= max(rn / rho, 1e-3);
    return vec3(p.xy / rho * rn, p.z * rn / rho);
}
float sdSuperquad(vec3 p, float r, float e)
{
    vec3 a = pow(abs(p) / r, vec3(e));
    return (pow(a.x + a.y + a.z, 1.0 / e) - 1.0) * r * 0.7;
}
float sdNeovius(vec3 p, float th) { vec3 c = cos(p); return (abs(3.0 * (c.x + c.y + c.z) + 4.0 * c.x * c.y * c.z) - th) / 9.0; }
float sdLidinoid(vec3 p, float th)
{
    vec3 s2 = sin(2.0 * p), c = cos(p), s = sin(p), c2 = cos(2.0 * p);
    float f = 0.5 * (s2.x * c.y * s.z + s2.y * c.z * s.x + s2.z * c.x * s.y) - 0.5 * (c2.x * c2.y + c2.y * c2.z + c2.z * c2.x) + 0.15;
    return (abs(f) - th) / 3.0;
}
'''
anchor = "// Twist around z (keep k small: it stretches space)."
s = s.replace(anchor, LIB3 + anchor)
io.open(g, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
