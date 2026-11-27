# -*- coding: utf-8 -*-
"""The voices' roles (plan 26.11.2026, I2) into the labs' sources: finish(X) -> finish(voiceRoles(X, screenP())).

    python Tools/scenegen/patch_voices.py            # the twenty labs of 23.10.2026 (src/<Lab>.glsl)
    python Tools/scenegen/patch_voices.py A B        # these sources
    then: python Tools/scenegen/gen.py <the same names>

voiceRoles() (gen.py VOICE_LIB) puts every voice of the music onto a part of the picture of its own -- the kick the
bright form, the snare a ring, the hi-hat a glitter, the melody a band, the stereo balance the side, the build-up the
tension, the bar phase a wandering beam -- with the strength voiceP; without voiceP in the preset entry it returns the
colour untouched, and the lab looks as before.  Idempotent: a source that already calls voiceRoles( is left alone.
"""
import io
import os
import re
import sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
LABS = ["AtlasLab", "BandLab", "DefectLab", "DiffractionLab", "EngravingLab", "ExposureLab", "FlowPaintLab", "FoldLab",
        "GlassLab", "LayerCutLab", "MeterLab", "MicroscopeLab", "MirrorBilliardLab", "PartitionLab", "PerceptionLab",
        "SeparationLab", "SequenceLab", "StripLab", "TimeChainLab", "TwinPhotoLab"]
DOC = (" *   voiceP          -> the voices' roles (voiceRoles(), plan 26.11.2026): kick, snare, hi-hat, melody, stereo,\n"
       " *                      build-up and bar phase each light a part of the picture of their own; 0 = as before\n")


def patch(name):
    """Patches one source; returns what was done."""
    path = os.path.join(SRC, name + ".glsl")
    src = io.open(path, encoding="utf-8", newline="").read()
    if "voiceRoles(" in src:
        return "already"
    crlf = "\r\n" in src                                  # some sources are CRLF (written by make_chains*.py)
    src = src.replace("\r\n", "\n")
    calls = list(re.finditer(r"^(\s*)finish\((.*)\);\s*$", src, re.M))
    if len(calls) != 1:
        raise SystemExit("%s: %d finish() calls, expected one" % (name, len(calls)))
    m = calls[0]
    src = src[:m.start()] + "%sfinish(voiceRoles(%s, screenP()));" % (m.group(1), m.group(2)) + src[m.end():]
    k = src.find("\n * Knobs:")
    if k < 0:
        raise SystemExit("%s: no ' * Knobs:' line in the doc" % name)
    blank = src.rfind("\n *\n", 0, k + 1)
    at = blank + 1 if blank >= 0 and blank > k - 4 else k + 1
    src = src[:at] + DOC + src[at:]
    io.open(path, "w", encoding="utf-8", newline="").write(src.replace("\n", "\r\n") if crlf else src)
    return "patched"


def main():
    names = sys.argv[1:] or LABS
    for n in names:
        print("%-20s %s" % (n, patch(n)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
