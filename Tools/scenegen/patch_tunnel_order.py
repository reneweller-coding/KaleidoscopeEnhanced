# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the tunnel lab runs its chain in every march step;
the free stage order (a switch over four stages at each of four positions)
made that 3x slower (41 fps with the cheapest chain).  The tunnel keeps the
fixed order A -> B -> C -> D (and no order walk)."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SP, "make_chainlabtunnel.py")
s = io.open(p, encoding="utf-8").read()
old = "vec2 chain(vec2 uv)\n{\n    return runChain(uv);\n}\n"
assert s.count(old) == 1
s = s.replace(old, '''vec2 chain(vec2 uv)
{
    // Fixed order A -> B -> C -> D: the chain runs in every march step here,
    // and the free order (a switch over the four stages at every position)
    // tripled its cost.
    gIdW = 1.0;
    uv = stageA(uv); uv = mirrorUV(uv);
    uv = stageB(uv); uv = mirrorUV(uv);
    uv = stageC(uv); uv = mirrorUV(uv);
    uv = stageD(uv);
    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);
    return uv;
}
''')
s = s.replace("//@params chainAP chainBP chainCP chainDP orderP morphP", "//@params chainAP chainBP chainCP chainDP morphP")
old = 'STAGES = re.sub(r"\\bgT\\b", "gTC", lab2[a:b])'
assert s.count(old) == 1, "stages"
s = s.replace(old, old + '\nSTAGES = STAGES.replace("uniform vec3 walkO;\\n", "")   # no order walk in the tunnel', 1)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
