# -*- coding: utf-8 -*-
"""One small fragment shader per chain transform: Engine/ChainPass/<stage><branch>.frag.

The chain labs used to evaluate the whole chain in ONE shader that holds every
class of every stage (119 classes): the GPU reserved registers for the
heaviest branch on every pixel, a cold compile took seconds, and a variant
with fewer classes still stalled the picture for ~0.8 s on NVIDIA.

A chain is a composition of coordinate maps, and every stage needs only the
coordinate of its own pixel -- so it runs as passes (EffectShader's chain
runner): pass A writes A(uv) for every pixel into an RG32F texture, pass B
reads it and writes B(...), and so on; the lab's own shader then reads the
final coordinate (CHAIN_TEX).  Each pass shader here holds one class and only
the library functions it calls (a call graph over the built lab), so it
compiles in milliseconds, once.

Pass contract (uniforms set by the app):
  texIn      the previous coordinate (RG32F), read at this pixel
  firstPass  1: start from the screen (screenP() * 0.5 + 0.5) instead of texIn
  subV       the class's sub-variant 0..1 (mirrors, arms, lattice ...)
  resolution, sceneTime, audioAdvance, audioPhase, audioSpread, speedP
             the same values the lab receives (they drive gT, gRot, gCw ...)
Special passes: Id (identity, mirrored: carries a 'none' stage through a
fade), Mix (texA/texB mirrored and mixed by mixF -- a stage fade or an order
fade), Fallback (the calm hexagonal lattice faded in by mixF where the chain
is too weak, as in runChain)."""
import io, os, re, sys

SG = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(SG, "..", "..")
OUT = os.path.join(ROOT, "Engine", "ChainPass")

STAGE_FN = {"A": ("stageAk", "orda"), "B": ("stageBk", "ordb"), "C": ("stageCk", "ordc"), "D": ("stageDk", "ordd")}

def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"//[^\n]*", "", s)

def top_level_items(src):
    """(kind, name, text) for every top-level item: 'func', 'decl', 'pp'."""
    items = []
    i, n = 0, len(src)
    while i < n:
        while i < n and src[i] in " \t\r\n":
            i += 1
        if i >= n:
            break
        if src[i] == "#":
            j = src.find("\n", i)
            j = n if j < 0 else j
            items.append(("pp", None, src[i:j]))
            i = j
            continue
        # up to the first ';' or '{' at this depth
        j = i
        while j < n and src[j] not in ";{":
            j += 1
        if j >= n:
            break
        if src[j] == ";":
            text = src[i:j + 1]
            names = re.findall(r"\b([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(?=[,;=])", text)
            items.append(("decl", names, text))
            i = j + 1
            continue
        head = src[i:j]
        m = re.search(r"([A-Za-z_]\w*)\s*\([^()]*\)\s*$", head)
        depth, k = 0, j
        while k < n:
            if src[k] == "{":
                depth += 1
            elif src[k] == "}":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        text = src[i:k + 1]
        if m:
            items.append(("func", m.group(1), text))
        else:                                   # struct or initialiser block
            k2 = src.find(";", k)
            text = src[i:k2 + 1]
            items.append(("decl", re.findall(r"\b([A-Za-z_]\w*)\b", text), text))
            k = k2
        i = k + 1
    return items

def idents(text):
    return set(re.findall(r"\b[A-Za-z_]\w*\b", text))

def branch_bodies(src, fn):
    """branch index -> statement body (without the 'if (k == N)') of a stage dispatch function."""
    i = src.index("vec2 %s(vec2 uv, int k, float v)" % fn)
    j = src.index("\n}\n", i)
    lines = src[i:j].split("\n")[2:]           # skip the header and '{'
    out, default, k = {}, None, 0
    while k < len(lines):
        l = lines[k]
        m = re.match(r"\s*if \(k == (\d+)\)\s*(.*)$", l)
        if m:
            idx, rest = int(m.group(1)), m.group(2)
            depth = l.count("{") - l.count("}")
            block = [rest]
            k += 1
            while depth > 0 and k < len(lines):
                depth += lines[k].count("{") - lines[k].count("}")
                block.append(lines[k])
                k += 1
            out[idx] = "\n".join(block)
            continue
        if re.match(r"\s*return ", l):
            default = l.strip()
        k += 1
    return out, default

