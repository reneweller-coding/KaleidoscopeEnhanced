#!/usr/bin/env python3
"""The depth looks in more photo labs (27.11.2026, wave 4, agent "depthlabs"; docs/engine-internals.md (72)).

TimeChainLab and MirrorBilliardLab take `depthLook` 4 (the subject anchor, plan M2) and 6 (the anchor and frequency
by depth, plan P3) at their one photo lookup.  The labs below are built the same way -- one look function that ends
in `gPhD = photoDepthLod(puv, plod); ... imgLod(puv, plod)`, and a main that writes the walk's summed depth -- so the
same two looks go in mechanically: this script patches their sources in Tools/scenegen/src (idempotent) and rebuilds
exactly these labs with gen.py.  The look code itself is gen.py's ANCHOR_LIB and FREQ_LIB (assemble() appends them
for sources that call imgDepthOff( / freqDepth(): no second copy.

    python Tools/scenegen/patch_depthlabs.py              # all labs of LABS
    python Tools/scenegen/patch_depthlabs.py StripLab     # one
    python Tools/scenegen/patch_depthlabs.py --no-build   # patch the sources only

`depthLook` <= 3.5 (the default 0, and every preset without the knob) runs the old statements: the old picture.
New against the two older labs: `depthVar` (0..99) is the variant of look 6 (freqDepth()'s constants; 0 = the middle
of every range, what the two older labs always use).
"""
import io
import os
import sys

SP = os.path.dirname(os.path.abspath(__file__))
LABS = ["StripLab", "FoldLab", "GlassLab", "SequenceLab", "DefectLab", "MeterLab", "PartitionLab"]

GPHD = "float gPhD = 0.0;"
DECL = ("uniform float depthLook;   // 4: the subject anchor (plan M2) -- each photo is sampled around its own subject; "
        "6: the anchor and frequency by depth (plan P3); 0: the old look\n"
        "uniform float depthVar;    // the variant of look 6, 0..99: freqDepth()'s constants; 0 = the middle of every range\n")

DEPTH = "    gPhD = photoDepthLod(puv, plod);   // the depth where the colour is taken (26.11.2026)\n"
OLD_RET = DEPTH + "    return imgLod(puv, plod);\n"
OLD_COL = DEPTH + "    vec3 col = imgLod(puv, plod);\n"
ANCHOR = ("    if (depthLook > 3.5) {   // the subject anchor (plan M2); without it the colour stays bit for bit\n"
          "        vec4 aq = imgDepthOff(puv, anchorOff(photoFocus.xy, photoSubject.y, photoDepthAmt.x),\n"
          "                              anchorOff(photoFocus.zw, photoSubject.w, photoDepthAmt.y), plod);\n"
          "        gPhD = aq.w;\n")
NEW_RET = ANCHOR + "        return aq.rgb;\n    }\n" + OLD_RET
NEW_COL = ("    vec3 col;\n" + ANCHOR + "        col = aq.rgb;\n    } else {\n"
           "        gPhD = photoDepthLod(puv, plod);   // the depth where the colour is taken (26.11.2026)\n"
           "        col = imgLod(puv, plod);\n    }\n")

OLD_OUT = "    photoDepthOut(dsum / max(ws, 1e-3));\n"
FIN_HEAD = "    finish(voiceRoles(max(col / max(ws, 1e-3), 0.0)"
FIN_TAIL = ", screenP()));\n"

DOC = (" *   depthLook 4     -> the subject anchor (plan M2, 26.11.2026): each photo is sampled shifted by its own\n"
       " *                      subject's offset from the centre (photoFocus; none without a sure subject), so the\n"
       " *                      lab's centre shows the subject; 0 = the old look\n"
       " *   depthLook 6     -> the anchor and frequency by depth (freqDepth(), plan P3, 27.11.2026): the bass brightens\n"
       " *                      the photo's near layer, the mids raise the colour of its middle layer, the highs set\n"
       " *                      fine round glints into its far layer; light and colour only; depthVar = its variant\n")


def patch(name):
    """Patches one lab's source; returns True when it changed, False when it already carries the looks."""
    path = os.path.join(SP, "src", name + ".glsl")
    raw = io.open(path, encoding="utf-8", newline="").read()
    crlf = "\r\n" in raw
    src = raw.replace("\r\n", "\n")
    if "uniform float depthLook;" in src:
        return False
    assert src.count(GPHD) == 1 and src.count(OLD_OUT) == 1 and src.count(FIN_HEAD) == 1, name
    assert src.count(OLD_RET) + src.count(OLD_COL) == 1, name
    src = src.replace(GPHD, DECL + GPHD)
    src = src.replace(OLD_RET, NEW_RET).replace(OLD_COL, NEW_COL)
    a = src.index(FIN_HEAD)
    b = src.index(FIN_TAIL, a)
    gain = src[a + len(FIN_HEAD):b]                     # FoldLab: " * 1.1"
    assert src[a - len(OLD_OUT):a] == OLD_OUT, name
    new = ("    float phD = dsum / max(ws, 1e-3);\n"
           "    photoDepthOut(phD);\n"
           "    col = max(col / max(ws, 1e-3), 0.0)" + gain + ";\n"
           "    if (depthLook > 5.5)   // look 6: the subject anchor and frequency by depth (plan P3, 27.11.2026)\n"
           "        col = freqDepth(col, phD, screenP(), imgLod(screenP() * 0.5 + 0.5, 6.0), int(clamp(depthVar, 0.0, 99.0) + 0.5));\n"
           "    finish(voiceRoles(col, screenP()));\n")
    src = src[:a - len(OLD_OUT)] + new + src[b + len(FIN_TAIL):]
    k = src.index(" * Knobs:")
    if src[:k].endswith(" *\n"):
        k -= len(" *\n")
    src = src[:k] + DOC + src[k:]
    io.open(path, "w", encoding="utf-8", newline="").write(src.replace("\n", "\r\n") if crlf else src)
    return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    labs = args or LABS
    for n in labs:
        assert n in LABS, n
        print("%s: %s" % (n, "patched" if patch(n) else "already has the looks"))
    if "--no-build" not in sys.argv:
        sys.path.insert(0, SP)
        import gen
        for n in labs:
            gen.build(n)


if __name__ == "__main__":
    main()
