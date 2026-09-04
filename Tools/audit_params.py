#!/usr/bin/env python3
"""
audit_params.py -- cross-checks every registered shader's ACTUAL declared
uniform float/int params (the `xxxP` convention) against what Komplett.xml
registers for it.

Unlike PresetEditor.exe --validate (which only checks that OTHER preset
files are a subset of Komplett.xml's OWN registration), this reads the real
GLSL source, so it catches the case where Komplett.xml itself has drifted
from the shader -- stale param names left over from an earlier version of
the file, registered params the shader no longer declares, or uniforms the
shader added that were never registered at all.

Usage:  python Tools/audit_params.py
"""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KOMPLETT = ROOT / "Presets" / "Komplett.xml"

UNIFORM_RE = re.compile(r'^\s*uniform\s+(float|int)\s+([A-Za-z0-9_]+)\s*;', re.MULTILINE)

# Uniforms the ENGINE itself sets every frame (RenderPipeline / Scene3DShader /
# EffectShader system state) -- these are never, and should never be, driven
# by a preset's <float>/<int>/<expr>/<bool>, so they're excluded from both
# the "missing" and "stale" comparison rather than flagged as false bugs.
SYSTEM_UNIFORMS = {
    "resolution", "time", "interpolation", "interpolationRotation",
    "sceneSeed", "eyeOff", "projM", "frameIndex", "genPass", "maxVertices",
    "shadowPass", "shadowPass2", "shadowExtent", "shadowTexel", "oitPass",
    "cubeBudget", "budget", "ssmFill", "ssmHead",
    "tanHalfFov", "dayPhase", "depthValid", "nearFar",
    "spectroHead", "spectroFill",
}

# rig*/rig2* params steer the shared camera transform RenderPipeline bakes
# into projM for every Scene2D/Scene3D shader from preset <expr> formulas --
# they're never a GLSL uniform the shader itself declares, so a shader never
# "declaring" one isn't a mismatch to flag.
RIG_PREFIX_RE = re.compile(r'^rig2?[A-Z]')


def shader_custom_params(frag_path: Path):
    """Return the set of uniform float/int names that are per-activation
    preset params -- i.e. everything except known engine-driven system
    uniforms and the audioXxx family. Scans the .frag AND every companion
    pipeline-stage file with the same basename (.vert/.geom/.comp/.tesc/
    .tese) -- Scene3D scenes very often declare their custom params in the
    vertex or geometry stage (wedge placement, camera distance, ...) rather
    than the fragment shader, which a .frag-only scan would completely miss."""
    names = set()
    for ext in (".frag", ".vert", ".geom", ".comp", ".tesc", ".tese"):
        p = frag_path.with_suffix(ext)
        if not p.is_file():
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        for _, name in UNIFORM_RE.findall(text):
            if name.startswith("audio") or name in SYSTEM_UNIFORMS:
                continue
            names.add(name)
    return names


def main():
    tree = ET.parse(KOMPLETT)
    root = tree.getroot()

    # file (as written in the XML, e.g. "..\Scene2D\Foo.frag") -> element
    entries = []
    for tag in ("TextureShader", "CombineShader", "TransitionShader"):
        for el in root.findall(tag):
            f = el.get("file")
            if f:
                entries.append((tag, f, el))

    missing_total = 0
    extra_total = 0
    files_checked = 0
    files_with_issues = 0

    for tag, xmlfile, el in entries:
        rel = xmlfile.replace("\\", "/").lstrip("./")
        shader_path = ROOT / rel
        if not shader_path.is_file():
            continue  # a different, unrelated problem -- not this script's job
        files_checked += 1

        declared = shader_custom_params(shader_path)
        registered = set()
        for child in el:
            if child.tag in ("float", "int", "bool", "expr", "interpolator") and child.get("name"):
                registered.add(child.get("name"))
        registered = {n for n in registered if not RIG_PREFIX_RE.match(n)}

        missing = declared - registered   # shader uses it, XML never sets it
        extra = registered - declared     # XML sets it, shader doesn't use it (harmless but stale)

        if missing or extra:
            files_with_issues += 1
            print(f"=== {rel} ({tag}) ===")
            if missing:
                missing_total += len(missing)
                print(f"  MISSING (declared in shader, not in Komplett.xml): {sorted(missing)}")
            if extra:
                extra_total += len(extra)
                print(f"  STALE   (in Komplett.xml, not declared in shader): {sorted(extra)}")

    print()
    print(f"audit_params: {files_checked} registered shader file(s) checked, "
          f"{files_with_issues} with a mismatch "
          f"({missing_total} missing param(s), {extra_total} stale param(s))")

    sys.exit(1 if missing_total else 0)


if __name__ == "__main__":
    main()
