# -*- coding: utf-8 -*-
"""One-off patch (30.09.): fewer inlined copies of the 3D distance field (the
driver inlines the whole field at every call site; the 3D lab's cold compile
had grown to 10.6 s).  gP is taken from the march's last step (the hit point
itself) instead of a fresh evaluation; ambient occlusion takes 2 samples
instead of 4; the relief samples the colour chain in the folded space
directly (along the surface tangents, scaled by the fold's local stretch)
instead of folding three more points."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))

def rw(path, pairs):
    p = os.path.join(SP, path)
    s = io.open(p, encoding="utf-8").read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:60])
        s = s.replace(old, new)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)
    print(path, "ok")

rw("make_chains3d.py", [
    ("    float t = 0.05; float d = 1.0; bool hit = false;\n    for (int i = 0; i < 100; ++i) {{\n        d = fieldD(ro + rd * t);\n        if (abs(d) < 0.0008 * t) {{ hit = true; break; }}",
     "    float t = 0.05; float d = 1.0; bool hit = false; vec3 fp = vec3(0.0); float fdr = 1.0;\n    for (int i = 0; i < 100; ++i) {{\n        d = fieldD(ro + rd * t);\n        if (abs(d) < 0.0008 * t) {{ hit = true; fp = gP; fdr = gDR; break; }}   // gP of the hit point: no extra evaluation"),
    ("        vec3 n = normal3(q);\n        fieldD(q);                                              // sets gP for this point\n        vec3 fp = gP;\n",
     "        vec3 n = normal3(q);\n"),
    ("        for (int k = 1; k <= 4; ++k) {{ float h = 0.04 * float(k); ao += (h - fieldD(q + n * h)) / h; }}\n        ao = clamp(1.0 - 0.2 * ao, 0.2, 1.0);",
     "        for (int k = 1; k <= 2; ++k) {{ float h = 0.06 * float(k); ao += (h - fieldD(q + n * h)) / h; }}\n        ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0);"),
])
rw("make_chainlab3d.py", [
    ('''float reliefH(vec3 qw, vec3 n, float lod)
{
    fieldD(qw);
    vec3 w = abs(n), fq = gP;
    vec2 uv = (w.x > w.y && w.x > w.z) ? fq.yz : (w.y > w.z ? fq.zx : fq.xy);
    return luma(chainPlane(uv * 0.35 + 0.5, lod, 0.0));
}''',
     '''float reliefH(vec3 fq, vec3 n, float lod)
{
    vec3 w = abs(n);
    vec2 uv = (w.x > w.y && w.x > w.z) ? fq.yz : (w.y > w.z ? fq.zx : fq.xy);
    return luma(chainPlane(uv * 0.35 + 0.5, lod, 0.0));
}'''),
    ('''            float h0 = reliefH(q, n, hl);
            vec3 g = t1 * (reliefH(q + t1 * e, n, hl) - h0) + t2 * (reliefH(q + t2 * e, n, hl) - h0);''',
     '''            // sampled in the folded space around fp (the fold stretches by fdr there)
            float ef = e * fdr, h0 = reliefH(fp, n, hl);
            vec3 g = t1 * (reliefH(fp + t1 * ef, n, hl) - h0) + t2 * (reliefH(fp + t2 * ef, n, hl) - h0);'''),
    ('// by its slope, measured in the world along two tangents (each sample folds its\n// point like the surface), so the light follows the bumps.',
     '// by its slope, sampled around the folded surface point (no extra evaluation\n// of the field -- each would inline it once more), so the light follows the bumps.'),
])
