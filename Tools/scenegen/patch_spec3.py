# -*- coding: utf-8 -*-
"""Specialised variants, third step: the macros carry BRANCH numbers, not
energy positions.  The ord tables (position -> branch) are if-chains; the
driver did not evaluate them at compile time, so a constant position still
left every branch in (3.3 ms); with the branch number written in directly the
same 3D world runs in 1.3 ms (generic lab 5.1 ms).

* gen.py writes "// @chainord <knob> b0|b1|..." (from the frag's own ord
  functions, so the labs' class subsets are right) for the app.
* The dispatch copies start with "int k = SPEC_A0;" (no ord call), fieldK's
  copies with "ks = SPEC_SP0; kc = SPEC_CO0; kb = SPEC_BO0;".
* The stage wrappers no longer override ka/kb (they are positions)."""
import io, os, re
SG = os.path.dirname(os.path.abspath(__file__))

p = os.path.join(SG, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
s, n = re.subn(r"#ifdef SPEC_[ABCD]0\n    ka = SPEC_[ABCD]0; kb = SPEC_[ABCD]1;   // the app's specialised variant: these classes only\n#endif\n", "", s)
assert n == 4, n
io.open(p, "w", encoding="utf-8", newline="\n").write(s)

p = os.path.join(SG, "gen.py")
s = io.open(p, encoding="utf-8").read()
R = [
('''            c = c.replace("\\n{\\n", "\\n{\\n    int k = SPEC_%s%s;\\n" % (st, w), 1)''',
 '''            # the branch number directly: the ord if-chain is not folded by the driver
            c, nk = re.subn(r"\\n\\{\\n    k = ord[a-d]\\(k\\);\\n", "\\n{\\n    int k = SPEC_%s%s;\\n" % (st, w), c, count=1)
            assert nk == 1, st'''),
('''            c = c.replace(ov, "    ks = ordsp(SPEC_SP%s); kc = ordco(SPEC_CO%s); kb = ordbo(SPEC_BO%s);" % (w, w, w))''',
 '''            c = c.replace(ov, "    ks = SPEC_SP%s; kc = SPEC_CO%s; kb = SPEC_BO%s;" % (w, w, w))'''),
('''        if not _ex:                                             # the flat labs: at most one stage with an opening''',
 '''        # position -> branch of every stage (the frag's own ord functions, so
        # a lab's class subset is right): the app's specialised variants name
        # branches, because the drivers do not fold the ord if-chains.
        for _k, _f in (("chainAP", "orda"), ("chainBP", "ordb"), ("chainCP", "ordc"), ("chainDP", "ordd"),
                       ("spaceP", "ordsp"), ("coreP", "ordco"), ("bodyP", "ordbo")):
            _m = re.search(r"int %s\\(int i\\) \\{(.*?)\\}" % _f, body)
            if _m:
                _b = [int(x) for x in re.findall(r"return (\\d+);", _m.group(1))]
                out.append("// @chainord %s %s" % (_k, "|".join(str(x) for x in _b)))
        if not _ex:                                             # the flat labs: at most one stage with an opening'''),
]
for a, b in R:
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
