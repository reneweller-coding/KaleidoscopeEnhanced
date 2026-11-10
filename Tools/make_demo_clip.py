# -*- coding: utf-8 -*-
r"""The moving picture at the top of the README: a few scenes in a row, rendered by the video export.

    python Tools/make_demo_clip.py                    # docs/screenshots/demo.webp (and demo.mp4 beside the work files)
    python Tools/make_demo_clip.py --seconds 3.5      # how long each scene stands (default 3)
    python Tools/make_demo_clip.py --scenes A,B,C     # other scenes, in this order
    python Tools/make_demo_clip.py --keep             # keep the work folder (the full-size mp4 is in it)

A visualiser shown by four stills is a slide show.  This renders the scenes below, one after the other, in ONE video
export on the frame clock (Kaleidoscope.exe -e, as fast as the GPU allows, no window in front): a hidden preset holds
them, the scene sweep (KALEIDO_SCENE_SWEEP) walks them, the music is Tools/review128.wav repeated.  ffmpeg cuts off
the first window (the app coming up), scales to 480 x 270 and writes an animated WebP, which GitHub shows in a README
like a picture.  Needs ffmpeg on the PATH and a built Release\Kaleidoscope.exe; runs at below normal priority.
"""
import argparse
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave

from private_settings import PrivateSettings

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QT_BIN = r"C:\Qt\6.11.1\msvc2022_64\bin"
TRACK = os.path.join(ROOT, "Tools", "review128.wav")
SCENES = ["ChromeDreams", "DiscoGodrays", "NeonTubes", "TheCore", "Vortex", "BismuthLabyrinth", "AlcoholInkBlooms", "ChromaAcidTrip"]
FADE = 1.2


def blocks_of(names):
    """The first Komplett.xml entry of each scene.

    @param names  The scene names. (in)

    @return
      The entries' XML blocks, in the order of the names.
    """
    src = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
    out = []
    for n in names:
        m = re.search(r"[ \t]*<TextureShader\b[^>]*[\\/]%s\.frag\"[^>]*>.*?</TextureShader>" % re.escape(n), src, re.S)
        if not m:
            raise SystemExit("not in Komplett.xml: " + n)
        out.append(m.group(0))
    return out


def write_preset(name, blocks):
    """A hidden preset: the scenes in order, each certain and with a short fade, the plain overlay on top.

    @param name    The preset's name. (in)
    @param blocks  The scenes' XML blocks. (in)

    @return
      The preset file's path.
    """
    body = []
    for b in blocks:
        head, rest = b.split(">", 1)
        head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo|minTimeInterpolation|maxTimeInterpolation)="[^"]*"', "", head)
        body.append(head + ' probability="1.0" minTimeSolo="100" maxTimeSolo="120" minTimeInterpolation="%.1f" maxTimeInterpolation="%.1f">' % (FADE, FADE) + rest)
    fx = ('  <CombineShader file="..\\\\FX\\\\FxPlain.frag" type="normal" probability="1.0" complexity="1" '
          'minTimeSolo="100" maxTimeSolo="120" minTimeInterpolation="20" maxTimeInterpolation="30">\n  </CombineShader>\n')
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" ConfigurationName="%s" hidden="true">\n' % name
           + "\n".join(body) + "\n" + fx + "</configuration>\n")
    path = os.path.join(ROOT, "Presets", name + ".xml")
    io.open(path, "w", encoding="utf-8").write(xml)
    return path


def write_track(path, seconds):
    """The review track, repeated until it is long enough.

    @param path     The WAV file to write. (in)
    @param seconds  The length needed. (in)
    """
    src = wave.open(TRACK)
    params, frames = src.getparams(), src.readframes(src.getnframes())
    src.close()
    need = int(seconds * params.framerate) * params.sampwidth * params.nchannels
    data = frames * (need // len(frames) + 1)
    out = wave.open(path, "wb")
    out.setparams(params)
    out.writeframes(data[:need])
    out.close()


def main():
    """Renders the clip and writes the WebP.

    @return
      The process exit code.
    """
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=3.0)
    ap.add_argument("--scenes", default=",".join(SCENES))
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "screenshots", "demo.webp"))
    ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--quality", type=int, default=48)
    ap.add_argument("--keep", action="store_true")
    a = ap.parse_args()
    names = [n for n in a.scenes.split(",") if n]
    window = max(2, int(round(a.seconds)))
    work = tempfile.mkdtemp(prefix="kaleido-demo-")
    preset = "_democlip"
    blocks = blocks_of(names)
    ppath = write_preset(preset, [blocks[0]] + blocks)              # window 0: the app coming up
    wav = os.path.join(work, "track.wav")
    total = (len(names) + 1) * window + 2
    write_track(wav, total)
    mp4 = os.path.join(work, "demo_full.mp4")
    ps = PrivateSettings("demo")
    env = ps.env(os.environ, 0)
    env.update(PATH=QT_BIN + os.pathsep + env.get("PATH", ""), KALEIDO_SCENE_SWEEP=str(window), KALEIDO_SEED="3",
               KALEIDO_NO_ACTIVATE="1", KALEIDO_NO_MIDI="1", KALEIDO_MAX_RUNTIME_SECS=str(total + 600))
    exe = os.path.join(ROOT, "Release", "Kaleidoscope.exe")
    try:
        p = subprocess.run([exe, "-c", preset, "-e", wav, "-g", "1280x720", "-p", "30", "-d", mp4, "-j", "nofade", "-t", "0"],
                           cwd=os.path.dirname(exe), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           creationflags=0x00004000 if os.name == "nt" else 0)
    finally:
        os.remove(ppath)
    if p.returncode != 0 or not os.path.exists(mp4):
        print("export failed:", ((p.stdout or "") + (p.stderr or ""))[-500:])
        return 1
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    cut = ["-ss", str(window), "-t", str(len(names) * window)]
    r = subprocess.run(["ffmpeg", "-v", "error", "-y"] + cut + ["-i", mp4, "-vf", "fps=%d,scale=480:270:flags=lanczos" % a.fps, "-an",
                        "-c:v", "libwebp", "-loop", "0", "-q:v", str(a.quality), "-compression_level", "6", a.out], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(a.out):
        print("ffmpeg failed:", (r.stderr or "")[-400:])
        return 1
    print("%s: %d scenes x %d s, %.1f MB" % (a.out, len(names), window, os.path.getsize(a.out) / 1048576.0))
    if a.keep:
        print("work folder:", work)
    else:
        shutil.rmtree(work, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
