# -*- coding: utf-8 -*-
"""Specialised variants of the chain labs (shader side).

One lab shader holds every class of every stage; the GPU then has to reserve
registers for the heaviest branch on every pixel, even when the rolled chain
is a plain mirror.  Measured: the same 3D world 5.2 ms as the lab, 1.2 ms with
its knobs frozen (12.4 -> 2.1 ms for a heavy world).

The app (EffectShader::stepChainSpec) therefore compiles, in the background, a
variant with the classes on screen as constants -- "#define SPEC_A0 23" etc.
right after #version -- and the driver drops every other branch.  The macros:

  SPEC_A0/1 .. SPEC_D0/1   position (energy order) of the class shown / faded to
                           in each 2D stage
  SPEC_SP0/1, SPEC_CO0/1, SPEC_BO0/1   the 3D lab's space / core / body,
                           world 0 (shown) and world 1 (faded to)

Without the macros (editor, catalogue, any GPU without background compile)
the shader is exactly the old one."""
import io, os
SG = os.path.dirname(os.path.abspath(__file__))

def rw(p, fn):
    s = io.open(p, encoding="utf-8").read()
    s = fn(s)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)

def lab2(s):
    for st, thr in (("A", "ka <= 0 ? 1.0 - f : 0.0) + (kb <= 0 ? f : 0.0);"), ("B", "ka <= 2 ? 1.0 - f : 0.0) + (kb <= 2 ? f : 0.0);"),
                    ("C", "ka <= 1 ? 1.0 - f : 0.0) + (kb <= 1 ? f : 0.0);"), ("D", "ka <= 2 ? 1.0 - f : 0.0) + (kb <= 2 ? f : 0.0);")):
        a = "    gIdW *= (" + thr
        i = s.index("vec2 stage%s(vec2 uv)" % st)
        j = s.index(a, i)
        ins = ("#ifdef SPEC_%s0\n    ka = SPEC_%s0; kb = SPEC_%s1;   // the app's specialised variant: these classes only\n#endif\n" % (st, st, st))
        s = s[:j] + ins + s[j:]
    return s
rw(os.path.join(SG, "src", "ChainLab2D.glsl"), lab2)

def lab3(s):
    a = "float fieldK(vec3 p, float xs, float xc, float xb)\n"
    assert s.count(a) == 1
    s = s.replace(a, "float fieldK(vec3 p, float xs, float xc, float xb, int world)\n")
    a = "    int kb = ordbo(pickStage(xb, 22)); float vb = subVar(xb, 22);\n"
    assert s.count(a) == 1
    s = s.replace(a, a +
        "#ifdef SPEC_SP0\n"
        "    // the app's specialised variant: world 0 / 1 are constants (each call site folds to its branches)\n"
        "    ks = ordsp(world == 0 ? SPEC_SP0 : SPEC_SP1); kc = ordco(world == 0 ? SPEC_CO0 : SPEC_CO1); kb = ordbo(world == 0 ? SPEC_BO0 : SPEC_BO1);\n"
        "#endif\n")
    for a, b in (("    float d0 = fieldK(p, xs, xc, xb);", "    float d0 = fieldK(p, xs, xc, xb, 0);"),
                 ("    float d1 = fieldK(p, ys, yc, yb);", "    float d1 = fieldK(p, ys, yc, yb, 1);")):
        assert s.count(a) == 1, a
        s = s.replace(a, b)
    return s
rw(os.path.join(SG, "make_chainlab3d.py"), lab3)
print("ok")
