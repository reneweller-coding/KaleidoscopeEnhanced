#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Pick the scan's fixed background photo: the one with MEDIAN brightness.

    python Tools/pick_scan_image.py <photo-dir> <dest-dir>

scan_scenes.ps1 pins one image so that scenes which fold the background photo
give comparable numbers between runs -- with a random photo per run their luma
moved by up to 2.7x, which drowns any real defect (a control re-scan of ten
flagged scenes reproduced only four verdicts; with a pinned image, nine).

But WHICH image still matters for the absolute verdicts. An arbitrary pick --
say, first by filename -- can be unusually bright or dark, and then every
image-folding scene inherits that bias and reads TOO_BRIGHT or TOO_DARK for a
reason that has nothing to do with the scene. Taking the median-brightness
photo makes the pinned run representative of the collection, and it is still
fully deterministic: same folder, same choice, on any machine.

The result is cached in <dest-dir>, so this survey runs once.
"""
import os
import sys
import glob

try:
    from PIL import Image, ImageStat
except ImportError:
    sys.stderr.write("pick_scan_image: needs Pillow\n")
    sys.exit(2)

EXTS = ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG")


def main():
    if len(sys.argv) < 3:
        sys.stderr.write(__doc__)
        return 2
    src, dest = sys.argv[1], sys.argv[2]

    files = []
    for e in EXTS:
        files += glob.glob(os.path.join(src, "**", e), recursive=True)
    files = sorted(set(files))
    if not files:
        sys.stderr.write("pick_scan_image: no photos in %s\n" % src)
        return 1

    scored = []
    for f in files:
        try:
            im = Image.open(f)
            im.draft("L", (64, 64))          # let the JPEG decoder downscale for us
            scored.append((ImageStat.Stat(im.convert("L")).mean[0], f))
        except Exception:
            continue                          # unreadable file: just skip it
    if not scored:
        sys.stderr.write("pick_scan_image: no readable photos in %s\n" % src)
        return 1

    scored.sort()
    luma, pick = scored[len(scored) // 2]

    os.makedirs(dest, exist_ok=True)
    out = os.path.join(dest, "scan" + os.path.splitext(pick)[1].lower())
    for old in glob.glob(os.path.join(dest, "scan.*")):
        if old != out:
            os.remove(old)
    with open(pick, "rb") as fi, open(out, "wb") as fo:
        fo.write(fi.read())

    print("pick_scan_image: %d photos, median luma %.1f/255 -> %s"
          % (len(scored), luma, os.path.basename(pick)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
