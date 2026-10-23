# -*- coding: utf-8 -*-
"""One-off patch (23.10.2026, round 7): 40 more transforms for the flat chain labs.
2D A (+14): Tinkerbell, Lozi, Hopalong, gingerbreadman, Bogdanov, lemniscate coordinates, Schwarz-Christoffel
  hexagon, rose fold, epitrochoid unrolling, modular lambda, Ford inversion, square-root sheet, gamma poles,
  spherical-harmonic fault
2D B (+10): Heighway dragon fold, Gosper flake fold, Fibonacci-word mirror, Thue-Morse mirror, Cantor mirror, tent-map
  fold, cat-map fold, KIFS triangle fold, Whitney cusp fold, polar tent fold
2D C (+8): cylinder lens, axicon, Fresnel step lens, compound eye, Luneburg lens, Maxwell fish eye, Veselago lens, mirage
2D D (+8): Langmuir cells, Ekman spiral, capillary ring waves, KdV solitons, Airy packet, Kida vortex, Lamb-Oseen row,
  Faraday waves
(The list of the proposals of 23.10. named six mirror nets that are not reflection groups -- Cairo, snub square,
3.12.12, pgg, Hilbert -- and one that exists ({7,3}); they are replaced by folds that are continuous.)"""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))


def rd(p): return io.open(os.path.join(SP, p), encoding="utf-8", newline="").read()
def wr(p, s): io.open(os.path.join(SP, p), "w", encoding="utf-8", newline="").write(s)
def ifchain(name, vals, note):
    return "int %s(int i) { %s return %d; }   // %s" % (
        name, " ".join("if (i == %d) return %d;" % (k, v) for k, v in enumerate(vals[:-1])), vals[-1], note)
def parse_ord(src, name):
    i = src.index("int %s(int i)" % name); j = src.index("\n", i)
    return [int(x) for x in re.findall(r"return (\d+);", src[i:j])]
def insert_after(lst, after, new):
    i = lst.index(after); return lst[:i + 1] + [new] + lst[i + 1:]

