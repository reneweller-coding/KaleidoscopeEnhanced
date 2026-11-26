# -*- coding: utf-8 -*-
r"""guard_report.py -- what the picture guard (Source/PictureGuard.h, docs/PLAN_2026-11-26.md W1) saw and did.

The app writes two kinds of lines to its log (stderr):

    GUARD photo dark scene=Voyager photo=IMG_1.jpg mean=0.0031 peak=0.0120 step=0.0000 at=1234.5[ watching]
    GUARD sample scene=Voyager.frag mean=0.0412 peak=0.1800 step=0.0080 dark=0.0 still=2.3 armed=1 at=12.0

The first is an action (KALEIDO_GUARD=1 or the setting pictureGuard=true; " watching" with KALEIDO_GUARD=log, which
only says what it would do), the second a sample a second (KALEIDO_GUARD_LOG=1) -- what the thresholds were set from.

    python Tools/guard_report.py LOG [LOG ...]                     # the actions, and per scene what it saw
    python Tools/guard_report.py LOG --video V.mp4 --sheet S.jpg   # plus a thumbnail of each action (export runs:
                                                                   # "at" is the video's time)
    python Tools/guard_report.py LOG --scenes A,B,C                # only these scenes (the control scenes)
    python Tools/guard_report.py LOG --tsv out.tsv                 # per scene: samples, armed share, mean (min,
                                                                   # median), peak (max), longest stillness
Exit code 1 when one of --scenes has an action (the control scenes must have none).
"""
import argparse
import collections
import io
import os
import re
import subprocess
import sys

ACTION = re.compile(r"^GUARD (photo|scene) (dark|frozen) scene=(\S+) photo=(\S+) mean=([\d.]+) peak=([\d.]+) "
                    r"step=([\d.]+) at=([\d.]+)( watching)?", re.M)
SAMPLE = re.compile(r"^GUARD sample scene=(\S+) mean=([\d.]+) peak=([\d.]+) step=([\d.]+) dark=([\d.]+) "
                    r"still=([\d.]+) armed=(\d) at=([\d.]+)", re.M)


def stem(n):
    return n[:-5] if n.endswith(".frag") else n


def read(paths):
    acts, samples = [], collections.defaultdict(list)
    for p in paths:
        txt = io.open(p, encoding="utf-8", errors="replace").read()
        for m in ACTION.finditer(txt):
            acts.append(dict(log=os.path.basename(p), action=m.group(1), cause=m.group(2), scene=stem(m.group(3)),
                             photo=m.group(4), mean=float(m.group(5)), peak=float(m.group(6)),
                             step=float(m.group(7)), at=float(m.group(8)), watching=bool(m.group(9))))
        for m in SAMPLE.finditer(txt):
            samples[stem(m.group(1))].append(dict(mean=float(m.group(2)), peak=float(m.group(3)),
                                                  step=float(m.group(4)), dark=float(m.group(5)),
                                                  still=float(m.group(6)), armed=m.group(7) == "1",
                                                  at=float(m.group(8))))
    return acts, samples


def median(v):
    v = sorted(v)
    return v[len(v) // 2] if v else float("nan")


def thumbs(acts, video, sheet):
    """One frame per action from the export video (at its time), labelled, as a contact sheet JPG."""
    from PIL import Image, ImageDraw
    tmp = os.path.splitext(sheet)[0] + "_frames"
    os.makedirs(tmp, exist_ok=True)
    tiles = []
    for i, a in enumerate(acts):
        out = os.path.join(tmp, "%03d.jpg" % i)
        # the frame just before the action: what the guard looked at (the sample is 6..12 frames old anyway)
        t = max(0.0, a["at"] - 0.5)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "%.2f" % t, "-i", video, "-frames:v", "1",
                        "-vf", "scale=320:180", out], check=False)
        im = Image.open(out).convert("RGB") if os.path.exists(out) else Image.new("RGB", (320, 180))
        tile = Image.new("RGB", (320, 224), (16, 16, 24))
        tile.paste(im, (0, 0))
        d = ImageDraw.Draw(tile)
        d.text((4, 184), "%s %s  %.0f s" % (a["action"], a["cause"], a["at"]), fill=(240, 200, 120))
        d.text((4, 200), a["scene"][:44], fill=(220, 220, 230))
        d.text((4, 212), "mean %.4f peak %.3f" % (a["mean"], a["peak"]), fill=(150, 160, 180))
        tiles.append(tile)
    if not tiles:
        return
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    img = Image.new("RGB", (cols * 324, rows * 228), (0, 0, 0))
    for i, t in enumerate(tiles):
        img.paste(t, ((i % cols) * 324, (i // cols) * 228))
    img.save(sheet, quality=88)
    print("sheet: %s (%d actions)" % (sheet, len(tiles)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("logs", nargs="+")
    ap.add_argument("--video", help="the export video the log belongs to (thumbnails at the actions' times)")
    ap.add_argument("--sheet", help="contact sheet JPG of the actions")
    ap.add_argument("--scenes", help="only these scenes (comma list); exit 1 if any of them has an action")
    ap.add_argument("--tsv", help="per-scene statistics of the sample lines")
    a = ap.parse_args()
    acts, samples = read(a.logs)
    only = {s.strip() for s in a.scenes.split(",")} if a.scenes else None
    if only:
        acts = [x for x in acts if x["scene"] in only]
        samples = {k: v for k, v in samples.items() if k in only}
    by = collections.Counter((x["action"], x["cause"]) for x in acts)
    print("%d action(s): %s" % (len(acts), ", ".join("%s/%s %d" % (k[0], k[1], n) for k, n in sorted(by.items()))))
    for x in acts:
        print("  %8.1f s  %-5s %-6s %-40s photo=%s mean=%.4f peak=%.4f%s"
              % (x["at"], x["action"], x["cause"], x["scene"], x["photo"], x["mean"], x["peak"],
                 "  (watching)" if x["watching"] else ""))
    if samples:
        rows = []
        for n, v in samples.items():
            armed = [s for s in v if s["armed"]]
            rows.append((n, len(v), len(armed), min(s["mean"] for s in v), median([s["mean"] for s in v]),
                         max(s["peak"] for s in v), max(s["still"] for s in v), max(s["dark"] for s in v)))
        rows.sort(key=lambda r: r[3])
        print("\nper scene (%d), darkest first: samples, armed, mean min/median, peak max, longest still, longest "
              "dark (s)" % len(rows))
        for r in rows[:25]:
            print("  %-40s %4d %4d  %.4f %.4f  %.3f  %5.1f %5.1f" % r)
        if a.tsv:
            with io.open(a.tsv, "w", encoding="utf-8", newline="\n") as f:
                f.write("scene\tsamples\tarmed\tmean_min\tmean_med\tpeak_max\tstill_max\tdark_max\n")
                for r in rows:
                    f.write("%s\t%d\t%d\t%.5f\t%.5f\t%.4f\t%.1f\t%.1f\n" % r)
    if a.video and a.sheet:
        thumbs(acts, a.video, a.sheet)
    return 1 if only and acts else 0


if __name__ == "__main__":
    sys.exit(main())