class _DocFile:
    """Writes a generated shader with the Doxygen comments of Tools/doc_shaders.py (LF line ends)."""
    def __init__(self, path):
        self.path = path
    def write(self, text):
        sys.path.insert(0, os.path.join(ROOT, "Tools"))
        import doc_shaders
        io.open(self.path, "w", encoding="utf-8", newline="\n").write(doc_shaders.annotate(text))

# The chain read in the lab's last pass.  On a coarser grid (chainScale < 1)
# bilinear between the four nearest coordinates -- unless they straddle a seam
# (a fold edge, a Droste step), where mixing would invent coordinates: there
# the nearest one (a step of one coarse pixel along the seam).
CHAIN_READ = r"""vec2 chain(vec2 p)
{
    vec2 fp = gl_FragCoord.xy - chainOff;
    if (chainScale <= 0.0 || chainScale >= 0.999) return texelFetch(texChain, ivec2(fp), 0).xy;
    vec2 q = fp * chainScale - 0.5;
    ivec2 i0 = ivec2(floor(q)), mx = textureSize(texChain, 0) - 1;
    vec2 f = q - vec2(i0);
    vec2 a = texelFetch(texChain, clamp(i0, ivec2(0), mx), 0).xy;
    vec2 b = texelFetch(texChain, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0).xy;
    vec2 c = texelFetch(texChain, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0).xy;
    vec2 d = texelFetch(texChain, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0).xy;
    float gap = max(max(length(a - b), length(a - c)), max(length(b - d), length(c - d)));
    if (gap > 0.08) return f.y < 0.5 ? (f.x < 0.5 ? a : b) : (f.x < 0.5 ? c : d);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}"""

def write_final(rel, name, bake=0):
    """The lab's own last pass: its main as it is, the chain read from texChain.
    Only what main reaches is kept (the stage machinery is not), and the walk
    uniforms stay referenced: the app finds a lab's stages by their locations."""
    lab = io.open(os.path.join(ROOT, rel), encoding="utf-8").read()
    body = strip_comments(lab)
    body = re.sub(r"#ifdef SPEC_.*?#endif\n", "", body, flags=re.S)
    items = [it for it in top_level_items(body) if not (it[0] == "pp" and it[2].startswith("#version"))]
    fin_funcs = {}
    for kind, nm, text in items:
        if kind == "func":
            fin_funcs.setdefault(nm, []).append(text)
    mt = fin_funcs.pop("main")[0]
    if bake:
        # the chain baked over its input square [0,1]^2 (stored mirrored, sampled
        # with mirrored repeat): every use of it here mirrors anyway
        fin_funcs["chain"] = ["vec2 chain(vec2 p)\n{\n    return texture(texChain, p).xy;\n}"]
    else:
        fin_funcs["chain"] = [CHAIN_READ]
    i = mt.rstrip().rfind("finish(")
    assert i > 0, rel
    walks = [w for w in ("walkA", "walkB", "walkC", "walkD", "walkO") if re.search(r"\b%s\b" % w, body.split("void main()")[0])]
    mt = mt[:i] + ("if (walkHost < -1.0) col += vec3(%s);   // keeps the walk uniforms\n    " % " + ".join(w + ".x" for w in walks)
                   + mt[i:])
    need = idents(mt) | {"chain"}
    keep_f, frontier = set(), set(n for n in need if n in fin_funcs)
    while frontier:
        f = frontier.pop()
        if f in keep_f:
            continue
        keep_f.add(f)
        for t in fin_funcs[f]:
            frontier |= set(n for n in idents(t) if n in fin_funcs and n not in keep_f)
    used = set(need)
    for f in keep_f:
        for t in fin_funcs[f]:
            used |= idents(t)
    out = ["#version 330 core",
           "// GENERATED by Tools/scenegen/make_chainpass.py from %s -- the lab with its chain" % rel,
           "// run as passes by the app (EffectShader chain runner); the chain coordinate comes from texChain.",
           "uniform sampler2D texChain;", "uniform vec2 chainOff;"] + (["// @chainbake %d" % bake] if bake else
                                                                      ["uniform float chainScale;   // the chain's grid relative to the frame (0 = 1)"])
    done_f = set()
    for kind, nm, text in items:
        if kind == "pp":
            if text.startswith("#define") and text.split()[1] in used:
                out.append(text)
        elif kind == "decl":
            if any(n in used for n in nm):
                out.append(text.strip())
        elif nm in keep_f and nm not in done_f and nm != "chain":
            done_f.add(nm)
            out.extend(t.strip() for t in fin_funcs[nm])
    out.append(mt.strip())
    # chain() before the first function: imgChain calls it early in the file
    first_fn = next(i for i, o in enumerate(out) if i > 4 and o.rstrip().endswith("}"))
    out.insert(first_fn, fin_funcs["chain"][0])
    _DocFile(os.path.join(OUT, "Final_%s.frag" % name)).write("\n".join(out) + "\n")

