# -*- coding: utf-8 -*-
r"""trans_frames.py -- the catalogue's pictures of a transition from inside the fade, and its strip of five moments.

The catalogue rendered every transition as a real-time recording and kept the frame with the most contrast
(Tools/pick_best_frame.py) -- for about half of them that was one of the two plain scenes, not the fade.  This renders
each transition once by the video export on the frame clock, between the catalogue's two reference scenes,
TunnelPlain (2D) and AuroraBorealisOverFjord (3D): both solo for 4 s, the fade 10 s, the transition forced
(KALEIDO_TRANS_STYLE), one fixed photo, 40 s of silence (so the configured fade length survives: with a beat the
scheduler clamps a fade to four beats).  The scheduler fades from the first scene to the other and back;
KALEIDO_FADE_LOG says for each fade which scene it went into, when it started and how long it ran, and the pictures are
taken at known points of it:

  C1  docs/Catalog/rendered/transmid/<Name>_2D.png (the fade over TunnelPlain, into the aurora) and _3D.png (over the
      aurora, into TunnelPlain) -- the middle of the fade (progress 0.5); if that frame is less than a quarter of the way
      from either end (a transition that does its work late), the frame of 0.3..0.7 farthest from both
  C2  docs/Catalog/strip/<Name>.jpg -- progress 0.1, 0.3, 0.5, 0.7, 0.9 of the 2D fade, side by side

    python Tools/trans_frames.py                    # every transition (resumable)
    python Tools/trans_frames.py --names A,B        # these
    python Tools/trans_frames.py --check            # distances of the pictures to the two ends (the acceptance)

Below normal priority, a private settings copy, one export at a time.
"""
import argparse
import glob
import io
import json
import os
import re
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import screen  # noqa: E402
from private_settings import PrivateSettings  # noqa: E402

ROOT = screen.ROOT
EXE = os.path.join(ROOT, "Release", "Kaleidoscope.exe")
QT_BIN = os.environ.get("QTDIR", r"C:\Qt\6.11.1\msvc2022_64") + r"\bin"
WORK = os.path.join(ROOT, ".screen", "transframes")
OUT = os.path.join(ROOT, "docs", "Catalog", "rendered", "transmid")
STRIP = os.path.join(ROOT, "docs", "Catalog", "strip")
PHOTO = "kristallhoehle-indigo-fuchsia-2.jpg"
A2D, A3D = "TunnelPlain", "AuroraBorealisOverFjord"
SIZE, FPS = (960, 540), 30
SOLO, FADE_SECS, SECS = 4, 10, 40
STRIP_AT = (0.1, 0.3, 0.5, 0.7, 0.9)
NEAR_END = 0.25        # a picture less than this share of the way from either end frame is not "in the fade"

TRANS = re.compile(r"[ \t]*<TransitionShader\b[^>]*>.*?</TransitionShader>[ \t]*\n", re.S)
FADE_RE = re.compile(r"^FADE (\S+) via (\S+): ([\d.]+) s .* at ([\d.]+) s", re.M)


def base(path):
    """The shader's name from a logged path."""
    return re.split(r"[\\/]", path)[-1].replace(".frag", "")


def timing(block, solo, fade):
    """A Komplett.xml block with fixed solo and fade times and probability 1."""
    head, rest = block.split(">", 1)
    head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo|minTimeInterpolation|maxTimeInterpolation)="[^"]*"', "", head)
    return head + (' probability="1.0" minTimeSolo="%d" maxTimeSolo="%d" minTimeInterpolation="%d" '
                   'maxTimeInterpolation="%d">' % (solo, solo, fade, fade)) + rest


def transitions():
    """{name: block} of every transition in Komplett.xml."""
    src = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
    out = {}
    for m in TRANS.finditer(src):
        n = re.search(r'file="[^"]*?(\w+)\.frag"', m.group(0))
        if n:
            out.setdefault(n.group(1), m.group(0))
    return out


def silence():
    """40 s of silence (48 kHz stereo)."""
    p = os.path.join(WORK, "silence_%d.wav" % SECS)
    if not os.path.exists(p):
        w = wave.open(p, "wb")
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(48000)
        w.writeframes(b"\0" * (48000 * 4 * SECS))
        w.close()
    return p


