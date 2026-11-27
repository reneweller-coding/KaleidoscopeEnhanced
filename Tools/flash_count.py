# -*- coding: utf-8 -*-
r"""flash_count.py -- how often a scene flashes on screen, counted the way the photosensitivity guidelines count.

A flash is a pair of opposing changes in relative (linear) luminance of at least 0.1 where the darker state lies
below 0.8 (WCAG 2.3.1, ITU-R BT.1702), counted in any one second, over an area: here the frame's nine quarter windows
(half its width and height, at 0, 1/4 and 1/2 of each) -- the way Engine/SafetyLimit.comp and the screening of
17.10.2026 measure.  Three flashes a second is the limit.

The scene is rendered alone by the video export on the frame clock (60 fps by default) over the screening music
(Tools/screen.py), with fixed rolls and one photo, and the video is counted.  Extra environment for the app goes on
the command line (NAME=VALUE), so the same scene can be counted with and without a switch:

    python Tools/flash_count.py VolumetricFire                          # 20 s at 60 fps, 960 x 540
    python Tools/flash_count.py VolumetricFire KALEIDO_HDR_BUFFERS=1    # the same with 16-bit intermediates
    python Tools/flash_count.py --video some.mp4                         # count a video that exists

Prints the flashes per second (the worst second of the worst window), the share of seconds above 3, and the mean
luminance.  Work files in .screen/flash.  Run it through the machine's heavy-job lock.
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
WORK = os.path.join(ROOT, ".screen", "flash")
W, H = 160, 90
PHOTO = "kristallhoehle-indigo-fuchsia-2.jpg"   # the snapshot baseline's photo


def frames(vid):
    """The video as linear relative luminance frames at W x H, and its frame rate."""
    pr = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                         "-of", "csv=p=0", vid], capture_output=True, text=True).stdout.strip()
    num, _, den = pr.partition("/")
    fps = float(num) / float(den or 1)
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vf", "scale=%d:%d" % (W, H), "-pix_fmt", "rgb24",
                        "-f", "rawvideo", "-"], capture_output=True)
    b = np.frombuffer(p.stdout, np.uint8)
    n = b.size // (W * H * 3)
    x = b[:n * W * H * 3].reshape(n, H, W, 3).astype(np.float32) / 255.0
    lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    return lin @ np.array([0.2126, 0.7152, 0.0722], np.float32), fps


def reversals(series):
    """Frame indices of the reversals of one area's luminance (turns of >= 0.1, the darker state under 0.8)."""
    # The same state machine as Engine/SafetyLimit.comp's reversals(): follow the extreme, turn at 0.1.
    out, ref, direction = [], float(series[0]), 1
    for i, v in enumerate(series[1:], 1):
        if direction > 0:
            if v > ref:
                ref = v
            elif ref - v >= 0.1 and v < 0.8:
                out.append(i)
                direction, ref = -1, v
        else:
            if v < ref:
                ref = v
            elif v - ref >= 0.1 and ref < 0.8:
                out.append(i)
                direction, ref = 1, v
    return out


def count(L, fps, skip=2.0):
    """(worst flashes per second, share of seconds above 3, mean luminance) over the nine quarter windows."""
    a = int(skip * fps)
    L = L[a:]
    if len(L) < fps:
        return 0.0, 0.0, 0.0
    worst, over = 0.0, []
    for wy in range(3):
        for wx in range(3):
            y0, x0 = wy * H // 4, wx * W // 4
            s = L[:, y0:y0 + H // 2, x0:x0 + W // 2].mean(axis=(1, 2))
            rv = np.array(reversals(s))
            per = []
            for t0 in range(0, len(s) - int(fps) + 1, max(1, int(fps) // 4)):
                k = np.count_nonzero((rv >= t0) & (rv < t0 + fps)) if len(rv) else 0
                per.append(k / 2.0)
            if per:
                worst = max(worst, max(per))
                over.append(np.mean(np.array(per) > 3.0))
    return worst, float(max(over) if over else 0.0), float(L.mean())


def render(scene, secs, fps, size, extra):
    """The scene alone as an export over the screening music; returns the video's path."""
    os.makedirs(WORK, exist_ok=True)
    scenes, plain, cross = screen.read_master()
    blk = dict(scenes).get(scene)
    if blk is None:
        sys.exit("no TextureShader entry for %s in Komplett.xml" % scene)
    head, rest = blk.split(">", 1)
    head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo)="[^"]*"', "", head)
    blk = head + ' probability="1.0" minTimeSolo="1000" maxTimeSolo="1200">' + rest
    cfg = "ZZFlash"
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="%s" hidden="true" >\n\n' % cfg + blk + "\n" + plain + cross + "</configuration>\n")
    preset = os.path.join(ROOT, "Presets", cfg + ".xml")
    io.open(preset, "w", encoding="utf-8").write(xml)
    wav = os.path.join(screen.WORK, "screen%d_%d.wav" % (screen.WAV_VERSION, int(secs)))
    if not os.path.exists(wav):
        screen.write_wav(wav, int(secs))
    tag = "_".join([scene] + [re.sub(r"\W+", "", e) for e in extra])
    vid = os.path.join(WORK, tag + ".mp4")
    log = os.path.join(WORK, tag + ".log")
    env = dict(os.environ, KALEIDO_SEED="7", KALEIDO_FIXED_PHOTO=PHOTO, KALEIDO_NO_ACTIVATE="1",
               KALEIDO_NP_FAKE=screen.NP_QUIET, KALEIDO_MAX_RUNTIME_SECS=str(int(secs) + 120))
    for e in extra:
        k, _, v = e.partition("=")
        env[k] = v
    screen.settings_env(env)
    try:
        if os.path.exists(vid):
            os.remove(vid)
        with io.open(log, "w", encoding="utf-8", errors="replace") as fh:
            subprocess.run([os.path.join(screen.APP_DIR, "Kaleidoscope.exe"), "-c", cfg, "-e", wav, "-g", size,
                            "-p", str(fps), "-d", vid, "-j", "nofade", "-t", "0"], cwd=screen.APP_DIR, env=env,
                           stdout=fh, stderr=subprocess.STDOUT, creationflags=0x00004000 if os.name == "nt" else 0)
    finally:
        os.remove(preset)
    if not os.path.exists(vid):
        sys.exit("no video; see " + log)
    return vid


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("scene", nargs="?")
    ap.add_argument("env", nargs="*", help="NAME=VALUE for the app")
    ap.add_argument("--video", help="count this video instead of rendering")
    ap.add_argument("--secs", type=float, default=20.0)
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--size", default="960x540")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    vid = a.video or render(a.scene, a.secs, a.fps, a.size, a.env)
    L, fps = frames(vid)
    worst, share, mean = count(L, fps)
    print("%s: %d frames at %.0f fps -- worst %.1f flashes/s, %.0f %% of the seconds above 3, mean luminance %.3f"
          % (os.path.basename(vid), len(L), fps, worst, 100 * share, mean))
    return 0


if __name__ == "__main__":
    sys.exit(main())
