# -*- coding: utf-8 -*-
r"""Measures the stereo disparity of the program's output: sign and size per eye, in every stereo format, in the video
export and in the live window.

    python Tools/stereo_disparity.py                         # export: mono, sbs, tb, fsbs, ftb at 960x540 per eye
    python Tools/stereo_disparity.py --modes sbs,fsbs --size 1280x720
    python Tools/stereo_disparity.py --live --modes sbs,fsbs # the live window, through the remote's screenshot

The measuring scenes (Engine/StereoProbe3D.*, Engine/StereoProbe2D.frag) go into a scratch preset
(Presets/ZZStereoProbe.xml, gitignored).  KALEIDO_SCENE_SWEEP holds the 3D scene for the first 4 s and then fades to
the 2D one, so one 10-s export gives a 3D frame, the fade and a 2D frame.

3D: three cards at 8, 24 and 60 units.  Every 3D scene moves the camera by eyeOff = -+0.5 * stereoDepth and pulls the
picture back by eyeOff * 0.045 in clip space, so the disparity right minus left, in NDC, is
    stereoDepth * (0.045 - P00 / z),   P00 = (1 / tan 27.5 deg) / (eye aspect)
and half of that as a fraction of the eye's width.  Negative = crossed = in front of the screen.
2D: the white and the grey disc of StereoProbe2D; their depth comes from the picture (Present.frag: per eye a shift of
stereoDepth * 0.007 * (depth - 0.45) of the eye's width).  The grey disc is too dark for the bloom, so its depth is
the radial term alone and its disparity is predicted exactly; the white one must lie in front of it.

The numbers are fractions of the eye's width (x 1000 = per mille), so half and full formats compare directly; the
pixel columns are in the eye's own pixels.  Exit code 0 = every 3D card within 0.002 and the grey disc within 0.001
of the prediction in every stereo format, the white disc in front of the grey one, the mono picture without
disparity.  --fade prints both through the 3D -> 2D fade (neither may jump).
"""
import argparse
import io
import json
import math
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE = os.path.join(ROOT, "Release", "Kaleidoscope.exe")
QT_BIN = r"C:\Qt\6.11.1\msvc2022_64\bin"
PRESET = os.path.join(ROOT, "Presets", "ZZStereoProbe.xml")
PRESET_XML = r"""<?xml version="1.0" encoding="utf-8" ?>
<configuration ImageDirectory="..\\Images" ConfigurationName="ZZStereoProbe" hidden="true" >
  <!-- Scratch preset of Tools/stereo_disparity.py (gitignored: Presets/ZZ*.xml). -->
  <TextureShader file="..\\Engine\\StereoProbe3D.frag" type="scene3d" geom="quads" probability="1" complexity="1" minTimeSolo="30" maxTimeSolo="30" minTimeInterpolation="2" maxTimeInterpolation="2">
  </TextureShader>
  <TextureShader file="..\\Engine\\StereoProbe2D.frag" type="normal" probability="1" complexity="1" minTimeSolo="30" maxTimeSolo="30" minTimeInterpolation="2" maxTimeInterpolation="2">
  </TextureShader>
  <CombineShader file="..\\FX\\FxPlain.frag" type="normal" probability="1.0" complexity="1">
  </CombineShader>
  <TransitionShader file="..\Transitions\Crossfade.frag" type="normal" probability="1" complexity="1"></TransitionShader>
</configuration>
"""
BELOW_NORMAL = 0x00004000
K_CONV = 0.045                       # the clip-space pull-back of StereoProbe3D.vert
F = 1.0 / math.tan(math.radians(27.5))  # EffectShader::SceneTanHalfFovY: 55 degrees vertical
CARDS = [("red", 8.0), ("green", 24.0), ("blue", 60.0)]
PACK = {"mono": None, "sbs": "h", "tb": "v", "fsbs": "h", "ftb": "v", "ana": None}


