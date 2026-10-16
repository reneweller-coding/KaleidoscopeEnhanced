#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Find uniforms whose XML type does not match their GLSL type.

    python Tools/check_uniform_types.py [config.xml ...]      (default: Komplett.xml)

Why this matters, and why it is not visible without help: Uniform.cpp uploads
<int> and <bool> with glUniform1i and <float> with glUniform1f. Point one at a
GLSL uniform of the other kind and the driver rejects the call with
GL_INVALID_OPERATION -- but RenderPipeline::checkGLErrors() is a no-op unless
KALEIDO_GL_DEBUG is set, so nothing is printed, and the uniform silently keeps
its default of 0.

That is not log noise, it is a visual defect. TunnelPlain declared
<float name="sides"> against `uniform int sides`, so its kaleidoscope fold
count sat at 0 forever; TunnelReverse declared <bool name="rotate"> against
`uniform float rotate`, so its rotation never switched on. Both raised one GL
error per frame (236 and 245 over a five second probe) that no normal run
would ever show.

The same holds for the uniforms the ENGINE sets (EffectShader.cpp, the audio uniforms: audioBass, audioStereoL ...):
each is uploaded with one glUniform call, and a shader that declares it with another type gets nothing.  Five scenes
declared audioStereoL/R as float while the engine sends a vec3 (low, mid, high) -- their stereo reaction stood at 0,
two GL errors a frame (found 16.10.2026 by the snapshot run's error lines).  Every shader file is checked against
the call the engine uses for each of those names, read from EffectShader.cpp itself.

Exit code is 1 if any mismatch is found, so this can gate a build.
"""
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# How Uniform.cpp actually uploads each declared kind.
UPLOAD = {"float": "f", "int": "i", "bool": "i"}
# What the GLSL side must therefore be.
GLSL_KIND = {"float": "f", "int": "i", "bool": "i", "uint": "i"}

DECL = re.compile(r"<(float|int|bool)\s+name=\"([^\"]+)\"", re.I)
SHADER = re.compile(
    r"<(TextureShader|CombineShader|TransitionShader)\s+file=\"([^\"]+)\"(.*?)</\1>",
    re.S | re.I)
UNIFORM = re.compile(r"^\s*uniform\s+(float|int|uint|bool)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;",
                     re.M)


def frag_path(raw):
    """Resolve a config file= path. Entries carry ..\\Dir\\X.frag, and some are
    written with DOUBLED backslashes -- a trap that has silently broken lookups
    in this repo before, so normalise before resolving."""
    p = raw.replace("\\\\", "\\").replace("\\", "/")
    p = re.sub(r"^\.\./", "", p)
    return os.path.join(ROOT, p)


# The GLSL types a glUniform call of the engine can set.
CALL_TYPES = {"glUniform1f": {"float"}, "glUniform1fv": {"float[]"}, "glUniform1i": {"int", "bool", "sampler"},
              "glUniform2f": {"vec2"}, "glUniform3f": {"vec3"}, "glUniform4f": {"vec4"},
              "glUniformMatrix4fv": {"mat4"}}
DECL_ANY = re.compile(r"^\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*(\[[^\]]*\])?\s*;", re.M)


def engine_uniforms():
    """{uniform name: the glUniform call EffectShader.cpp sets it with}, read from the AL_ enum, its name table and the
    calls on locs[AL_...]."""
    src = open(os.path.join(ROOT, "Source", "EffectShader.cpp"), encoding="utf-8", errors="replace").read()
    enum = re.search(r"enum AudioLocE\s*\{(.*?)\};", src, re.S).group(1)
    ids = [m for m in re.findall(r"\b(AL_\w+)\b", re.sub(r"//[^\n]*", "", enum)) if m != "AL_COUNT"]
    table = re.search(r"kAudioLocNames\[AL_COUNT\]\s*=\s*\{(.*?)\};", src, re.S).group(1)
    names = re.findall(r"\"(\w+)\"", re.sub(r"//[^\n]*", "", table))
    if len(ids) != len(names):
        raise SystemExit("EffectShader.cpp: %d AL_ ids, %d names" % (len(ids), len(names)))
    calls = {}
    for call, al in re.findall(r"(glUniform\w+)\(\s*locs\[(AL_\w+)\]", src):
        calls.setdefault(al, set()).add(call)
    return {names[i]: calls[al] for i, al in enumerate(ids) if al in calls}


def engine_checks():
    """Every shader file's declarations of engine uniforms against the engine's calls; returns the mismatches."""
    want = engine_uniforms()
    bad = []
    files = []
    for d in ("Scene2D", "Scene3D", "FX", "Transitions", "Engine"):
        for ext in ("frag", "vert", "geom"):
            files += glob.glob(os.path.join(ROOT, d, "**", "*." + ext), recursive=True)
    for path in files:
        src = open(path, encoding="utf-8", errors="replace").read()
        for gtype, name, arr in DECL_ANY.findall(src):
            if name not in want:
                continue
            kind = "sampler" if gtype.startswith("sampler") else gtype + ("[]" if arr else "")
            ok = set()
            for call in want[name]:
                ok |= CALL_TYPES.get(call, set())
            if kind not in ok:
                bad.append((os.path.relpath(path, ROOT), name, "/".join(sorted(want[name])), kind))
    return len(files), len(want), bad


def main():
    nfiles, nnames, ebad = engine_checks()
    print("engine uniforms: %d names, %d shader file(s)" % (nnames, nfiles))
    for f, n, call, g in sorted(ebad):
        print("  %-48s %-18s engine %-14s shader %s" % (f, n, call, g))
    if ebad:
        print("%d engine uniform(s) declared with a type the engine does not send: they stay 0." % len(ebad))
    cfgs = sys.argv[1:] or [os.path.join(ROOT, "Presets", "Komplett.xml")]
    seen, bad, missing = {}, [], []

    for cfg in cfgs:
        if not os.path.isfile(cfg):
            print("no such config: %s" % cfg)
            return 2
        # Well-formedness first. This checker is regex-based, so without this
        # it will happily bless a config that no XML parser accepts -- which is
        # exactly how a mismatched closing tag (<int ...></float>) slipped
        # through once: the regexes matched, the app's and verify.ps1's XML
        # parsers failed, and every probe silently fell back to a synthetic
        # geom="points" tag.
        try:
            import xml.dom.minidom
            xml.dom.minidom.parse(cfg)
        except Exception as e:
            print("MALFORMED XML: %s -> %s" % (cfg, e))
            return 1
        text = open(cfg, encoding="utf-8", errors="replace").read()
        for _tag, rawfile, body in SHADER.findall(text):
            path = frag_path(rawfile)
            if not os.path.isfile(path):
                missing.append(rawfile)
                continue
            src = seen.get(path)
            if src is None:
                src = seen[path] = open(path, encoding="utf-8", errors="replace").read()
            gl = {n: t for t, n in UNIFORM.findall(src)}
            for xtype, name in DECL.findall(body):
                gtype = gl.get(name)
                if gtype is None:
                    continue          # declared in XML, absent from GLSL: harmless
                if GLSL_KIND[gtype.lower()] != UPLOAD[xtype.lower()]:
                    bad.append((os.path.basename(path), name, xtype.lower(), gtype.lower()))

    print("checked %d shader file(s) from %d config(s)" % (len(seen), len(cfgs)))
    if missing:
        print("  (%d config entries pointed at a missing .frag)" % len(missing))
    if not bad:
        print("no uniform type mismatches")
        return 1 if ebad else 0

    print("")
    print("%-40s %-22s %-10s %s" % ("shader", "uniform", "XML says", "GLSL says"))
    print("-" * 88)
    for f, n, x, g in sorted(set(bad)):
        print("%-40s %-22s %-10s %s" % (f, n, x, g))
    print("")
    print("%d mismatch(es): the upload is rejected and the uniform stays 0."
          % len(set(bad)))
    return 1


if __name__ == "__main__":
    sys.exit(main())