def preprocess(text, defined, undefined):
    """Resolves #ifdef/#ifndef/#else/#endif on the names in `defined` / `undefined`;
    every other directive (and its block) is kept as it is."""
    out, stack = [], []        # stack entries: (kept_by_us, active)
    active = True
    for line in text.split("\n"):
        t = line.strip()
        m = re.match(r"#(ifdef|ifndef)\s+(\w+)", t)
        if m and (m.group(2) in defined or m.group(2) in undefined):
            on = (m.group(2) in defined) == (m.group(1) == "ifdef")
            stack.append(("ours", active, on))
            active = active and on
            continue
        if re.match(r"#if", t):
            stack.append(("theirs", active, True))
            if active:
                out.append(line)
            continue
        if t.startswith("#else") and stack and stack[-1][0] == "ours":
            kind, outer, on = stack[-1]
            stack[-1] = (kind, outer, not on)
            active = outer and not on
            continue
        if t.startswith("#endif") and stack:
            kind, outer, on = stack.pop()
            active = outer
            if kind == "ours":
                continue
        if active:
            out.append(line)
    return "\n".join(out)

def assemble(text, main_text, header, title, replace=None):
    """A shader from `text` (a lab, comments stripped): the declarations and the
    functions main_text reaches (call graph), then main_text."""
    items = [it for it in top_level_items(text) if not (it[0] == "pp" and it[2].startswith("#version"))]
    funcs = {}
    for kind, nm, t in items:
        if kind == "func":
            funcs.setdefault(nm, []).append(t)
    funcs.pop("main", None)
    for k, v in (replace or {}).items():
        funcs[k] = [v]
    need = idents(strip_comments(main_text))
    keep_f, frontier = set(), set(n for n in need if n in funcs)
    while frontier:
        f = frontier.pop()
        if f in keep_f:
            continue
        keep_f.add(f)
        for t in funcs[f]:
            frontier |= set(n for n in idents(t) if n in funcs and n not in keep_f)
    used = set(need)
    for f in keep_f:
        for t in funcs[f]:
            used |= idents(t)
    out = ["#version 330 core", "// GENERATED by Tools/scenegen/make_chainpass.py -- " + title] + header
    done = set()
    for kind, nm, t in items:
        if kind == "pp":
            if t.startswith("#define") and t.split()[1] in used:
                out.append(t)
        elif kind == "decl":
            proto = re.match(r"\s*\w+\s+(\w+)\s*\(", t)          # a prototype: kept with its function
            if proto:
                if proto.group(1) in keep_f:
                    out.append(t.strip())
            elif any(n in used for n in nm) and not t.strip().startswith("out "):
                out.append(t.strip())
        elif nm in keep_f and nm not in done:
            done.add(nm)
            out.extend(x.strip() for x in funcs[nm])
    out.append(main_text.strip())
    return "\n".join(out) + "\n"