def env_for(ini, extra=None):
    e = dict(os.environ)
    e.update({"KALEIDO_SETTINGS": ini, "KALEIDO_NO_ACTIVATE": "1", "KALEIDO_NO_MIDI": "1",
              "KALEIDO_SCENE_SWEEP": "4", "KALEIDO_MAX_RUNTIME_SECS": "180", "KALEIDO_CALM": "1"})
    e.update(extra or {})
    if os.path.isdir(QT_BIN):
        e["PATH"] = QT_BIN + os.pathsep + e.get("PATH", "")
    return e


def eyes(img, mode):
    """The picture of each eye (left, right) as float arrays; for mono the picture twice."""
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    h, w = a.shape[:2]
    if PACK[mode] == "h":
        return a[:, : w // 2], a[:, w // 2:]
    if PACK[mode] == "v":
        return a[: h // 2], a[h // 2:]  # top = left eye
    return a, a


def centroid_x(mask):
    """Mean column of a mask, as a fraction of its width; None when (nearly) empty."""
    if mask.sum() < 20:
        return None
    cols = np.nonzero(mask)[1]
    return (cols.mean() + 0.5) / mask.shape[1]


def cards(eye):
    """Each card's centre (fraction of the eye's width)."""
    # By the dominance of the card's channel, so a card is still found while it fades out over the grey ground.
    r, g, b = eye[..., 0], eye[..., 1], eye[..., 2]
    return {"red": centroid_x(r - np.maximum(g, b) > 0.12),
            "green": centroid_x(g - np.maximum(r, b) > 0.12),
            "blue": centroid_x(b - np.maximum(r, g) > 0.12)}


def discs(eye):
    """The white and the grey disc of StereoProbe2D (fraction of the eye's width)."""
    lum = eye @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    h, w = lum.shape
    left = np.zeros_like(lum, dtype=bool)
    left[:, : w // 2] = True
    return {"white": centroid_x((lum > 0.7) & left), "grey": centroid_x((lum > 0.25) & (lum < 0.62) & ~left)}


def expected(z, aspect, depth):
    """Disparity right minus left of a card at z, as a fraction of the eye's width."""
    return depth * (K_CONV - (F / aspect) / z) / 2.0


def expected_grey(depth):
    """Disparity right minus left of StereoProbe2D's grey disc (fraction of the eye's width): too dark for the
    bloom, so its depth is the radial term alone, 0.3 * min(1, 1.5 * |centre offset|), offset (0.2, 0.3)."""
    d = 0.3 * min(1.0, 1.5 * math.hypot(0.2, 0.3))
    return -2.0 * 0.007 * depth * (d - 0.45)


def measure(img, mode, aspect, depth, kind):
    le, re_ = eyes(img, mode)
    ew = le.shape[1]
    rows = []
    found = cards if kind == "3d" else discs
    fl, fr = found(le), found(re_)
    for name in fl:
        xl, xr = fl[name], fr[name]
        if xl is None or xr is None:
            rows.append((name, None, None, None, None, ew))
            continue
        d = xr - xl
        if kind == "3d":
            exp = expected(dict(CARDS)[name], aspect, depth)
        else:
            exp = expected_grey(depth) if name == "grey" else None
        rows.append((name, xl, xr, d, exp, ew))
    return rows


def frame_at(mp4, t, out):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "%.3f" % t, "-i", mp4,
                    "-frames:v", "1", out], check=True)
    return Image.open(out)


def run_export(mode, size, audio, work):
    ini = os.path.join(work, "settings_%s.ini" % mode)
    open(ini, "w").close()
    out = os.path.join(work, "probe_%s.mp4" % mode)
    args = [EXE, "-c", "ZZStereoProbe", "-e", audio, "-g", size, "-p", "30", "-d", out, "-j", "nofade"]
    if mode != "mono":
        args += ["-3", mode]
    log = open(os.path.join(work, "export_%s.log" % mode), "w")
    t0 = time.time()
    r = subprocess.run(args, cwd=os.path.dirname(EXE), env=env_for(ini), stdout=log, stderr=log,
                       creationflags=BELOW_NORMAL)
    log.close()
    tags = [os.path.basename(p) for p in os.listdir(work) if p.startswith("probe_%s" % mode) and p.endswith(".mp4")]
    path = os.path.join(work, tags[0]) if tags else out
    return r.returncode, path, time.time() - t0, open(ini).read()


def probe_size(mp4):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,codec_name,profile,level", "-of", "json", mp4],
                       capture_output=True, text=True).stdout
    s = json.loads(o)["streams"][0]
    return s


