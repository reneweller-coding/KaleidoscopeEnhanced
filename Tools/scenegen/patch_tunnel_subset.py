# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the tunnel lab evaluates its chain in every march
step (~100 chains per pixel); the iterating classes (fractal maps, chaotic
maps, hyperbolic and quasicrystal folds, wave sums) made it register-bound
(28-46 fps).  The tunnel gets its own class subset: TUNNEL_EXCLUDE in
chain_classes.py; make_chainlabtunnel.py drops those branches and renumbers the
energy order, gen.py writes the matching names for the overlay (key v)."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
cc = os.path.join(SP, "chain_classes.py")
s = io.open(cc, encoding="utf-8").read()
assert "TUNNEL_EXCLUDE" not in s
s += '''
# Classes the tunnel lab leaves out: they iterate (loops per pixel), and the
# tunnel runs its chain in every march step -- with them it fell to ~30 fps.
TUNNEL_EXCLUDE = {
    "chainAP": {"hyperbolic Poincare tiling", "hyperbolic band", "hyperbolic half-plane", "hyperbolic Droste",
                "sphere kaleidoscope", "Peirce quincuncial sphere", "Jacobi cn wallpaper", "Jacobi sn/dn wallpaper",
                "Weierstrass p", "zeta partial sum", "Mandelbrot map", "burning ship", "Phoenix Julia", "Julia map",
                "cubic Julia", "Newton map", "magnet map", "Henon map", "Ikeda map", "Chirikov map", "Gumowski-Mira",
                "Zaslavsky web", "Klein invariants", "theta wave", "Blaschke product", "wandering poles",
                "Farris wallpaper", "Farris frieze", "quasicrystal"},
    "chainBP": {"Apollonian inversion fold", "Sierpinski fold", "Koch fold", "Levy C fold", "Pythagoras-tree fold",
                "Vicsek fold", "Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror",
                "modular group mirror", "Schottky mirror"},
    "chainCP": set(),
    "chainDP": {"Karman street", "vortex street", "curl flow", "domain warp", "double gyre", "Taylor-Green vortices"},
}
def tunnel_classes(knob):
    return [n for n in CLASSES[knob] if n not in TUNNEL_EXCLUDE.get(knob, set())]
'''
io.open(cc, "w", encoding="utf-8", newline="\n").write(s)

g = os.path.join(SP, "gen.py")
t = io.open(g, encoding="utf-8").read()
old = '''        from chain_classes import CLASSES as _CC
        for k, names in _CC.items():'''
assert t.count(old) == 1
t = t.replace(old, '''        import chain_classes as _ccm
        _CC = dict(_ccm.CLASSES)
        if "tunnelD(" in body:                                  # the tunnel lab's own subset
            for _k in ("chainAP", "chainBP", "chainCP", "chainDP"):
                _CC[_k] = _ccm.tunnel_classes(_k)
        for k, names in _CC.items():''')
io.open(g, "w", encoding="utf-8", newline="\n").write(t)

m = os.path.join(SP, "make_chainlabtunnel.py")
u = io.open(m, encoding="utf-8").read()
anchor = 'STAGES = STAGES[:STAGES.index("// Stage order: the four stages are not commutative")]\n'
assert u.count(anchor) == 1
u = u.replace(anchor, anchor + r'''# The tunnel's own class subset (chain_classes.TUNNEL_EXCLUDE): the excluded
# classes' branches are removed (their code alone -- even unexecuted -- costs
# registers in every march step) and the energy order renumbered.
import chain_classes as _cc
def _parse_ord(src, name):
    i = src.index("int %s(int i)" % name); j = src.index("\n", i)
    return [int(x) for x in re.findall(r"return (\d+);", src[i:j])], i, j
def _drop_branches(src, fn, ids):
    i = src.index("vec2 %s(vec2 uv, int k, float v)" % fn); j = src.index("\n}\n", i)
    lines = src[i:j].split("\n"); out = []; k = 0
    while k < len(lines):
        l = lines[k]; mm = re.match(r"\s*if \(k == (\d+)\)", l)
        if mm and int(mm.group(1)) in ids:
            depth = l.count("{") - l.count("}"); k += 1
            while depth > 0 and k < len(lines):
                depth += lines[k].count("{") - lines[k].count("}"); k += 1
            continue
        out.append(l); k += 1
    return src[:i] + "\n".join(out) + src[j:]
for _knob, _fn, _stage, _walk, _salt in [("chainAP", "orda", "stageAk", "walkA", "1.3"), ("chainBP", "ordb", "stageBk", "walkB", "2.9"),
                                          ("chainCP", "ordc", "stageCk", "walkC", "4.7"), ("chainDP", "ordd", "stageDk", "walkD", "6.1")]:
    _o, _i, _j = _parse_ord(STAGES, _fn)
    _names = _cc.CLASSES[_knob]
    assert len(_o) == len(_names), _knob
    _drop = {_o[p] for p, n in enumerate(_names) if n in _cc.TUNNEL_EXCLUDE[_knob]}
    _keep = [x for x in _o if x not in _drop]
    STAGES = STAGES[:_i] + "int %s(int i) { %s return %d; }   // tunnel subset, %d classes" % (
        _fn, " ".join("if (i == %d) return %d;" % (p, x) for p, x in enumerate(_keep[:-1])), _keep[-1], len(_keep)) + STAGES[_j:]
    STAGES = _drop_branches(STAGES, _stage, _drop)
    n0, n1 = len(_o), len(_keep)
    for _pat in ["%s, %d)" % (_knob, n0), "%s.x, %d)" % (_walk, n0), "%s.y, %d)" % (_walk, n0)]:
        assert _pat in STAGES, _pat
        STAGES = STAGES.replace(_pat, _pat.replace(", %d)" % n0, ", %d)" % n1))
    STAGES, _nw = re.subn(r"walkPick\(c( \+ 1\.0)?, k0, v0, %d, %s" % (n0, re.escape(_salt)),
                          lambda mm: mm.group(0).replace(", %d, " % n0, ", %d, " % n1), STAGES)
    assert _nw == 2, (_knob, _nw)
''')
io.open(m, "w", encoding="utf-8", newline="\n").write(u)
print("ok")
