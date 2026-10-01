# -*- coding: utf-8 -*-
"""Specialised variants, second step: the class constants must sit INSIDE the
dispatch functions.  The driver does not inline the big stage / field
functions into every caller, so a constant passed as a parameter arrived as a
plain variable and every branch stayed (3D lab 3.4 ms instead of 1.4).

gen.py now writes, for a lab, two copies of each dispatch function --
stageAk_0 / stageAk_1 with "int k = SPEC_A0" / "SPEC_A1" built in, fieldK_0 /
fieldK_1 with the world's classes built in -- inside #ifdef SPEC_..., and the
callers use them there.  Without the macros nothing changes."""
import io, os
SG = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SG, "gen.py")
s = io.open(p, encoding="utf-8").read()

FN = '''
def spec_variants(body):
    """Chain labs: the dispatch functions twice more, with the class of the
    specialised variant built in (see patch_spec2.py); the generic code stays."""
    if "#ifdef SPEC_A0" not in body:
        return body
    def func_span(src, header):
        i = src.index(header)
        j = src.index("\\n{", i) + 2
        depth = 1
        while depth:
            c = src[j]
            depth += (c == "{") - (c == "}")
            j += 1
        return i, j
    for st in "ABCD":
        header = "vec2 stage%sk(vec2 uv, int k, float v)" % st
        if header not in body:
            continue
        i, j = func_span(body, header)
        fn = body[i:j]
        copies = ""
        for w in "01":
            c = fn.replace(header, "vec2 stage%sk_%s(vec2 uv, float v)" % (st, w), 1)
            c = c.replace("\\n{\\n", "\\n{\\n    int k = SPEC_%s%s;\\n" % (st, w), 1)
            copies += "\\n" + c
        body = body[:j] + "\\n#ifdef SPEC_%s0%s\\n#endif" % (st, copies) + body[j:]
        a = ("    vec2 r = stage%sk(uv, ka, va);\\n    if (f > 0.0) r = morphMix(r, stage%sk(uv, kb, vb), f);\\n" % (st, st))
        assert body.count(a) == 1, st
        body = body.replace(a, "#ifdef SPEC_%s0\\n    vec2 r = stage%sk_0(uv, va);\\n    if (f > 0.0) r = morphMix(r, stage%sk_1(uv, vb), f);\\n#else\\n%s#endif\\n" % (st, st, st, a))
    header = "float fieldK(vec3 p, float xs, float xc, float xb, int world)"
    if header in body:
        i, j = func_span(body, header)
        fn = body[i:j]
        ov = "    ks = ordsp(world == 0 ? SPEC_SP0 : SPEC_SP1); kc = ordco(world == 0 ? SPEC_CO0 : SPEC_CO1); kb = ordbo(world == 0 ? SPEC_BO0 : SPEC_BO1);"
        assert ov in fn
        copies = ""
        for w in "01":
            c = fn.replace(header, "float fieldK_%s(vec3 p, float xs, float xc, float xb, int world)" % w, 1)
            c = c.replace(ov, "    ks = ordsp(SPEC_SP%s); kc = ordco(SPEC_CO%s); kb = ordbo(SPEC_BO%s);" % (w, w, w))
            copies += "\\n" + c
        body = body[:j] + "\\n#ifdef SPEC_SP0%s\\n#endif" % copies + body[j:]
        for w, a in (("0", "    float d0 = fieldK(p, xs, xc, xb, 0);\\n"), ("1", "    float d1 = fieldK(p, ys, yc, yb, 1);\\n")):
            assert body.count(a) == 1, a
            body = body.replace(a, "#ifdef SPEC_SP0\\n%s#else\\n%s#endif\\n" % (a.replace("fieldK(", "fieldK_%s(" % w), a))
    return body
'''
anchor = "def build("
assert s.count(anchor) == 1
s = s.replace(anchor, FN.lstrip("\n") + "\n" + anchor, 1)
a = '    out.append(body.rstrip() + "\\n")\n'
assert s.count(a) == 1
s = s.replace(a, '    out.append(spec_variants(body).rstrip() + "\\n")\n')
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