def report(rows, unit_w, kind, tol, failures, label):
    for name, xl, xr, d, exp, ew in rows:
        if d is None:
            print("    %-6s not found in both eyes" % name)
            if kind == "3d":
                failures.append("%s %s missing" % (label, name))
            continue
        mid = (xl + xr) / 2
        line = "    %-6s L %+7.2f  R %+7.2f  (per eye, %% of width from the middle)  disparity R-L %+7.2f %%  = %+6.1f px" % (
            name, (xl - mid) * 100, (xr - mid) * 100, d * 100, d * ew)
        if exp is not None:
            ok = abs(d - exp) <= tol
            line += "  expected %+7.2f %%  %s" % (exp * 100, "ok" if ok else "OFF")
            if not ok:
                failures.append("%s %s" % (label, name))
        print(line)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modes", default="mono,sbs,tb,fsbs,ftb")
    ap.add_argument("--size", default="960x540", help="-g: the size of the frame (per eye in the full formats)")
    ap.add_argument("--depth", type=float, default=1.0, help="stereoDepth of the settings (1.0 = default)")
    ap.add_argument("--fade", action="store_true", help="also measure the 3D cards through the 3D -> 2D fade")
    ap.add_argument("--keep", default="", help="folder to keep the videos and frames in")
    ap.add_argument("--live", action="store_true", help="the live window through the remote's screenshot instead")
    ap.add_argument("--port", type=int, default=18392)
    a = ap.parse_args()
    with io.open(PRESET, "w", encoding="utf-8", newline="\n") as f:
        f.write(PRESET_XML)
    work = a.keep or tempfile.mkdtemp(prefix="kaleido_stereo_")
    os.makedirs(work, exist_ok=True)
    w, h = (int(v) for v in a.size.lower().split("x"))
    failures = []
    if a.live:
        return live(a, work, failures)
    audio = os.path.join(work, "silence10.wav")
    if not os.path.exists(audio):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        "anullsrc=r=48000:cl=stereo", "-t", "10", audio], check=True)
    for mode in a.modes.split(","):
        code, mp4, secs, ini_after = run_export(mode, a.size, audio, work)
        if code != 0 or not os.path.exists(mp4):
            print("%s: export failed (exit %d), see %s" % (mode, code, work))
            failures.append(mode + " export")
            continue
        s = probe_size(mp4)
        print("%s: %s  %dx%d %s %s level %s  (%.0f s)" % (mode, os.path.basename(mp4), s["width"], s["height"],
                                                          s["codec_name"], s.get("profile", ""), s.get("level", ""),
                                                          secs))
        aspect = w / h
        img3 = frame_at(mp4, 2.0, os.path.join(work, "f3d_%s.png" % mode))
        print("  3D cards at 2.0 s (solo):")
        report(measure(img3, mode, aspect, a.depth if mode != "mono" else 0.0, "3d"), w, "3d", 0.002, failures,
               mode + " 3D")
        img2 = frame_at(mp4, 7.0, os.path.join(work, "f2d_%s.png" % mode))
        print("  2D discs at 7.0 s (solo):")
        rows2 = measure(img2, mode, aspect, a.depth if mode != "mono" else 0.0, "2d")
        report(rows2, w, "2d", 0.001, failures, mode + " 2D")
        dd = dict((r[0], r[3]) for r in rows2)
        if mode != "mono" and None not in dd.values() and not dd["white"] < dd["grey"]:
            print("    the white disc does not lie in front of the grey one")
            failures.append(mode + " 2D order")
        if a.fade and mode != "mono":
            # Every frame from 3.8 to 5.4 s: the red card (3D, 8 units) while it fades out, the white disc (2D) while
            # it fades in.  Neither may jump: the card keeps its real depth, the disc arrives with the depth it then
            # keeps when the 2D scene stands alone.
            fdir = os.path.join(work, "fade_%s" % mode)
            os.makedirs(fdir, exist_ok=True)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "3.8", "-i", mp4, "-t", "1.6",
                            os.path.join(fdir, "f%03d.png")], check=True)
            print("  through the fade (3D -> 2D from 4 s), disparity R-L in %% of the eye's width:")
            for k, name in enumerate(sorted(os.listdir(fdir))):
                img = Image.open(os.path.join(fdir, name))
                red = [r for r in measure(img, mode, aspect, a.depth, "3d") if r[0] == "red"][0]
                white = [r for r in measure(img, mode, aspect, a.depth, "2d") if r[0] == "white"][0]
                print("    t %.3f s: red card %s   white disc %s" % (
                    3.8 + k / 30.0, "  --  " if red[3] is None else "%+6.2f" % (red[3] * 100),
                    "  --  " if white[3] is None else "%+6.2f" % (white[3] * 100)))
    print("\n%d deviation(s)%s" % (len(failures), (": " + ", ".join(failures)) if failures else ""))
    print("frames and videos in", work)
    return 1 if failures else 0