def export(name, tblock, scenes, plain):
    """One export; returns (video, log text)."""
    first = {}
    for n, b in scenes:
        first.setdefault(n, b)
    cfg = "_transframes"
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="%s" hidden="true">\n' % cfg
           + timing(first[A2D], SOLO, FADE_SECS) + timing(first[A3D], SOLO, FADE_SECS) + timing(tblock, 60, FADE_SECS)
           + plain + "</configuration>\n")
    preset = os.path.join(ROOT, "Presets", cfg + ".xml")
    io.open(preset, "w", encoding="utf-8").write(xml)
    vid = os.path.join(WORK, "%s.mp4" % name)
    ps = PrivateSettings("transframes")
    env = ps.env(os.environ)
    env.update(PATH=QT_BIN + os.pathsep + env.get("PATH", ""), KALEIDO_NO_ACTIVATE="1", KALEIDO_NO_MIDI="1",
               KALEIDO_SEED="2", KALEIDO_TRANS_STYLE=name + ".frag", KALEIDO_FADE_LOG="1",
               KALEIDO_FIXED_PHOTO=PHOTO, KALEIDO_MAX_RUNTIME_SECS="300")
    try:
        r = subprocess.run([EXE, "-c", cfg, "-e", silence(), "-g", "%dx%d" % SIZE, "-p", str(FPS), "-d", vid, "-j",
                            "nofade", "-t", "0"], cwd=os.path.dirname(EXE), env=env, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", creationflags=0x00004000 if os.name == "nt" else 0)
    finally:
        os.remove(preset)
        ps.close()
    return (vid if os.path.exists(vid) else None), (r.stdout or "") + (r.stderr or "")


def frames(vid, times, size=None):
    """RGB frames at these times (seconds) -- one ffmpeg seek each."""
    out = []
    w, h = size or SIZE
    for t in times:
        args = ["ffmpeg", "-v", "error", "-ss", "%.3f" % t, "-i", vid, "-frames:v", "1"]
        if size:
            args += ["-vf", "scale=%d:%d" % size]
        args += ["-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
        b = subprocess.run(args, capture_output=True).stdout
        out.append(np.frombuffer(b[:w * h * 3], np.uint8).reshape(h, w, 3) if len(b) >= w * h * 3 else None)
    return out


def dist(a, b):
    """Mean absolute difference, 0..1."""
    return float(np.abs(a.astype(np.float32) - b.astype(np.float32)).mean() / 255.0)


def one(name, tblock, scenes, plain):
    """Both pictures (and the strip) of one transition; returns its record (also written to WORK/<name>.json)."""
    from PIL import Image
    rec_path = os.path.join(WORK, name + ".json")
    if os.path.exists(rec_path):
        return json.load(io.open(rec_path))
    vid, log = export(name, tblock, scenes, plain)
    rec = {}
    fades = [(base(f.group(1)), float(f.group(3)), float(f.group(4))) for f in FADE_RE.finditer(log)
             if base(f.group(2)) == name]
    for into, dur, start in fades:
        dim = "2D" if into == A3D else "3D"          # 2D: over TunnelPlain into the aurora; 3D: the other way
        if dim in rec or not vid or start + dur > SECS - 0.5:
            continue
        small = (240, 135)
        ends = frames(vid, (start - 0.15, start + dur + 0.25), small)
        cand = [0.3, 0.4, 0.5, 0.6, 0.7]
        mids = frames(vid, [start + f * dur for f in cand], small)
        span = dist(ends[0], ends[1]) if ends[0] is not None and ends[1] is not None else 0.0
        score = [min(dist(m, ends[0]), dist(m, ends[1])) / max(span, 1e-3)
                 if m is not None and span > 0.0 else -1.0 for m in mids]
        pick = 0.5 if score[2] >= NEAR_END else cand[int(np.argmax(score))]
        big = frames(vid, (start + pick * dur,))[0]
        if big is None:
            continue
        os.makedirs(OUT, exist_ok=True)
        Image.fromarray(big).save(os.path.join(OUT, "%s_%s.png" % (name, dim)))
        rec[dim] = {"start": start, "dur": dur, "pick": pick, "near_end": max(score), "mid": score[2]}
        if dim == "2D":
            strip = frames(vid, [start + f * dur for f in STRIP_AT], (288, 162))
            if all(s is not None for s in strip):
                os.makedirs(STRIP, exist_ok=True)
                Image.fromarray(np.concatenate(strip, axis=1)).save(os.path.join(STRIP, name + ".jpg"), quality=78)
    if vid:
        os.remove(vid)
    if not rec:
        rec["error"] = "no fade of %s in the log" % name if vid else "no video"
    io.open(rec_path, "w").write(json.dumps(rec))
    return rec


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--names", default="")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(WORK, exist_ok=True)
    if a.check:
        recs = {os.path.basename(p)[:-5]: json.load(io.open(p)) for p in glob.glob(os.path.join(WORK, "*.json"))}
        vals = [(n, d, r[d]["near_end"], r[d]["pick"]) for n, r in recs.items() for d in ("2D", "3D") if d in r]
        missing = [(n, d) for n, r in recs.items() for d in ("2D", "3D") if d not in r]
        bad = [v for v in vals if v[2] < NEAR_END]
        print("%d pictures, %d missing %s" % (len(vals), len(missing), missing[:10]))
        print("closer than %.2f to an end frame: %d %s" % (NEAR_END, len(bad), sorted(bad, key=lambda v: v[2])[:12]))
        print("taken at a progress other than 0.5: %d" % sum(1 for v in vals if v[3] != 0.5))
        print("strips: %d, %.1f MB" % (len(glob.glob(os.path.join(STRIP, "*.jpg"))),
                                        sum(os.path.getsize(p) for p in glob.glob(os.path.join(STRIP, "*.jpg"))) / 1048576.0))
        return 0
    scenes, plain, _ = screen.read_master()
    tr = transitions()
    names = sorted(tr) if not a.names else [n for n in a.names.split(",") if n in tr]
    for i, n in enumerate(names):
        rec = one(n, tr[n], scenes, plain)
        print("%3d/%d %-30s %s" % (i + 1, len(names), n,
                                   " ".join("%s:p%.1f d%.2f" % (d, r["pick"], r["near_end"]) if isinstance(r, dict)
                                            else "%s:%s" % (d, r) for d, r in sorted(rec.items()))), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