def write_3d(base="ChainLab3D"):
    """The 3D lab in three parts (EffectShader's chain runner, "// @chain3d"):
    Geom_ChainLab3D -- the camera, the march, normal and AO into a G-buffer
    (its world classes as #if selections on SPEC_SP/CO/BO: the app builds one
    small variant per world through ShaderForge); Start3D -- one projection
    plane's chain input and time offset from the G-buffer; Final_ChainLab3D --
    colour (three chain coordinates), relief, light, rim and fog."""
    lab = io.open(os.path.join(ROOT, "Scene2D", base + ".frag"), encoding="utf-8").read()
    slice_ = base == "ChainSlice3D"
    fieldF, normalF = ("fieldS", "normalS") if slice_ else ("fieldD", "normal3")
    body = strip_comments(lab)
    mt = body[body.index("void main()"):]
    pre = mt[mt.index("{") + 1:mt.index("    vec3 ro;")]
    cam = mt[mt.index("    vec3 ro;"):mt.index("    float t = 0.05;")]
    march = mt[mt.index("    float t = 0.05;"):mt.index("    vec3 lc = ")]
    # Geometry: the world variant (SPEC_SP0 defined: fieldK_0/_1 with #if selections)
    geo_src = preprocess(body, {"SPEC_SP0"}, {"SPEC_A0", "SPEC_B0", "SPEC_C0", "SPEC_D0"})
    # One call site of the field for march, normal and AO (the driver's first-draw code generation
    # goes with the code size: seven inlined worlds -> one, 130-180 ms -> 45 ms cold).  The lab's
    # own march is checked, so a change there cannot slip past this rewrite.
    for piece in (() if slice_ else ("for (int i = 0; i < 100; ++i) {", "d = fieldD(ro + rd * t);",
                  "if (abs(d) < 0.0015 * t) { hit = true; fp = gP; fdr = gDR; break; }",
                  "t += d * 0.8;", "if (t > 30.0) break;")):
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
    if slice_:
        # The cut: planes 1..8 until one cuts matter (the last always shown), then the
        # normal and AO taps -- one call site.
        for piece in ("int nl = 1 + int(clamp(layerP, 0.0, 1.0) * 7.99);", "t = 1.0 + sDz * float(i);"):
            assert piece in march, "slice geometry: the lab's cut changed (" + piece + ")"
        one_site = r"""    int z0 = min(int(sceneTime), 0);
    int nl = 1 + int(clamp(layerP, 0.0, 1.0) * 7.99);
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
            ++layer; t = 1.0 + sDz * float(layer);
        } else if (stage <= 4) {
            n += e * d;
            if (stage == 4) n = normalize(n + vec3(1e-7));
            ++stage;
        } else {
            float h = 0.06 * float(stage - 4);
            ao += (h - d + dHit) / h;              // relative to the cut point
            if (stage == 6) break;
            ++stage;
        }
    }
    ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0) * sliceShade(dHit, sPx);
"""
        geo_main = ("void main()\n{\n" + pre + cam + one_site +
                    "    gbPos = vec4(fp, t);\n    gbNrm = vec4(n, ao);\n}\n")
    else:
      geo_main = ("void main()\n{\n" + pre + cam + one_site +
                "    if (!hit) { gbPos = vec4(0.0, 0.0, 0.0, -1.0); gbNrm = vec4(0.0, 0.0, 1.0, 1.0); return; }\n"
                "    gbPos = vec4(fp, t);\n    gbNrm = vec4(n, clamp(1.0 - 0.4 * ao, 0.2, 1.0));\n}\n")
    # A variant without a fade has no second world: fieldK_1 only where a stage fades.
    i0 = geo_src.index("float field3(vec3 p)")
    a = geo_src.index("    if (f <= 0.0) return d0;", i0)
    b = geo_src.index("    return mix(d0, d1, f);", a)
    b = geo_src.index("\n", b) + 1
    geo_src = (geo_src[:a] + "#if SPEC_SP0 == SPEC_SP1 && SPEC_CO0 == SPEC_CO1 && SPEC_BO0 == SPEC_BO1\n    return d0;\n#else\n"
               + geo_src[a:b] + "#endif\n" + geo_src[b:])
    _DocFile(os.path.join(OUT, "Geom_" + base + ".frag")).write(assemble(
        geo_src, geo_main, ["layout(location = 0) out vec4 gbPos;   // folded hit point, distance (-1: no hit)",
                            "layout(location = 1) out vec4 gbNrm;   // normal, ambient occlusion",
                            "// world classes: SPEC_SP0/1, SPEC_CO0/1, SPEC_BO0/1 (branch numbers), set by the app"],
        "the 3D lab's geometry pass (G-buffer)"))
    # Start: one projection plane's chain input (uv) and time offset (depth along the normal, solid look)
    start_main = r"""void main()
{
    vec4 g = texelFetch(texGPos, ivec2(gl_FragCoord.xy), 0);
    vec3 fp = g.xyz;
    float sd = solidP >= 0.5 ? 1.0 : 0.0;
    vec2 uv = plane == 0 ? fp.yz : (plane == 1 ? fp.zx : fp.xy);
    float depth = plane == 0 ? fp.x : (plane == 1 ? fp.y : fp.z);
    fragColor = vec4(uv * 0.35 + 0.5, depth * sd, 0.0);
}
"""
    _DocFile(os.path.join(OUT, "Start3D.frag")).write(
        "#version 330 core\n// GENERATED by Tools/scenegen/make_chainpass.py -- the 3D lab: one plane's chain input\n"
        "out vec4 fragColor;\nuniform sampler2D texGPos;\nuniform int plane;\nuniform float solidP;\n" + start_main)
    # Final: colour, relief, light, rim, fog from the G-buffer and the three chain coordinates
    shade = mt[mt.index("    vec3 lc = "):mt.rindex("}")]
    i0 = shade.index("    if (hit) {")
    head, rest = shade[:i0], shade[i0:]
    fin_main = ("void main()\n{\n" + pre + cam +
        "    ivec2 ip = ivec2(gl_FragCoord.xy - chainOff);\n"
        "    vec4 gp = texelFetch(texGPos, ip, 0), gn = texelFetch(texGNrm, ip, 0);\n"
        "    float t = gp.w; bool hit = t >= 0.0;\n"
        "    vec3 fp = gp.xyz;\n" + head +
        "    // colour and relief for every pixel: the derivatives must not sit in a pixel branch\n"
        "    vec3 q = ro + rd * max(t, 0.0);\n"
        "    vec3 n = normalize(gn.xyz + vec3(1e-6));\n"
        "    float lod = clamp(log2(max(t, 0.05) * 2.0) + 1.5 * (1.0 - clamp(detailP, 0.0, 1.0)), 0.0, 7.0);\n"
        "    vec3 nGeo = n;                                          // texture on the geometric normal, light on the bumped one\n"
        "    vec3 tex0 = colour3T(nGeo, lod, 0.2 + 0.7 * clamp(paletteP, 0.0, 1.0));\n"
        "    // relief: the colour chain's brightness as height; its slope on the surface from the\n"
        "    // screen-space derivatives (bump mapping without tangents, Mikkelsen 2010)\n"
        "    float hgt = luma(tex0);\n"
        "    vec3 dpx = dFdx(q), dpy = dFdy(q);\n"
        "    float dhx = dFdx(hgt), dhy = dFdy(hgt);\n"
        "    if (reliefP > 0.3) {\n"
        "        vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);\n"
        "        float det = dot(dpx, r1);\n"
        "        vec3 sg = (dhx * r1 + dhy * r2) / (abs(det) > 1e-14 ? det : 1e-14);\n"
        "        sg = sg / max(1.0, length(sg) * 0.1);                    // silhouettes: no spikes\n"
        "        n = normalize(n - sg * 0.05 * smoothstep(0.3, 1.0, reliefP));\n"
        "    }\n" + rest +
        "    // keeps the walk uniforms: the app finds the lab's stages by their locations\n"
        "    if (walkHost < -1.0) col += vec3(walkA.x + walkB.x + walkC.x + walkD.x + walkS.x + walkSpace.x + walkCore.x + walkBody.x);\n"
        "    finish(col);\n}\n")
    # inside the hit branch: the G-buffer replaces the march results
    _nline = "        vec3 n = normalS(q);\n" if slice_ else "        vec3 n = normal3(q);\n"
    assert ("        vec3 q = ro + rd * t;\n" + _nline) in fin_main, "3D final: the hit point lines changed"
    fin_main = fin_main.replace("        vec3 q = ro + rd * t;\n" + _nline, "")
    fin_main = re.sub(r"        float lod = clamp\(log2\(t \* 2\.0\).*?\n", "", fin_main)
    fin_main = fin_main.replace("        vec3 nGeo = n;                                          // texture on the geometric normal, light on the bumped one\n", "")
    k0 = fin_main.index("        if (reliefP > 0.3) {")
    k1 = fin_main.index("        vec3 tex = colour3(")
    fin_main = fin_main[:k0] + fin_main[k1:]
    fin_main = re.sub(r"        vec3 tex = colour3\(fp, nGeo, lod, [^;]*\);", "        vec3 tex = tex0;", fin_main)
    fin_main = re.sub(r"        float ao = 0\.0;\n        for \(int k = 1; k <= 2; \+\+k\) \{[^\n]*\n        ao = clamp\([^\n]*\n",
                      "        float ao = gn.w;\n", fin_main)
    assert fieldF not in fin_main and normalF not in fin_main and "colour3(" not in fin_main, "3D final: march code left"
    colour3t = r"""vec3 colour3T(vec3 n, float lod, float pal)
{
    // the three projection planes' chain coordinates, weighted by the normal (tiny weights skipped)
    vec3 w = max(pow(abs(n), vec3(4.0)) - 0.03, 0.0); w /= (w.x + w.y + w.z);
    ivec2 ip = ivec2(gl_FragCoord.xy - chainOff);
    vec3 c = vec3(0.0);
    if (w.x > 0.0) c += chainPlaneC(texelFetch(texChain0, ip, 0).xy, lod, pal) * w.x;
    if (w.y > 0.0) c += chainPlaneC(texelFetch(texChain1, ip, 0).xy, lod, pal) * w.y;
    if (w.z > 0.0) c += chainPlaneC(texelFetch(texChain2, ip, 0).xy, lod, pal) * w.z;
    return c;
}"""
    cp = body[body.index("vec3 chainPlane(vec2 uv, float lod, float pal)"):]
    cp = cp[:cp.index("\n}\n") + 3]
    cpc = cp.replace("vec3 chainPlane(vec2 uv, float lod, float pal)", "vec3 chainPlaneC(vec2 c, float lod, float pal)").replace("    vec2 c = chain(uv);\n", "")
    fin_src = preprocess(body, set(), {"SPEC_SP0", "SPEC_A0", "SPEC_B0", "SPEC_C0", "SPEC_D0"})
    fin_main = cpc + "\n" + colour3t + "\n" + fin_main
    _DocFile(os.path.join(OUT, "Final_" + base + ".frag")).write(assemble(
        fin_src, fin_main, ["// @chain3d", "out vec4 fragColor;", "uniform sampler2D texGPos, texGNrm;   // the geometry pass",
                            "uniform sampler2D texChain0, texChain1, texChain2;   // the colour chain per projection plane",
                            "uniform vec2 chainOff;"],
        "the 3D lab's last pass: colour, relief, light and fog from the G-buffer"))