def api(port, path, action=False):
    req = urllib.request.Request("http://127.0.0.1:%d%s" % (port, path))
    if action:
        req.add_header("X-Kaleido", "1")
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.read()


def live(a, work, failures):
    """The live window: start the program windowed in each format, take the remote's screenshot of the 3D card frame
    (KALEIDO_SHOT_DIR keeps it out of the user's pictures), measure, end the program (ours, by its PID)."""
    w, h = (int(v) for v in a.size.lower().split("x"))
    for mode in a.modes.split(","):
        ini = os.path.join(work, "live_%s.ini" % mode)
        with open(ini, "w") as f:
            f.write("[General]\nvideoEnabled=false\nartistImages=false\nlyricsMode=0\nnowPlaying=false\n")
        shots = os.path.join(work, "shots_%s" % mode)
        os.makedirs(shots, exist_ok=True)
        args = [EXE, "-c", "ZZStereoProbe", "-t", str(a.port)]
        if mode != "mono":
            args += ["-3", mode]
        log = open(os.path.join(work, "live_%s.log" % mode), "w")
        p = subprocess.Popen(args, cwd=os.path.dirname(EXE), env=env_for(ini, {"KALEIDO_SHOT_DIR": shots,
                                                                                 "KALEIDO_SCENE_SWEEP": "60"}),
                             stdout=log, stderr=log, creationflags=BELOW_NORMAL)
        try:
            t0 = time.time()
            while time.time() - t0 < 90:
                try:
                    json.loads(api(a.port, "/api/state"))
                    break
                except Exception:
                    time.sleep(1)
            time.sleep(6)  # the scene in, the start card gone
            name = json.loads(api(a.port, "/api/screenshot", action=True))["file"]
            t0 = time.time()
            while not os.path.exists(name) and time.time() - t0 < 15:
                time.sleep(0.5)
            time.sleep(1.0)
            img = Image.open(name)
            ew = img.size[0] // 2 if PACK[mode] == "h" else img.size[0]
            eh = img.size[1] // 2 if PACK[mode] == "v" else img.size[1]
            # The logical frame of the half formats is the whole window; of the full ones, one eye.
            aspect = (img.size[0] / img.size[1]) if mode in ("mono", "sbs", "tb") else ew / eh
            print("%s (live): screenshot %dx%d, eye %dx%d, frame aspect %.3f" % (mode, img.size[0], img.size[1], ew, eh,
                                                                                aspect))
            report(measure(img, mode, aspect, a.depth if mode != "mono" else 0.0, "3d"), ew, "3d", 0.002, failures,
                   mode + " live")
        finally:
            if p.poll() is None:
                p.terminate()
                p.wait(30)
    print("\n%d deviation(s)%s" % (len(failures), (": " + ", ".join(failures)) if failures else ""))
    print("screenshots in", work)
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        code = main()
    finally:
        # The scratch preset goes again: the preset checks (mood tags, ...) read every file in Presets/.
        if os.path.exists(PRESET):
            os.remove(PRESET)
    sys.exit(code)
