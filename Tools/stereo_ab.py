# -*- coding: utf-8 -*-
r"""Half SBS/TB unchanged? Frozen frames of the same scenes in every old stereo mode, from two builds, compared.

    python Tools/stereo_ab.py <base tree> [--scenes ..\Engine\StereoProbe3D.frag:scene3d:quads,...] [--modes 0,1,2,3]

<base tree> is a checkout of the commit to compare with, built (its Release\Kaleidoscope.exe), with this tree's
Engine/StereoProbe* copied in.  Each frame is the program's own frozen shot (KALEIDO_FREEZE_TIME, KALEIDO_SEED,
KALEIDO_FREEZE_SHOT: the displayed picture, stereo packing included, 640x360), one scene alone in a scratch preset
(Presets/ZZab.xml, gitignored), the stereo mode from a private settings file.  Prints the mean and the largest
absolute difference per frame (0..255); identical code gives 0.
"""
import argparse
import io
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QT_BIN = r"C:\Qt\6.11.1\msvc2022_64\bin"
SCENES = ["..\\\\Engine\\\\StereoProbe3D.frag:scene3d:quads", "..\\\\Engine\\\\StereoProbe2D.frag:normal:",
          "..\\\\Scene3D\\\\PhotoCarousel.frag:scene3d:quads", "..\\\\Scene2D\\\\BreathingFractal.frag:normal:"]


def shoot(tree, scene, mode, out, work):
    path, kind, geom = scene.split(":")
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="ZZab" hidden="true">\n'
           '  <TextureShader file="%s" type="%s"%s probability="1.0" complexity="1" minTimeSolo="100" '
           'maxTimeSolo="120"></TextureShader>\n'
           '  <CombineShader file="..\\\\FX\\\\FxPlain.frag" type="normal" probability="1.0" complexity="1">'
           '</CombineShader>\n'
           '  <TransitionShader file="..\\Transitions\\Crossfade.frag" type="normal" probability="1" complexity="1">'
           '</TransitionShader>\n</configuration>\n') % (path, kind, (' geom="%s"' % geom) if geom else "")
    with io.open(os.path.join(tree, "Presets", "ZZab.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write(xml)
    ini = os.path.join(work, "ab.ini")
    with open(ini, "w") as f:
        f.write("[General]\nvideoEnabled=false\nartistImages=false\nlyricsMode=0\nnowPlaying=false\n"
                "stereoMode=%d\n" % mode)
    env = dict(os.environ, KALEIDO_SETTINGS=ini, KALEIDO_NO_ACTIVATE="1", KALEIDO_NO_MIDI="1",
               KALEIDO_MAX_RUNTIME_SECS="90", KALEIDO_FREEZE_TIME="20", KALEIDO_SEED="7", KALEIDO_NO_VSYNC="1",
               KALEIDO_FREEZE_SHOT=out)
    env["PATH"] = QT_BIN + os.pathsep + env.get("PATH", "")
    exe = os.path.join(tree, "Release", "Kaleidoscope.exe")
    with open(out + ".log", "w") as log:
        subprocess.run([exe, "-c", "ZZab", "-t", "0"], cwd=os.path.dirname(exe), env=env, stdout=log, stderr=log,
                       creationflags=0x00004000, timeout=120)
    return os.path.exists(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--modes", default="0,1,2,3")
    ap.add_argument("--scenes", default=",".join(SCENES))
    a = ap.parse_args()
    work = tempfile.mkdtemp(prefix="kaleido_stereo_ab_")
    worst = 0.0
    for scene in a.scenes.split(","):
        for mode in (int(m) for m in a.modes.split(",")):
            shots = []
            for label, tree in (("base", os.path.abspath(a.base)), ("new", ROOT)):
                out = os.path.join(work, "%s_%d_%s.jpg" % (os.path.basename(scene.split(":")[0]).replace(".frag", ""),
                                                          mode, label))
                shots.append(out if shoot(tree, scene, mode, out, work) else None)
            name = os.path.basename(scene.split(":")[0].replace("\\\\", "/"))
            if None in shots:
                print("%-24s mode %d: a frame is missing (%s)" % (name, mode, shots))
                worst = 999
                continue
            x, y = (np.asarray(Image.open(s).convert("RGB"), dtype=np.float32) for s in shots)
            d = np.abs(x - y)
            worst = max(worst, d.mean())
            print("%-24s mode %d: mean %.3f  max %.0f" % (name, mode, d.mean(), d.max()))
    for tree in (os.path.abspath(a.base), ROOT):
        p = os.path.join(tree, "Presets", "ZZab.xml")
        if os.path.exists(p):
            os.remove(p)
    print("frames in", work)
    return 0 if worst < 0.5 else 1


if __name__ == "__main__":
    sys.exit(main())