def main():
    lab = io.open(os.path.join(ROOT, "Scene2D", "ChainLab2D.frag"), encoding="utf-8").read()
    src2 = io.open(os.path.join(SG, "src", "ChainLab2D.glsl"), encoding="utf-8").read()
    body = strip_comments(lab)
    body = re.sub(r"#ifdef SPEC_.*?#endif\n", "", body, flags=re.S)   # the specialised copies are not needed
    items = [it for it in top_level_items(body) if not (it[0] == "pp" and it[2].startswith("#version"))]
    funcs = {}
    for kind, name, text in items:
        if kind == "func":
            funcs.setdefault(name, []).append(text)
    lab_main = funcs.pop("main")[0]              # the lab's own main is never part of a pass

    PRE = """    gT = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
    if (useStart == 0 && tiltP > 0.0) {       // the time tilt (chainTiltZ): the same shift in every pass of this pixel
        vec2 sp0 = ((gl_FragCoord.xy / (passScale > 0.0 ? passScale : 1.0) + chainOff) / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0);
        float tz = chainTiltZ(bakeSize > 0.0 ? gl_FragCoord.xy / bakeSize * 2.0 - 1.0 : sp0);
        gT += tz; gRot += 0.5 * tz;
    }
"""
    def shader(cls_body, extra_uniforms, main_body, title):
        cls = "vec2 cls(vec2 uv, float v)\n{\n    %s\n    return uv;\n}\n" % strip_comments(cls_body).strip()
        main = "void main()\n{\n" + PRE + main_body + "}\n"
        need = idents(strip_comments(cls + main)) | {"mirrorUV", "screenP"}
        keep_f = set()
        frontier = set(n for n in need if n in funcs)
        while frontier:
            f = frontier.pop()
            if f in keep_f:
                continue
            keep_f.add(f)
            for t in funcs[f]:
                frontier |= set(n for n in idents(t) if n in funcs and n not in keep_f)
        used = set(need)
        for f in keep_f:
            for t in funcs[f]:
                used |= idents(t)
        out = ["#version 330 core", "// GENERATED by Tools/scenegen/make_chainpass.py from Scene2D/ChainLab2D.frag -- " + title,
               "out vec4 fragColor;", "uniform sampler2D texIn;", "uniform int firstPass;", "uniform float subV;",
               "uniform vec2 chainOff;   // the target viewport's origin (gl_FragCoord of the lab = pass pixel + chainOff)",
               "uniform float bakeSize;  // > 0: the chain baked over [0,1]^2 (a lab that reads it at arbitrary points)",
               "uniform sampler2D texStart;  // useStart: the chain's input per pixel (xy) and its time offset (z)",
               "uniform int useStart;",
               "uniform float passScale;   // the pass grid relative to the frame (chainScale; 0 = 1)",
               extra_uniforms]
        for kind, name, text in items:
            if kind == "pp":
                if text.startswith("#define") and text.split()[1] in used:
                    out.append(text)
            elif kind == "decl":
                if any(n in used for n in name) and "sampler" not in text and not text.strip().startswith("out "):
                    out.append(text.strip())
            elif name in keep_f:
                out.append(text.strip())
        out.append(cls)
        out.append(main)
        return "\n".join(o for o in out if o) + "\n"

    os.makedirs(OUT, exist_ok=True)
    std_main = """    vec4 st = useStart == 1 ? texelFetch(texStart, ivec2(gl_FragCoord.xy), 0) : vec4(0.0);
    gT += 0.3 * st.z;                          // the solid look: the depth along the normal is the chain's time
    gRot += 0.15 * st.z;
    vec2 fc = gl_FragCoord.xy / (passScale > 0.0 ? passScale : 1.0) + chainOff;   // the lab's own pixel position (screenP)
    vec2 sp = (fc / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0);
    vec2 uv0 = useStart == 1 ? st.xy : (bakeSize > 0.0 ? gl_FragCoord.xy / bakeSize : sp * 0.5 + 0.5);
    vec2 uv = firstPass == 1 ? uv0 : mirrorUV(texelFetch(texIn, ivec2(gl_FragCoord.xy), 0).xy);
    fragColor = vec4(cls(uv, subV), 0.0, 1.0);
"""
    written = 0
    names = {}
    sys.path.insert(0, SG)
    import chain_classes as cc
    for st, (fn, ordf) in STAGE_FN.items():
        bodies, default = branch_bodies(src2, fn)
        m = re.search(r"int %s\(int i\) \{(.*?)\}" % ordf, src2)
        order = [int(x) for x in re.findall(r"return (\d+);", m.group(1))]
        knob = "chain%sP" % st
        for pos, br in enumerate(order):
            title = "stage %s, branch %d: %s" % (st, br, cc.CLASSES[knob][pos] or "none")
            if br in bodies:
                b = bodies[br]
                if b.strip().startswith("{"):
                    b = b.strip()[1:]
                    b = b[:b.rstrip().rfind("}")]
                code = b
            else:
                code = default
            main_body = std_main
            if st == "D" and br not in (0, 1, 5):     # the warp breathes with the swell (stageDs)
                main_body = std_main.replace("fragColor = vec4(cls(uv, subV), 0.0, 1.0);",
                                             "fragColor = vec4(morphMix(uv, cls(uv, subV), 0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0)), 0.0, 1.0);")
                assert main_body != std_main
            _DocFile(os.path.join(OUT, "%s%d.frag" % (st, br))).write(
                shader(code, "", main_body, title))
            written += 1
    # identity (a 'none' stage inside a fade), mix, fallback
    _DocFile(os.path.join(OUT, "Id.frag")).write(
        shader("return uv;", "", std_main, "identity"))
    _DocFile(os.path.join(OUT, "Mix.frag")).write(
        shader("return uv;", "uniform sampler2D texB;\nuniform float mixF;",
               """    vec2 a = texelFetch(texIn, ivec2(gl_FragCoord.xy), 0).xy, b = texelFetch(texB, ivec2(gl_FragCoord.xy), 0).xy;
    fragColor = vec4(mix(mirrorUV(a), mirrorUV(b), mixF), 0.0, 1.0);
""", "mix of two coordinates (a stage or order fade)"))
    _DocFile(os.path.join(OUT, "Fallback.frag")).write(
        shader("return tHex(tRot(mirrorUV(uv), gCw, 0.5 * gRot), 2.5);", "uniform float mixF;",
               """    vec2 a = texelFetch(texIn, ivec2(gl_FragCoord.xy), 0).xy;
    fragColor = vec4(mix(mirrorUV(a), mirrorUV(cls(a, 0.0)), mixF), 0.0, 1.0);
""", "the calm lattice faded in where the chain is too weak"))
    for rel, name, bake in (("Scene2D/ChainLab2D.frag", "ChainLab2D", 0), ("FX/FxChain.frag", "FxChain", 0),
                            ("Scene2D/ChainLabTunnel.frag", "ChainLabTunnel", 2048)):
        write_final(rel, name, bake)
    write_3d()
    if os.path.exists(os.path.join(ROOT, "Scene2D", "ChainSlice3D.frag")):
        write_3d("ChainSlice3D")
    print("chain passes:", written, "+ Id, Mix, Fallback, Final_ChainLab2D, Final_FxChain ->", OUT)

if __name__ == "__main__":
    main()
