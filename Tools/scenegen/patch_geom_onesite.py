"""make_chainpass.write_3d: the geometry pass with ONE call site of the field.

The driver finishes a program's GPU code at its first draw (ShaderForge.h),
and in a running process that cannot be cached away: the NVIDIA driver reads
its disk cache only at process start.  The time goes with the code size, and
the field (the whole world) was inlined seven times -- march, four normal
taps, two AO taps -- and twice that in a fade.  One loop with a non-constant
start that walks march -> normal -> AO calls it once; a variant without a fade
also drops the second world (fieldK_1).  Cold first draw 130-180 ms -> 45 ms
(of which ~20 ms is any program's first draw in a fresh process).
"""
import io, os

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_chainpass.py")
s = io.open(P, encoding="utf-8").read()

old = '''    geo_main = ("void main()\\n{\\n" + pre + cam + march +
                "    if (!hit) { gbPos = vec4(0.0, 0.0, 0.0, -1.0); gbNrm = vec4(0.0, 0.0, 1.0, 1.0); return; }\\n"
                "    vec3 q = ro + rd * t;\\n    vec3 n = normal3(q);\\n"
                "    float ao = 0.0;\\n"
                "    for (int k = 1; k <= 2; ++k) { float h = 0.06 * float(k); ao += (h - fieldD(q + n * h)) / h; }\\n"
                "    gbPos = vec4(fp, t);\\n    gbNrm = vec4(n, clamp(1.0 - 0.4 * ao, 0.2, 1.0));\\n}\\n")'''
new = '''    # One call site of the field for march, normal and AO (the driver's first-draw code generation
    # goes with the code size: seven inlined worlds -> one, 130-180 ms -> 45 ms cold).  The lab's
    # own march is checked, so a change there cannot slip past this rewrite.
    for piece in ("for (int i = 0; i < 100; ++i) {", "d = fieldD(ro + rd * t);",
                  "if (abs(d) < 0.0015 * t) { hit = true; fp = gP; fdr = gDR; break; }",
                  "t += d * 0.8;", "if (t > 30.0) break;"):
        assert piece in march, "3D geometry: the lab's march changed (" + piece + ")"
    one_site = r"""    int z0 = min(int(sceneTime), 0);       // a start the compiler cannot see: the loop stays a loop
    float t = 0.05; bool hit = false; vec3 fp = vec3(0.0);
    vec3 q = vec3(0.0), n = vec3(0.0), e = vec3(0.0);
    float ao = 0.0;
    int stage = 0;                         // 0 march, 1..4 normal taps (tetrahedron), 5..6 AO taps
    for (int i = z0; i < 107; ++i) {
        vec3 pos = ro + rd * t;
        if (stage > 4) pos = q + n * (0.06 * float(stage - 4));
        else if (stage > 0) {
            int k = stage - 1;
            e = 0.5773 * (2.0 * vec3(float(((k + 3) >> 1) & 1), float((k >> 1) & 1), float(k & 1)) - 1.0);
            pos = q + 0.0015 * e;
        }
        float d = fieldD(pos);
        if (stage == 0) {
            if (abs(d) < 0.0015 * t) { hit = true; fp = gP; q = pos; stage = 1; continue; }
            t += d * 0.8;
            if (t > 30.0 || i >= 99) break;
        } else if (stage <= 4) {
            n += e * d;
            if (stage == 4) n = normalize(n);
            ++stage;
        } else {
            float h = 0.06 * float(stage - 4);
            ao += (h - d) / h;
            if (stage == 6) break;
            ++stage;
        }
    }
"""
    geo_main = ("void main()\\n{\\n" + pre + cam + one_site +
                "    if (!hit) { gbPos = vec4(0.0, 0.0, 0.0, -1.0); gbNrm = vec4(0.0, 0.0, 1.0, 1.0); return; }\\n"
                "    gbPos = vec4(fp, t);\\n    gbNrm = vec4(n, clamp(1.0 - 0.4 * ao, 0.2, 1.0));\\n}\\n")
    # A variant without a fade has no second world: fieldK_1 only where a stage fades.
    i0 = geo_src.index("float field3(vec3 p)")
    a = geo_src.index("    if (f <= 0.0) return d0;", i0)
    b = geo_src.index("    return mix(d0, d1, f);", a)
    b = geo_src.index("\\n", b) + 1
    geo_src = (geo_src[:a] + "#if SPEC_SP0 == SPEC_SP1 && SPEC_CO0 == SPEC_CO1 && SPEC_BO0 == SPEC_BO1\\n    return d0;\\n#else\\n"
               + geo_src[a:b] + "#endif\\n" + geo_src[b:])'''
assert s.count(old) == 1, "geo_main block not found"
s = s.replace(old, new)
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("patched", P)
