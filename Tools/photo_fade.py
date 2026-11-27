# -*- coding: utf-8 -*-
r"""photo_fade.py -- a scene across photo changes: does its picture of the photo jump when the cross-fade ends?

The photo slots: tex0 is the current photo, tex1 the next; `interpolation` runs from 1 (tex0) to 0 (tex1) during a
photo cross-fade, then the slots swap and it is 1 again.  A scene that reads tex0 alone shows the old photo through
the whole fade and jumps to the new one at its end.  This tool renders one scene alone as a video export (60 fps,
960 x 540, the screening music, KALEIDO_SEED 7, the user's settings in a private copy) from a folder of a few photos
(-f) that change every few seconds (KALEIDO_PHOTO_SECS; the program's first photo stays 15 s and fades over 20 s
whatever the switch says, so the first swap comes at ~35 s, the next every ~6 s), and measures per frame the mean
absolute change from the frame before (sRGB 0..1, 160 x 90); a jump stands out as a spike far above the scene's own
motion.

    python Tools/photo_fade.py render Ocean before          # .screen/photofade/Ocean_before.mp4
    python Tools/photo_fade.py measure Ocean before after   # the largest spikes of each run
    python Tools/photo_fade.py sheet out.jpg Ocean:before,after:12.0,13.9,14.0 ...   # frames at those seconds

Run render through the machine's heavy-job lock.  The photo folder is .screen/photofade/photos (filled by hand with
copies of a few photos; never committed).
"""
import argparse
import io
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import screen  # noqa: E402

ROOT = screen.ROOT
WORK = os.path.join(ROOT, ".screen", "photofade")
PHOTOS = os.path.join(WORK, "photos")
W, H = 160, 90
FPS = 60


def render(scene, label, secs=50, photo_secs=3):
    os.makedirs(WORK, exist_ok=True)
    scenes, plain, cross = screen.read_master()
    blk = dict(scenes).get(scene)
    if blk is None:
        sys.exit("no TextureShader entry for %s in Komplett.xml" % scene)
    head, rest = blk.split(">", 1)
    head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo)="[^"]*"', "", head)
    blk = head + ' probability="1.0" minTimeSolo="1000" maxTimeSolo="1200">' + rest
    cfg = "ZZPhotoFade"
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="%s" hidden="true" >\n\n' % cfg + blk + "\n" + plain + cross + "</configuration>\n")
    preset = os.path.join(ROOT, "Presets", cfg + ".xml")
    io.open(preset, "w", encoding="utf-8").write(xml)
    wav = os.path.join(screen.WORK, "screen%d_%d.wav" % (screen.WAV_VERSION, int(secs)))
    if not os.path.exists(wav):
        screen.write_wav(wav, int(secs))
    vid = os.path.join(WORK, "%s_%s.mp4" % (scene, label))
    log = os.path.join(WORK, "%s_%s.log" % (scene, label))
    env = dict(os.environ, KALEIDO_SEED="7", KALEIDO_NO_ACTIVATE="1", KALEIDO_NP_FAKE=screen.NP_QUIET,
               KALEIDO_PHOTO_SECS=str(photo_secs), KALEIDO_MAX_RUNTIME_SECS=str(int(secs) + 120))
    env.pop("KALEIDO_FIXED_PHOTO", None)
    screen.settings_env(env)
    try:
        if os.path.exists(vid):
            os.remove(vid)
        with io.open(log, "w", encoding="utf-8", errors="replace") as fh:
            subprocess.run([os.path.join(screen.APP_DIR, "Kaleidoscope.exe"), "-c", cfg, "-e", wav, "-g", "960x540",
                            "-p", str(FPS), "-d", vid, "-j", "nofade", "-t", "0", "-f", PHOTOS], cwd=screen.APP_DIR,
                           env=env, stdout=fh, stderr=subprocess.STDOUT,
                           creationflags=0x00004000 if os.name == "nt" else 0)
    finally:
        os.remove(preset)
    if not os.path.exists(vid):
        sys.exit("no video; see " + log)
    return vid


def decode(vid, w=W, h=H):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vf", "scale=%d:%d" % (w, h), "-pix_fmt", "rgb24",
                        "-f", "rawvideo", "-"], capture_output=True)
    b = np.frombuffer(p.stdout, np.uint8)
    n = b.size // (w * h * 3)
    return b[:n * w * h * 3].reshape(n, h, w, 3).astype(np.float32) / 255.0


def jumps(x):
    """Per frame the mean absolute change from the frame before (frame 0: 0)."""
    d = np.zeros(len(x), np.float32)
    d[1:] = np.abs(x[1:] - x[:-1]).mean(axis=(1, 2, 3))
    return d


def measure(scene, labels, top=6):
    res = {}
    for lab in labels:
        d = jumps(decode(os.path.join(WORK, "%s_%s.mp4" % (scene, lab))))
        med = float(np.median(d[1:]))
        order = np.argsort(-d)[:top]
        res[lab] = d
        print("%s %s: %d frames, median change %.4f, p99 %.4f; largest: %s" % (
            scene, lab, len(d), med, float(np.percentile(d[1:], 99)),
            ", ".join("%.2f s %.4f (%.0fx)" % (i / float(FPS), d[i], d[i] / max(med, 1e-6)) for i in sorted(order))))
    return res


def sheet(out, specs):
    """specs: scene:label1,label2:t1,t2,...  -- one row per (scene, label), the frames at those seconds."""
    from PIL import Image, ImageDraw
    rows = []
    for spec in specs:
        scene, labs, ts = spec.split(":")
        for lab in labs.split(","):
            rows.append((scene, lab, [float(t) for t in ts.split(",")]))
    cw, ch = 320, 180
    ncol = max(len(r[2]) for r in rows)
    img = Image.new("RGB", (120 + ncol * (cw + 4), len(rows) * (ch + 22) + 10), (24, 24, 24))
    dr = ImageDraw.Draw(img)
    for k, (scene, lab, ts) in enumerate(rows):
        vid = os.path.join(WORK, "%s_%s.mp4" % (scene, lab))
        y0 = 5 + k * (ch + 22)
        dr.text((4, y0 + ch // 2 - 8), "%s\n%s" % (scene, lab), fill=(230, 230, 230))
        for j, t in enumerate(ts):
            # Only the frame needed: the frame at t (frame number round( t x 60 ), selected exactly).
            p = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vf",
                                "select=eq(n\\,%d),scale=%d:%d" % (int(round(t * FPS)), cw, ch), "-frames:v", "1",
                                "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True)
            fr = np.frombuffer(p.stdout, np.uint8)[:cw * ch * 3].reshape(ch, cw, 3)
            img.paste(Image.fromarray(fr), (120 + j * (cw + 4), y0 + 18))
            dr.text((120 + j * (cw + 4), y0 + 2), "%.2f s" % t, fill=(200, 200, 200))
    img.save(out, quality=90)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render")
    r.add_argument("scene")
    r.add_argument("label")
    r.add_argument("--secs", type=int, default=50)
    r.add_argument("--photo-secs", type=int, default=3)
    m = sub.add_parser("measure")
    m.add_argument("scene")
    m.add_argument("labels", nargs="+")
    s = sub.add_parser("sheet")
    s.add_argument("out")
    s.add_argument("specs", nargs="+")
    a = ap.parse_args()
    if a.cmd == "render":
        print(render(a.scene, a.label, a.secs, a.photo_secs))
    elif a.cmd == "measure":
        measure(a.scene, a.labels)
    else:
        print(sheet(a.out, a.specs))


if __name__ == "__main__":
    main()
