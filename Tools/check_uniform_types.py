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


def main():
    cfgs = sys.argv[1:] or [os.path.join(ROOT, "Configurations", "Komplett.xml")]
    seen, bad, missing = {}, [], []

    for cfg in cfgs:
        if not os.path.isfile(cfg):
            print("no such config: %s" % cfg)
            return 2
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
        return 0

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
