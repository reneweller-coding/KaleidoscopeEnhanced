# -*- coding: utf-8 -*-
"""check_build_lists.py -- the three build descriptions of the main program list the same sources.

Kaleidoscope.vcxproj is the reference build.  CMakeLists.txt (Linux/macOS) and Kaleidoscope.pro (Qt Creator on
Windows) name their sources by hand, and nothing kept them in step: CMake missed OsdMenu, ShaderForge,
ShaderForgeMain, ShaderWorker and VideoExport for weeks (the Linux link could not succeed), the .pro 22 files
and still named one deleted in July.  This script compares them with the vcxproj and fails on any difference.

Not compared, on purpose: moc/ (generated), ThirdParty/SpoutGL/ in CMake (Spout is Windows-only),
Source/Platform.cpp (only CMake builds it: the POSIX half of the platform seam).  The .pro's HEADERS hold every
header in Source/ (the vcxproj lists only some of them): qmake runs moc on the Q_OBJECT classes it finds there.

    python Tools/check_build_lists.py      # exit code 0 = in step, 1 = a list differs
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CMAKE_ONLY = {"Source/Platform.cpp"}


def norm(p):
    return p.strip().replace("\\", "/")


def vcxproj(kind):
    """The vcxproj's entries of one kind (ClCompile)."""
    src = io.open(os.path.join(ROOT, "Kaleidoscope.vcxproj"), encoding="utf-8-sig").read()
    return {norm(p) for p in re.findall(r'<%s Include="([^"]+)"' % kind, src)}


def cmake_sources():
    src = io.open(os.path.join(ROOT, "CMakeLists.txt"), encoding="utf-8").read()
    block = re.search(r"set\(KALEIDO_SOURCES(.*?)\)", src, re.S).group(1)
    return {norm(l) for l in block.split() if l.strip()}


def pro_list(var):
    """One of the .pro's backslash-continued lists (SOURCES or HEADERS)."""
    src = io.open(os.path.join(ROOT, "Kaleidoscope.pro"), encoding="utf-8").read()
    m = re.search(r"^%s \+= \\\n((?:.*\\\n)*.*)$" % var, src, re.M)
    return {norm(l.rstrip("\\")) for l in m.group(1).splitlines() if l.strip(" \\")} if m else set()


def compare(name, have, want, ref="the vcxproj does not build"):
    missing, extra = sorted(want - have), sorted(have - want)
    for p in missing:
        print("  %s lacks %s" % (name, p))
    for p in extra:
        print("  %s names %s, which %s" % (name, p, ref))
    return not missing and not extra


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    compiled = {p for p in vcxproj("ClCompile") if not p.startswith("moc/")}
    headers = {norm(os.path.relpath(p, ROOT)) for p in glob.glob(os.path.join(ROOT, "Source", "*.h"))}
    own = {p for p in compiled if not p.startswith("ThirdParty/")}
    ok = compare("CMakeLists.txt KALEIDO_SOURCES", cmake_sources() - CMAKE_ONLY, own)
    ok &= compare("Kaleidoscope.pro SOURCES", pro_list("SOURCES"), compiled)
    ok &= compare("Kaleidoscope.pro HEADERS", pro_list("HEADERS"), headers, "is not in Source/")
    missing_files = sorted(p for p in compiled if not os.path.exists(os.path.join(ROOT, p)))
    for p in missing_files:
        print("  the vcxproj names %s, which does not exist" % p)
    ok &= not missing_files
    print("build lists: %s (%d sources, %d headers)" % ("in step" if ok else "DIFFER", len(compiled), len(headers)))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