NEW = {
 "chainAP": [
  (58, "Tinkerbell map", 49, "tTinkerbell(uv, gCw, 2.0 + floor(v * 1.99), gT)"),
  (59, "Lozi map", 49, "tLozi(uv, gCw, 3.0, gT)"),
  (60, "Hopalong map", 50, "tHopalong(uv, gCw, 0.6 + 0.8 * v, gT)"),
  (61, "gingerbreadman map", 51, "tGingerbread(uv, gCw, 0.8 + 0.4 * v, gT)"),
  (62, "Bogdanov map", 55, "tBogdanov(uv, gCw, 0.9 + 0.5 * v, gT)"),
  (63, "lemniscate coordinates", 52, "tLemniscate(uv, gCw, 0.35 + 0.25 * v, gT)"),
  (64, "Schwarz-Christoffel hexagon", 25, "tScHexagon(uv, gCw, 1.6 + 0.8 * v, gT)"),
  (65, "rose fold", 5, "tRoseFold(uv, gCw, 3.0 + floor(v * 5.99), gT)"),
  (66, "epitrochoid unrolling", 29, "tEpitrochoid(uv, gCw, 2.0 + floor(v * 3.99), gT)"),
  (67, "modular lambda function", 53, "tLambda(uv, gCw, 1.6 + 1.2 * v, gT)"),
  (68, "Ford circle inversion", 27, "tFord(uv, gCw, floor(v * 3.99), gT)"),
  (69, "square root sheet", 7, "tSqrtSheet(uv, gCw, 2.0 + 2.0 * v, gT)"),
  (70, "gamma function poles", 32, "tGammaPoles(uv, gCw, v * 2.0, gT)"),
  (71, "spherical harmonic fault", 26, "tHarmonicFault(uv, gCw, floor(v * 5.99), gT)"),
 ],
 "chainBP": [
  (23, "Heighway dragon fold", 11, "tDragonFold(uv, gCw, 4.0 + floor(v * 2.99), 0.2 * sin(gT * 0.3))"),
  (24, "Gosper flake fold", 9, "tGosperFold(uv, gCw, 2.0 + floor(v * 1.99), 0.2 * sin(gT * 0.3))"),
  (25, "Fibonacci-word mirror", 12, "tFibonacciMirror(uv, gCw, 3.0 + 2.0 * v, gRot + 0.3 + 0.2 * sin(gT * 0.2))"),
  (26, "Thue-Morse mirror", 13, "tThueMorseMirror(uv, gCw, 3.0 + 2.0 * v, gT)"),
  (27, "Cantor mirror", 7, "tCantorMirror(uv, gCw, 1.4 + 0.8 * v, gT)"),
  (28, "tent map fold", 5, "tTentFold(uv, gCw, 2.0 + floor(v * 1.99), gT)"),
  (29, "cat map fold", 4, "tCatFold(uv, gCw, 2.0 + floor(v * 1.99), gT)"),
  (30, "KIFS triangle fold", 6, "tKifsTriangle(uv, gCw, 3.0 + floor(v * 1.99), gT)"),
  (31, "Whitney cusp fold", 10, "tWhitneyCusp(uv, gCw, 1.0 + 1.5 * v, gT)"),
  (32, "polar tent fold", 22, "tPolarTent(uv, gCw, 1.0 + floor(v * 2.99), gT)"),
 ],
 "chainCP": [
  (18, "cylinder lens", 5, "tCylinderLens(uv, gCw, 0.4 + 0.8 * v, gRot + 0.3 * sin(gT * 0.3))"),
  (19, "axicon", 17, "tAxicon(uv, gCw, 0.15 + 0.15 * v, gT)"),
  (20, "Fresnel step lens", 19, "tFresnelStep(uv, gCw, 6.0 + 6.0 * v, gT)"),
  (21, "compound eye lens", 9, "tCompoundEye(uv, gCw, 5.0 + 5.0 * v, gT)"),
  (22, "Luneburg lens", 12, "tLuneburg(uv, gCw, 0.3 + 0.15 * v, gT)"),
  (23, "Maxwell fish eye", 22, "tMaxwell(uv, gCw, 0.3 + 0.15 * v, gT)"),
  (24, "Veselago lens", 5, "tVeselago(uv, gCw, 0.12 + 0.1 * v, gT)"),
  (25, "lower mirage", 15, "tMirage(uv, gCw, 0.6 + 0.8 * gSpread, gT)"),
 ],
 "chainDP": [
  (20, "Langmuir cells", 5, "tLangmuir(uv, 3.0 + floor(v * 3.99), 1.0 + gSpread, gT)"),
  (21, "Ekman spiral", 8, "tEkman(uv, 1.0 + 2.0 * v, 1.0 + gSpread, gT)"),
  (22, "capillary ring waves", 3, "tCapillary(uv, 3.0 + floor(v * 2.99), 1.0 + gSpread, gT)"),
  (23, "KdV soliton train", 13, "tSolitons(uv, 1.0 + gSpread, gT)"),
  (24, "Airy wave packet", 19, "tAiryPacket(uv, gCw, 1.0 + gSpread, gT)"),
  (25, "Kida vortex", 12, "tKida(uv, gCw, 1.3 + 0.8 * v, gT)"),
  (26, "Lamb-Oseen vortex row", 14, "tLambOseenRow(uv, gCw, 0.28 + 0.12 * v, gT)"),
  (27, "Faraday standing waves", 13, "tFaraday(uv, floor(v * 1.99), 1.0 + gSpread, gT)"),
 ],
}
FN = {"chainAP": ("orda", "stageAk"), "chainBP": ("ordb", "stageBk"), "chainCP": ("ordc", "stageCk"), "chainDP": ("ordd", "stageDk")}
WALK = {"chainAP": ("walkA", "1.3"), "chainBP": ("walkB", "2.9"), "chainCP": ("walkC", "4.7"), "chainDP": ("walkD", "6.1")}

# ---- library ----
g = rd("gen.py")
lib = rd("chain_lib7.glsl")
anchor = "// ---- idea round 4 ----"
assert g.count(anchor) == 1
if "round 7 (23.10.2026)" not in g:
    g = g.replace(anchor, lib + anchor)
    wr("gen.py", g)

