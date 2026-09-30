# -*- coding: utf-8 -*-
"""Frame rate of single scenes in the real app: each scene alone in a hidden
probe preset for 16 s, KALEIDO_FPS_LOG on, the app ends by itself.

Silent by default (no music is played; the audio analysis hears silence, the
GPU load is the same).  --music FILE plays that file as the test track -- only
when someone is awake, and never a file that must not leave this machine.
The adaptive scaler writes its result into the settings ini, so the ini is
backed up first and restored afterwards (the user's file stays as it was).
A lab scene rolls anew on every start: list it several times to sample rolls.

Usage: fps_probe.py [--music FILE] Name1 Name2 ...
"""
import argparse, io, os, re, shutil, subprocess, statistics

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SP, "..", ".."))
INI = os.path.join(ROOT, "kaleidoscope_settings.ini")
BACKUP = os.path.join(SP, "quick", "ini_backup_fps.ini")

ap = argparse.ArgumentParser()
ap.add_argument("--music")
ap.add_argument("names", nargs="+")
a = ap.parse_args()

src = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
fx = re.search(r"[ \t]*<CombineShader\b[^>]*FxPlain\.frag[^>]*>.*?</CombineShader>", src, re.S).group(0)
os.makedirs(os.path.dirname(BACKUP), exist_ok=True)
shutil.copy(INI, BACKUP)
try:
    for name in a.names:
        m = re.search(r"[ \t]*<TextureShader\b[^>]*[\\/]" + name + r"\.frag\"[^>]*>.*?</TextureShader>", src, re.S)
        if not m:
            print(name, "not in Komplett.xml")
            continue
        head, rest = m.group(0).split(">", 1)
        head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo)="[^"]*"', "", head)
        blk = head + ' probability="1.0" minTimeSolo="100" maxTimeSolo="120">' + rest
        xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..' + chr(92) * 2 + 'Images" '
               'ConfigurationName="_fps" hidden="true">\n' + blk + "\n" + fx + "\n</configuration>\n")
        io.open(os.path.join(ROOT, "Presets", "_fps.xml"), "w", encoding="utf-8").write(xml)
        env = dict(os.environ, KALEIDO_FPS_LOG="1", KALEIDO_MAX_RUNTIME_SECS="16", KALEIDO_NO_ACTIVATE="1")
        rel = os.path.join(ROOT, "Release")
        cmd = [os.path.join(rel, "Kaleidoscope.exe"), "-c", "_fps", "-l"]
        if a.music:
            cmd[3:3] = ["-w", os.path.abspath(a.music)]
        subprocess.run(cmd, cwd=rel, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        log = io.open(os.path.join(rel, "kaleidoscope.log"), encoding="utf-8", errors="replace").read()
        vals = [(int(x), float(y)) for x, y in re.findall(r"\[fps\] (\d+) fps  renderScale ([\d.]+)", log)][4:]
        bad = "not found - using default" in log
        if vals:
            print("%-26s fps median %3d  min %3d  renderScale end %.2f%s" % (
                name, statistics.median(v[0] for v in vals), min(v[0] for v in vals), vals[-1][1],
                "  (WRONG PRESET)" if bad else ""))
        else:
            print(name, "no fps lines")
finally:
    shutil.copy(BACKUP, INI)
    try:
        os.remove(os.path.join(ROOT, "Presets", "_fps.xml"))
    except OSError:
        pass
