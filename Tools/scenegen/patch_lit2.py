# -*- coding: utf-8 -*-
"""One-off patch (30.09., literature round 2): Peirce quincuncial sphere
(Jacobi cn by theta series), Apollonian inversion fold (Kleinian-style limit
sets, continuous), Farris rosettes with colour turning."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

LIB = r'''// ---- Peirce quincuncial: the plane as a square-tiled sphere ----
// cn(u; m = 1/2) is doubly periodic on a square lattice (its periods 4K and
// 2K + 2iK, with K = K' = 1.8540747) and maps each square onto the Riemann
// sphere: Peirce's quincuncial projection, inverted.  For m = 1/2 the theta
// nome is q = exp(-pi), so three terms of each series are exact to float
// precision.  cn = (th4(0)/th2(0)) * th2(v) / th4(v), v = pi u / (2K).
vec2 csin(vec2 a) { return vec2(sin(a.x) * cosh(a.y), cos(a.x) * sinh(a.y)); }
vec2 ccos(vec2 a) { return vec2(cos(a.x) * cosh(a.y), -sin(a.x) * sinh(a.y)); }
void cnTheta(vec2 v, out vec2 N, out vec2 D)
{
    // reduce by the periods (2 pi and pi + i pi in v): the series stay small
    float n = floor(v.y / 3.14159265 + 0.5);
    v -= n * vec2(3.14159265, 3.14159265);
    v.x = mod(v.x + 3.14159265, 6.2831853) - 3.14159265;
    const float q14 = 0.4559381, q94 = 0.0008505, q254 = 1.6e-9;   // q^(1/4), q^(9/4), q^(25/4)
    const float q1 = 0.0432139, q4 = 3.487e-6;                       // q, q^4
    vec2 th2 = 2.0 * (q14 * ccos(v) + q94 * ccos(3.0 * v) + q254 * ccos(5.0 * v));
    vec2 th4 = vec2(1.0, 0.0) + 2.0 * (-q1 * ccos(2.0 * v) + q4 * ccos(4.0 * v));
    N = th2 * (1.0 - 2.0 * q1 + 2.0 * q4) / (2.0 * (q14 + q94 + q254));   // th4(0) / th2(0)
    D = th4;
}
// The picture on a turning sphere, seen through Peirce's square tiling.  The
// sphere point is lifted from N/D without dividing (poles are harmless), turned
// about two axes, and projected back stereographically.
vec2 tQuincunx(vec2 uv, vec2 c, float scale, float a1, float a2)
{
    vec2 z = (uv - c) * scale * 1.8540747;
    z = vec2(z.x - z.y, z.x + z.y) * 0.7071068;                  // squares upright
    vec2 N, D;
    cnTheta(z * 0.8472131, N, D);                                // pi / (2K)
    vec2 ND = vec2(N.x * D.x + N.y * D.y, N.y * D.x - N.x * D.y);   // N * conj(D)
    float nn = dot(N, N), dd = dot(D, D);
    vec3 P = vec3(2.0 * ND, nn - dd) / max(nn + dd, 1e-12);
    P.yz = rot2(a1) * P.yz;
    P.xy = rot2(a2) * P.xy;
    return c + P.xy / max(1.0 - P.z, 1e-3) * 0.4;
}
// Apollonian inversion fold: mirrored repetition and inversion in the unit
// circle, alternating -- the circle packings and limit-set lace of Kleinian
// groups (Indra's Pearls), built only from continuous steps (a mirrored
// triangle wave instead of the usual fract, an unconditional inversion).
vec2 tApollo(vec2 uv, vec2 c, float s, float iters)
{
    vec2 p = (uv - c) * 2.2;
    for (int i = 0; i < 6; ++i) {
        if (float(i) >= iters) break;
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0) * 2.0 - 1.0;   // mirrored repeat, period 4 (continuous)
        p *= s / max(dot(p, p), 1e-3);
    }
    return c + p * 0.25;
}
// Farris rosettes: sums of z^n conj(z)^m with n - m = k (mod p) -- p-fold
// rosettes; with k = 1 the pattern has COLOUR TURNING: turning the plane by
// 2 pi / p turns the picture looked up by the same step, so the photo's
// colours travel round the rosette.  Coefficients turn with time.
vec2 rosetteTerm(float r, float th, float d, float e) { return pow(r, e) * vec2(cos(d * th), sin(d * th)); }
vec2 tRosette(vec2 uv, vec2 c, float p, float k, float t)
{
    vec2 d0 = (uv - c) * 1.7;
    float r = length(d0), th = atan(d0.y, d0.x);
    float d1 = k + p, d2 = k - p;
    vec2 f = cmul(cexpi(t * 0.6), rosetteTerm(r, th, d1, abs(d1)))
           + cmul(cexpi(-t * 0.4 + 1.0), rosetteTerm(r, th, d2, abs(d2))) * 0.8
           + cmul(cexpi(t * 0.3 + 2.0), rosetteTerm(r, th, k, abs(k) + 2.0)) * 0.6;
    return c + f * 0.3;
}
'''

g = os.path.join(SP, "gen.py")
s = io.open(g, encoding="utf-8").read()
anchor = "// Blossom: the radius swells and shrinks with the angle, n whole petals."
assert s.count(anchor) == 1
# the rosette needs cmul/cexpi (defined with Farris, which comes before the blossom? put LIB after tFarris)
fa = s.index("vec2 tFarris(vec2 uv, vec2 c, int kind, float cells, float t)")
fe = s.index("\n}\n", fa) + 3
s = s[:fe] + LIB + s[fe:]
io.open(g, "w", encoding="utf-8", newline="\n").write(s)

def ifchain(name, vals, note):
    return "int %s(int i) { %s return %d; }   // %s" % (
        name, " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])), vals[-1], note)

p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
for name, vals, note in [("orda", [11, 5, 14, 4, 16, 9, 15, 1, 12, 17, 6, 10, 7, 8, 3, 13, 0, 2], "11 none, 17 Peirce quincunx"),
                         ("ordb", [0, 5, 3, 1, 2, 4, 6], "none, mirror line, p4m, kaleidoscope, p6m, fold, Apollonian"),
                         ("ordc", [0, 5, 8, 9, 7, 1, 4, 3, 6, 2], "none, lens, blossom, rosette, Joukowski, spiral, square, inversion, kaleidoscope, tunnel")]:
    i = s.index("int %s(int i)" % name); j = s.index("\n", i)
    s = s[:i] + ifchain(name, vals, note) + s[j:]
s = s.replace("    k = orda(k);\n", "    k = orda(k);\n    if (k == 17) return tQuincunx(uv, gCw, 1.2 + 0.8 * v, 0.5 * sin(gT * 0.37) + v * 2.0, gT * 0.5 + gRot);\n", 1)
s = s.replace("    k = ordb(k);\n", "    k = ordb(k);\n    if (k == 6) return tApollo(uv, gCw, 1.05 + 0.25 * v + 0.1 * sin(gT * 0.3), 3.0 + floor(v * 2.99));\n", 1)
s = s.replace("    k = ordc(k);\n", "    k = ordc(k);\n    if (k == 9) return tRosette(uv, gCw, 3.0 + floor(v * 5.99), fract(v * 6.0) < 0.5 ? 0.0 : 1.0, gT * 1.5);\n", 1)
for knob, walk, salt, n0, n1 in [("chainAP", "walkA", "1.3", 17, 18), ("chainBP", "walkB", "2.9", 6, 7), ("chainCP", "walkC", "4.7", 9, 10)]:
    for pat in ["%s, %d)" % (knob, n0), "%s.x, %d)" % (walk, n0), "%s.y, %d)" % (walk, n0)]:
        assert pat in s, pat
        s = s.replace(pat, pat.replace(", %d)" % n0, ", %d)" % n1))
    s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, %d, %s" % (n0, re.escape(salt)),
               lambda m: m.group(0).replace(", %d, " % n0, ", %d, " % n1), s)
s = s.replace("Farris wallpaper\n * functions, the hyperbolic band, Escher's spiral Droste)",
              "Farris wallpaper\n * functions, the hyperbolic band, Escher's spiral Droste, Peirce's quincuncial\n * sphere)")
s = s.replace("iterated fold, mirror line)", "iterated fold, mirror line, Apollonian inversion fold)")
s = s.replace("Joukowski, blossom)", "Joukowski, blossom, Farris rosette)")
io.open(p, "w", encoding="utf-8", newline="\n").write(s)

q = os.path.join(SP, "promote_likes.py")
t = io.open(q, encoding="utf-8").read()
t = t.replace('"log-polar spiral", "rotating Riemann sphere",', '"log-polar spiral", "rotating Riemann sphere", "Peirce quincuncial sphere",')
t = t.replace('"chainBP": [None, "mirror line", "p4m lattice", "kaleidoscope", "p6m lattice", "iterated fold"],',
              '"chainBP": [None, "mirror line", "p4m lattice", "kaleidoscope", "p6m lattice", "iterated fold", "Apollonian inversion fold"],')
t = t.replace('"chainCP": [None, "lens", "blossom", "Joukowski map",', '"chainCP": [None, "lens", "blossom", "Farris rosette", "Joukowski map",')
io.open(q, "w", encoding="utf-8", newline="\n").write(t)
a = os.path.join(SP, "lab_audit.py")
t = io.open(a, encoding="utf-8").read().replace('"chainAP": 17, "chainBP": 6, "chainCP": 9,', '"chainAP": 18, "chainBP": 7, "chainCP": 10,')
io.open(a, "w", encoding="utf-8", newline="\n").write(t)
print("ok")