# ---- the 2D lab ----
import chain_classes as cc
CC = cc.CLASSES
s = rd(os.path.join("src", "ChainLab2D.glsl"))
newlists = {}
names = {}
for knob, adds in NEW.items():
    fn, stage = FN[knob]
    o = parse_ord(s, fn)
    n0 = len(o)
    assert n0 == len(CC[knob]), (knob, n0, len(CC[knob]))
    names[knob] = {o[i]: CC[knob][i] for i in range(n0)}
    for nid, nm, after, call in adds:
        o = insert_after(o, after, nid)
        names[knob][nid] = nm
    i = s.index("int %s(int i)" % fn); j = s.index("\n", i)
    s = s[:i] + ifchain(fn, o, "energy order, %d classes" % len(o)) + s[j:]
    newlists[knob] = [names[knob][k] for k in o]
    newlists[knob] = [None if x is None else x for x in newlists[knob]]
    branch = "".join("    if (k == %d) return %s;\n" % (nid, call) for nid, nm, after, call in adds)
    old = "    k = %s(k);\n" % fn
    assert s.count(old) == 1, old
    s = s.replace(old, old + branch)
    walk, salt = WALK[knob]
    n1 = len(o)
    for pat in ["%s, %d)" % (knob, n0), "%s.x, %d)" % (walk, n0), "%s.y, %d)" % (walk, n0)]:
        assert pat in s, pat
        s = s.replace(pat, pat.replace(", %d)" % n0, ", %d)" % n1))
    s, k = re.subn(r"walkPick\(c( \+ 1\.0)?, k0, v0, %d, %s" % (n0, re.escape(salt)),
                   lambda m: m.group(0).replace(", %d, " % n0, ", %d, " % n1), s)
    assert k == 2, (knob, k)
wr(os.path.join("src", "ChainLab2D.glsl"), s)

# ---- class names (single source) and the subsets ----
c = rd("chain_classes.py")
for knob, lst in newlists.items():
    pat = re.compile(r"(    '%s': )\[.*?\](,\n)" % knob)
    assert pat.search(c), knob
    c = pat.sub(lambda m: m.group(1) + repr(lst) + m.group(2), c, count=1)
ex_tunnel = {
 "chainAP": ["Tinkerbell map", "Lozi map", "Hopalong map", "gingerbreadman map", "Bogdanov map", "Schwarz-Christoffel hexagon",
             "modular lambda function", "Ford circle inversion", "gamma function poles"],
 "chainBP": ["Heighway dragon fold", "Gosper flake fold", "Cantor mirror", "tent map fold", "cat map fold", "KIFS triangle fold",
             "Thue-Morse mirror"],
 "chainDP": ["capillary ring waves", "KdV soliton train", "Lamb-Oseen vortex row"],
}
for knob, add in ex_tunnel.items():
    pat = re.compile(r'(TUNNEL_EXCLUDE = \{.*?"%s": \{)' % knob, re.S)
    m = pat.search(c)
    assert m, knob
    c = c[:m.end()] + ", ".join('"%s"' % n for n in add) + ", " + c[m.end():]
old = 'LAB3D_EXCLUDE = {"chainBP": {"Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror"}}'
assert old in c
c = c.replace(old, 'LAB3D_EXCLUDE = {"chainAP": {"Schwarz-Christoffel hexagon", "Ford circle inversion", "modular lambda function"},\n'
              '                "chainBP": {"Penrose mirror", "Ammann-Beenker mirror", "12-fold quasicrystal mirror", "Thue-Morse mirror", "Cantor mirror"},\n'
              '                "chainDP": {"Lamb-Oseen vortex row", "capillary ring waves"}}')
wr("chain_classes.py", c)
a = rd("lab_audit.py")
a2 = re.sub(r'CLASSES = \{[^}]*\}', 'CLASSES = {%s}' % ", ".join('"%s": %d' % (k, n) for k, n in [
    ("chainAP", len(newlists["chainAP"])), ("chainBP", len(newlists["chainBP"])), ("chainCP", len(newlists["chainCP"])),
    ("chainDP", len(newlists["chainDP"])), ("styleP", 2), ("spaceP", 20), ("coreP", 22), ("bodyP", 22)]), a, count=1)
wr("lab_audit.py", a2)
print({k: len(v) for k, v in newlists.items()})
