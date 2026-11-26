# -*- coding: utf-8 -*-
r"""guard_run.py -- the picture guard over hours of music, as video exports (docs/PLAN_2026-11-26.md W1).

A long live run of the guard is mostly waiting, so it runs as video exports instead (Kaleidoscope.exe -e): the
scheduler, the photos and the guard all go by the export's frame clock, a track of six minutes renders in one or
two.  Each (preset, track) is one export -- a chunk of its own, resumable, and each goes through the machine's lock
when KALEIDO_HEAVY names one -- with the guard on (KALEIDO_GUARD=1; an export is a scripted run, where it is off
otherwise) and its sample lines (KALEIDO_GUARD_LOG=1).  At the end: every action with a thumbnail from its video, as
one contact sheet (Tools/guard_report.py).

    python Tools/guard_run.py --out DIR --tracks a.wav,b.wav --presets Allround,Club [--size 1280x720 --fps 15]
    python Tools/guard_run.py --out DIR --sheet DIR\guard_actions.jpg      # only the sheet, from what is there

Each chunk leaves DIR\<preset>__<track>.log, .mp4 and .guard.tsv (the count file the guard wrote beside its private
settings copy).  KALEIDO_GUARD=log instead watches only (--watch).
"""
import argparse
import io
import os
import shutil
import subprocess
import sys
import time
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from private_settings import PrivateSettings  # noqa: E402
import guard_report  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RELEASE = os.path.join(ROOT, "Release")
# A machine-wide lock for heavy jobs, if the machine has one: a script taking "<label> -- <command ...>".
HEAVY = os.environ.get("KALEIDO_HEAVY", "")
QT_BIN = os.environ.get("QTDIR", r"C:\Qt\6.11.1\msvc2022_64") + r"\bin"


def seconds(wav):
    w = wave.open(wav)
    s = w.getnframes() / float(w.getframerate())
    w.close()
    return s


def chunk(out, preset, wav, size, fps, watch, label):
    tag = "%s__%s" % (preset, os.path.splitext(os.path.basename(wav))[0])
    log, vid = os.path.join(out, tag + ".log"), os.path.join(out, tag + ".mp4")
    if os.path.exists(log) and os.path.exists(vid) and "[export] done" in io.open(log, errors="ignore").read():
        print("  %s: done before" % tag)
        return tag
    ps = PrivateSettings("guard")
    env = ps.env(os.environ)
    env.update(KALEIDO_GUARD="log" if watch else "1", KALEIDO_GUARD_LOG="1", KALEIDO_NO_ACTIVATE="1",
               KALEIDO_NP_FAKE="none|none@999999", KALEIDO_MAX_RUNTIME_SECS=str(int(seconds(wav) + 600)))
    env["PATH"] = QT_BIN + os.pathsep + env.get("PATH", "")
    cmd = [os.path.join(RELEASE, "Kaleidoscope.exe"), "-c", preset, "-e", wav, "-g", size, "-p", str(fps),
           "-d", vid, "-j", "nofade,q=compact", "-t", "0"]
    if HEAVY and os.path.exists(HEAVY):  # the machine's lock, where there is one
        cmd = [sys.executable, HEAVY, "%s: %s" % (label, tag), "--"] + cmd
    t0 = time.time()
    with io.open(log, "w", encoding="utf-8", errors="replace") as fh:
        rc = subprocess.run(cmd, cwd=RELEASE, env=env, stdout=fh, stderr=subprocess.STDOUT).returncode
    counts = os.path.join(os.path.dirname(env["KALEIDO_SETTINGS"]), "kaleidoscope_guard.tsv")
    if os.path.exists(counts):
        shutil.copy(counts, os.path.join(out, tag + ".guard.tsv"))
    ps.close()
    print("  %s: exit %d, %.0f s for %.0f s of music" % (tag, rc, time.time() - t0, seconds(wav)), flush=True)
    return tag


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True)
    ap.add_argument("--tracks", default="")
    ap.add_argument("--presets", default="Allround")
    ap.add_argument("--size", default="1280x720")
    ap.add_argument("--fps", type=int, default=15)
    ap.add_argument("--watch", action="store_true", help="KALEIDO_GUARD=log: say what it would do, do nothing")
    ap.add_argument("--label", default="guard", help="who runs it (the lock's label)")
    ap.add_argument("--sheet", help="contact sheet JPG of all actions (thumbnails from the videos)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    tracks = [t for t in a.tracks.split(",") if t]
    for preset in [p for p in a.presets.split(",") if p]:
        for wav in tracks:
            chunk(a.out, preset, wav, a.size, a.fps, a.watch, a.label)
    if a.sheet:
        acts_all = []
        for n in sorted(os.listdir(a.out)):
            if not n.endswith(".log"):
                continue
            acts, _ = guard_report.read([os.path.join(a.out, n)])
            vid = os.path.join(a.out, n[:-4] + ".mp4")
            for x in acts:
                x["video"] = vid
            acts_all += acts
        print("%d action(s) in %s" % (len(acts_all), a.out))
        by_video = {}
        for x in acts_all:
            by_video.setdefault(x["video"], []).append(x)
        # one sheet over all chunks: thumbnails per video, then tiled together
        tiles = []
        for vid, acts in by_video.items():
            part = os.path.splitext(a.sheet)[0] + "_" + os.path.splitext(os.path.basename(vid))[0] + ".jpg"
            guard_report.thumbs(acts, vid, part)
            tiles.append(part)
        if tiles:
            from PIL import Image
            ims = [Image.open(t) for t in tiles]
            w = max(i.width for i in ims)
            img = Image.new("RGB", (w, sum(i.height for i in ims)), (0, 0, 0))
            y = 0
            for i in ims:
                img.paste(i, (0, y))
                y += i.height
            img.save(a.sheet, quality=88)
            print("sheet: %s" % a.sheet)
    return 0


if __name__ == "__main__":
    sys.exit(main())
