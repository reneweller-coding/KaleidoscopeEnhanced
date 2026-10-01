"""make_chainpass.write_3d for every lab of the 3D kind: ChainLab3D (raymarched) and ChainSlice3D (cut).

Both share the G-buffer contract (folded point + distance, normal + AO), Start3D
and the final pass's shading; only the geometry differs.  The slice's geometry
evaluates the world on 1-8 planes (or not at all in its space-time cut) and its
normal and AO in the same one-call-site loop as the 3D lab.
"""
import io, os

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_chainpass.py")
s = io.open(P, encoding="utf-8").read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)

rep('def write_3d():', 'def write_3d(base="ChainLab3D"):')
rep('    lab = io.open(os.path.join(ROOT, "Scene2D", "ChainLab3D.frag"), encoding="utf-8").read()',
    '    lab = io.open(os.path.join(ROOT, "Scene2D", base + ".frag"), encoding="utf-8").read()\n'
    '    slice_ = base == "ChainSlice3D"\n'
    '    fieldF, normalF = ("fieldS", "normalS") if slice_ else ("fieldD", "normal3")')
rep('''    for piece in ("for (int i = 0; i < 100; ++i) {", "d = fieldD(ro + rd * t);",''',
    '''    for piece in (() if slice_ else ("for (int i = 0; i < 100; ++i) {", "d = fieldD(ro + rd * t);",''')
rep('''                  "t += d * 0.8;", "if (t > 30.0) break;"):''',
    '''                  "t += d * 0.8;", "if (t > 30.0) break;")):''')

# the slice's geometry loop, after the 3D lab's one_site
rep('''    geo_main = ("void main()\\n{\\n" + pre + cam + one_site +''',
    '''    if slice_:
        # The cut: planes 1..8 until one cuts matter (the last always shown), then the
        # normal and AO taps -- one call site; the space-time cut needs no world at all.
        for piece in ("int nl = 1 + int(clamp(layerP, 0.0, 1.0) * 7.99);", "t = 1.0 + 1.2 * float(i);", "float cutM = step(0.5, cutP);",
                      "if (cutM > 0.5) { hit = true; t = 1.0; fp = ro + rd; dHit = -1.0; }"):
            assert piece in march, "slice geometry: the lab's cut changed (" + piece + ")"
        one_site = r"""    int z0 = min(int(sceneTime), 0);
    int nl = 1 + int(clamp(layerP, 0.0, 1.0) * 7.99);
    if (cutP >= 0.5) {                     // the space-time cut: the plane point, facing the viewer
        gbPos = vec4(ro + rd, 1.0); gbNrm = vec4(sN, 1.25); return;
    }
    float t = 1.0; bool hit = false; vec3 fp = vec3(0.0); float dHit = 0.0;
    vec3 q = vec3(0.0), n = vec3(0.0), e = vec3(0.0);
    float ao = 0.0;
    int stage = 0, layer = 0;              // stage 0 the planes, 1..4 normal taps, 5..6 AO taps
    for (int i = z0; i < 14; ++i) {
        vec3 pos = ro + rd * t;
        if (stage > 4) pos = q + n * (0.06 * float(stage - 4));
        else if (stage > 0) {
            int k = stage - 1;
            e = 0.5773 * (2.0 * vec3(float(((k + 3) >> 1) & 1), float((k >> 1) & 1), float(k & 1)) - 1.0);
            pos = q + 0.0015 * e;
        }
        float d = fieldS(pos);
        if (stage == 0) {
            if (d < 0.0 || layer >= nl - 1) { hit = true; fp = gP; q = pos; dHit = d; stage = 1; continue; }
            ++layer; t = 1.0 + 1.2 * float(layer);
        } else if (stage <= 4) {
            n += e * d;
            if (stage == 4) n = normalize(n + vec3(1e-7));
            ++stage;
        } else {
            float h = 0.06 * float(stage - 4);
            ao += (h - d) / h;
            if (stage == 6) break;
            ++stage;
        }
    }
    ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0) * sliceShade(dHit);
"""
        geo_main = ("void main()\\n{\\n" + pre + cam + one_site +
                    "    gbPos = vec4(fp, t);\\n    gbNrm = vec4(n, ao);\\n}\\n")
    else:
      geo_main = ("void main()\\n{\\n" + pre + cam + one_site +''')
rep('''                "    gbPos = vec4(fp, t);\\n    gbNrm = vec4(n, clamp(1.0 - 0.4 * ao, 0.2, 1.0));\\n}\\n")
    # A variant''', '''                "    gbPos = vec4(fp, t);\\n    gbNrm = vec4(n, clamp(1.0 - 0.4 * ao, 0.2, 1.0));\\n}\\n")
    # A variant''')
rep('''    io.open(os.path.join(OUT, "Geom_ChainLab3D.frag"), "w", encoding="utf-8", newline="\\n").write(assemble(''',
    '''    io.open(os.path.join(OUT, "Geom_" + base + ".frag"), "w", encoding="utf-8", newline="\\n").write(assemble(''')
rep('''    fin_main = fin_main.replace("        vec3 q = ro + rd * t;\\n        vec3 n = normal3(q);\\n", "")''',
    '''    _nline = "        vec3 n = cutM > 0.5 ? sN : normalS(q);\\n" if slice_ else "        vec3 n = normal3(q);\\n"
    assert ("        vec3 q = ro + rd * t;\\n" + _nline) in fin_main, "3D final: the hit point lines changed"
    fin_main = fin_main.replace("        vec3 q = ro + rd * t;\\n" + _nline, "")''')
rep('''    assert "fieldD" not in fin_main and "normal3" not in fin_main and "colour3(" not in fin_main, "3D final: march code left"''',
    '''    assert fieldF not in fin_main and normalF not in fin_main and "colour3(" not in fin_main, "3D final: march code left"''')
rep('''    io.open(os.path.join(OUT, "Final_ChainLab3D.frag"), "w", encoding="utf-8", newline="\\n").write(assemble(''',
    '''    io.open(os.path.join(OUT, "Final_" + base + ".frag"), "w", encoding="utf-8", newline="\\n").write(assemble(''')
rep('''    write_3d()''', '''    write_3d()
    if os.path.exists(os.path.join(ROOT, "Scene2D", "ChainSlice3D.frag")):
        write_3d("ChainSlice3D")''')
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("patched")
