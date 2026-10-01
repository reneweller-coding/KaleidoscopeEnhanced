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
        fin_funcs["chain"] = ["vec2 chain(vec2 p)\n{\n    return texelFetch(texChain, ivec2(gl_FragCoord.xy - chainOff), 0).xy;\n}"]
    i = mt.rstrip().rfind("finish(col);")
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
           "uniform sampler2D texChain;", "uniform vec2 chainOff;"] + (["// @chainbake %d" % bake] if bake else [])
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
    io.open(os.path.join(OUT, "Final_%s.frag" % name), "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")

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
    std_main = """    vec2 fc = gl_FragCoord.xy + chainOff;     // the lab's own pixel position (screenP)
    vec2 sp = (fc / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0);
    vec2 uv0 = bakeSize > 0.0 ? gl_FragCoord.xy / bakeSize : sp * 0.5 + 0.5;   // bake: the chain over [0,1]^2
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
            io.open(os.path.join(OUT, "%s%d.frag" % (st, br)), "w", encoding="utf-8", newline="\n").write(
                shader(code, "", std_main, title))
            written += 1
    # identity (a 'none' stage inside a fade), mix, fallback
    io.open(os.path.join(OUT, "Id.frag"), "w", encoding="utf-8", newline="\n").write(
        shader("return uv;", "", std_main, "identity"))
    io.open(os.path.join(OUT, "Mix.frag"), "w", encoding="utf-8", newline="\n").write(
        shader("return uv;", "uniform sampler2D texB;\nuniform float mixF;",
               """    vec2 a = texelFetch(texIn, ivec2(gl_FragCoord.xy), 0).xy, b = texelFetch(texB, ivec2(gl_FragCoord.xy), 0).xy;
    fragColor = vec4(mix(mirrorUV(a), mirrorUV(b), mixF), 0.0, 1.0);
""", "mix of two coordinates (a stage or order fade)"))
    io.open(os.path.join(OUT, "Fallback.frag"), "w", encoding="utf-8", newline="\n").write(
        shader("return tHex(tRot(mirrorUV(uv), gCw, 0.5 * gRot), 2.5);", "uniform float mixF;",
               """    vec2 a = texelFetch(texIn, ivec2(gl_FragCoord.xy), 0).xy;
    fragColor = vec4(mix(mirrorUV(a), mirrorUV(cls(a, 0.0)), mixF), 0.0, 1.0);
""", "the calm lattice faded in where the chain is too weak"))
    for rel, name, bake in (("Scene2D/ChainLab2D.frag", "ChainLab2D", 0), ("FX/FxChain.frag", "FxChain", 0),
                            ("Scene2D/ChainLabTunnel.frag", "ChainLabTunnel", 2048)):
        write_final(rel, name, bake)
    print("chain passes:", written, "+ Id, Mix, Fallback, Final_ChainLab2D, Final_FxChain ->", OUT)

if __name__ == "__main__":
    main()
