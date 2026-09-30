# -*- coding: utf-8 -*-
"""One-off patch (30.09.): Penrose rhombus tiling by de Bruijn's pentagrid --
a shared library function, the chain class 'Penrose mirror' (stage B)."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))

LIB = r'''// ---- Penrose rhombus tiling (de Bruijn's pentagrid) ----
// Five families of parallel lines (directions e_j = 72 deg apart, offsets
// gam_j with sum 0).  Every crossing of a line of family r (value n_r) with
// one of family s (n_s) is a rhombus with edges e_r, e_s; its corner is
// sum_j K_j e_j with K_j = ceil(p . e_j + gam_j) at the crossing p, and K_r,
// K_s = n_r, n_s.  The tiling is about 5/2 times the pentagrid, so the
// crossings near x * 0.4 are searched (3 x 3 per pair of families).  Returns
// the rhombus coordinates a, b in [0, 1] (x = base + a e_r + b e_s).
vec2 pentE(int j) { float a = 1.2566371 * float(j); return vec2(cos(a), sin(a)); }
float pentG(int j, vec4 g) { return j == 0 ? g.x : j == 1 ? g.y : j == 2 ? g.z : j == 3 ? g.w : -(g.x + g.y + g.z + g.w); }
bool penroseFind(vec2 x, vec4 g, out vec2 ab, out int rr, out int ss, out vec2 base, out vec2 nrs)
{
    vec2 pg = x * 0.4;
    ab = vec2(0.5); rr = 0; ss = 1; base = vec2(0.0); nrs = vec2(0.0);
    for (int r = 0; r < 4; ++r)
    for (int s = 1; s < 5; ++s) {
        if (s <= r) continue;
        vec2 er = pentE(r), es = pentE(s);
        float gr = pentG(r, g), gs = pentG(s, g);
        float det = er.x * es.y - er.y * es.x;
        float nr0 = floor(dot(pg, er) + gr), ns0 = floor(dot(pg, es) + gs);
        for (int dr = -1; dr <= 1; ++dr)
        for (int ds = -1; ds <= 1; ++ds) {
            float nr = nr0 + float(dr), ns = ns0 + float(ds);
            vec2 p = vec2((nr - gr) * es.y - (ns - gs) * er.y, (ns - gs) * er.x - (nr - gr) * es.x) / det;
            vec2 b0 = nr * er + ns * es;
            for (int j = 0; j < 5; ++j)
                if (j != r && j != s) b0 += ceil(dot(p, pentE(j)) + pentG(j, g)) * pentE(j);
            vec2 d = x - b0;
            float a = (d.x * es.y - d.y * es.x) / det, b = (er.x * d.y - er.y * d.x) / det;
            if (a >= 0.0 && a <= 1.0 && b >= 0.0 && b <= 1.0) {
                ab = vec2(a, b); rr = r; ss = s; base = b0; nrs = vec2(nr, ns);
                return true;
            }
        }
    }
    return false;
}
// Penrose mirror: the rhombus coordinates folded symmetrically -- distances to
// the nearer edge of each pair, sorted.  On a shared edge both tiles give the
// same pair (0, position along the edge, folded), so the map is continuous:
// a quasi-periodic kaleidoscope that never repeats.
vec2 tPenrose(vec2 uv, vec2 c, float cells, vec2 drift, vec4 g)
{
    vec2 ab, base, nrs; int r, s;
    penroseFind((uv - c) * cells + drift, g, ab, r, s, base, nrs);
    vec2 f = min(ab, 1.0 - ab);
    return c + vec2(min(f.x, f.y), max(f.x, f.y)) * 0.9;
}
'''
g = os.path.join(SP, "gen.py")
s = io.open(g, encoding="utf-8").read()
anchor = "// ---- idea round 3 ----"
assert s.count(anchor) == 1
s = s.replace(anchor, LIB + anchor)
io.open(g, "w", encoding="utf-8", newline="\n").write(s)

def ifchain(name, vals, note):
    return "int %s(int i) { %s return %d; }   // %s" % (
        name, " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])), vals[-1], note)
p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
i = s.index("int ordb(int i)"); j = s.index("\n", i)
s = s[:i] + ifchain("ordb", [0, 5, 3, 1, 8, 2, 7, 4, 6], "none, mirror line, p4m, kaleidoscope, Penrose, p6m, Sierpinski, fold, Apollonian") + s[j:]
s = s.replace("    k = ordb(k);\n", "    k = ordb(k);\n    if (k == 8) return tPenrose(uv, gCw, 3.0 + 2.0 * v, vec2(gT * 0.7, gT * 0.3), vec4(0.13, 0.27, -0.21, 0.36));\n", 1)
for pat in ["chainBP, 8)", "walkB.x, 8)", "walkB.y, 8)"]:
    assert pat in s, pat
    s = s.replace(pat, pat.replace(", 8)", ", 9)"))
s = re.sub(r"walkPick\(c( \+ 1\.0)?, k0, v0, 8, 2\.9", lambda m: m.group(0).replace(", 8, ", ", 9, "), s)
s = s.replace("iterated fold, mirror line, Apollonian inversion fold)", "iterated fold, mirror line, Apollonian inversion fold,\n * Penrose mirror)")
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
q = os.path.join(SP, "promote_likes.py")
t = io.open(q, encoding="utf-8").read()
t = t.replace('"chainBP": [None, "mirror line", "p4m lattice", "kaleidoscope", "p6m lattice",', '"chainBP": [None, "mirror line", "p4m lattice", "kaleidoscope", "Penrose mirror", "p6m lattice",')
io.open(q, "w", encoding="utf-8", newline="\n").write(t)
a = os.path.join(SP, "lab_audit.py")
t = io.open(a, encoding="utf-8").read().replace('"chainBP": 8,', '"chainBP": 9,')
io.open(a, "w", encoding="utf-8", newline="\n").write(t)
print("ok")
