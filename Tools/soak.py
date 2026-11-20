# -*- coding: utf-8 -*-
r"""soak.py -- does the app grow over hours?  A real window, in real time, walking the scenes of a preset.

The genre presets run for days; nobody had measured whether the process grows.  This starts Release\Kaleidoscope.exe
live (not an export): the music is a WAV played in real time (-w; Tools/review128.wav looped), the scene sweep
(KALEIDO_SCENE_SWEEP) forces a new scene every HOLD seconds, and KALEIDO_GL_DEBUG makes every GL error visible.
Every ten seconds it writes the process's private memory, its working set, its dedicated GPU memory (the Windows
counter "GPU Process Memory(pid_*)\Dedicated Usage"), the scene changes and the GL errors so far.

    python Tools/soak.py                              # Allround, a scene every 6 s, 62 minutes
    python Tools/soak.py --preset Club --hold 4 --minutes 90

At the end: the growth per hour after the warm-up (a straight-line fit from minute 10 on), the GPU memory's range,
the scene changes and the GL errors -- against the acceptance of docs/PLAN_2026-11-20.md F1 (under 20 MB an hour,
GPU memory bounded, no GL error).  Below normal priority, a private settings copy, KALEIDO_NO_ACTIVATE (the window
never takes the focus).  Work files in .screen/soak.
"""
import argparse
import io
import os
import re
import subprocess
import sys
import time

import numpy as np
import psutil

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from private_settings import PrivateSettings  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, ".screen", "soak")
EXE = os.path.join(ROOT, "Release", "Kaleidoscope.exe")
QT_BIN = os.environ.get("QTDIR", r"C:\Qt\6.11.1\msvc2022_64") + r"\bin"
WARMUP_MIN = 10.0


def long_wav(minutes):
    """Tools/review128.wav looped to the run's length (48 kHz stereo)."""
    path = os.path.join(WORK, "soak_%d.wav" % minutes)
    if not os.path.exists(path):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i",
                        os.path.join(ROOT, "Tools", "review128.wav"), "-t", str(minutes * 60 + 30), "-ar", "48000",
                        "-ac", "2", "-c:a", "pcm_s16le", path], check=True)
    return path


def gpu_mb(pid):
    """The process's dedicated GPU memory in MB (sum over its adapters), or -1."""
    cmd = ("$c = Get-Counter -ErrorAction SilentlyContinue '\\GPU Process Memory(pid_%d_*)\\Dedicated Usage'; "
           "if ($c) { ($c.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum } else { -1 }" % pid)
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True,
                             timeout=30).stdout.strip()
        v = float(out.splitlines()[-1].replace(",", "."))
        return v / 1048576.0 if v >= 0 else -1.0
    except (ValueError, IndexError, subprocess.TimeoutExpired):
        return -1.0


def slope_per_hour(t_min, y):
    """MB per hour of a straight-line fit after the warm-up."""
    m = (t_min >= WARMUP_MIN) & (y >= 0)
    if m.sum() < 10:
        return float("nan")
    return float(np.polyfit(t_min[m] / 60.0, y[m], 1)[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preset", default="Allround")
    ap.add_argument("--hold", type=int, default=6)
    ap.add_argument("--minutes", type=int, default=62)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(WORK, exist_ok=True)
    wav = long_wav(a.minutes)
    stamp = time.strftime("%Y%m%d-%H%M")
    log = os.path.join(WORK, "soak-%s.log" % stamp)
    tsv = os.path.join(WORK, "soak-%s.tsv" % stamp)
    ps = PrivateSettings("soak")
    env = ps.env(os.environ)
    env.update(PATH=QT_BIN + os.pathsep + env.get("PATH", ""), KALEIDO_NO_ACTIVATE="1", KALEIDO_NO_MIDI="1",
               KALEIDO_GL_DEBUG="1", KALEIDO_SCENE_SWEEP=str(a.hold), KALEIDO_SEED="3",
               KALEIDO_MAX_RUNTIME_SECS=str(a.minutes * 60 + 60))
    fh = io.open(log, "w", encoding="utf-8", errors="replace")
    p = subprocess.Popen([EXE, "-c", a.preset, "-w", wav, "-t", "0"], cwd=os.path.dirname(EXE), env=env, stdout=fh,
                         stderr=subprocess.STDOUT, creationflags=0x00004000 if os.name == "nt" else 0)
    proc = psutil.Process(p.pid)
    print("soak: pid %d, %s, a scene every %d s, %d min -> %s" % (p.pid, a.preset, a.hold, a.minutes, tsv), flush=True)
    t0 = time.time()
    rows = []
    with io.open(tsv, "w", encoding="utf-8") as out:
        out.write("min\tprivate_mb\tws_mb\tgpu_mb\tchanges\tgl_errors\n")
        while p.poll() is None and time.time() - t0 < a.minutes * 60:
            time.sleep(10)
            try:
                mi = proc.memory_info()
            except psutil.Error:
                break
            fh.flush()
            txt = io.open(log, encoding="utf-8", errors="replace").read()
            changes = len(re.findall(r"^\[sweep\]", txt, re.M))
            errs = len(re.findall(r"OpenGL ERROR", txt))
            row = ((time.time() - t0) / 60.0, getattr(mi, "private", mi.rss) / 1048576.0, mi.rss / 1048576.0,
                   gpu_mb(p.pid), changes, errs)
            rows.append(row)
            out.write("%.2f\t%.1f\t%.1f\t%.1f\t%d\t%d\n" % row)
            out.flush()
    if p.poll() is None:
        p.terminate()                 # our own process, started above
        try:
            p.wait(30)
        except subprocess.TimeoutExpired:
            p.kill()
    fh.close()
    ps.close()
    if not rows:
        print("no samples")
        return 1
    r = np.array(rows)
    t, priv, ws, gpu = r[:, 0], r[:, 1], r[:, 2], r[:, 3]
    sp, sg = slope_per_hour(t, priv), slope_per_hour(t, gpu)
    g = gpu[(t >= WARMUP_MIN) & (gpu >= 0)]
    print("%.0f min, %d scene changes, %d GL errors" % (t[-1], int(r[-1, 4]), int(r[-1, 5])))
    print("private memory: %.0f -> %.0f MB, after minute %g: %+.1f MB per hour" % (priv[0], priv[-1], WARMUP_MIN, sp))
    print("GPU memory: %s" % ("%.0f .. %.0f MB after the warm-up, %+.1f MB per hour" % (g.min(), g.max(), sg)
                              if len(g) else "no counter"))
    ok = sp < 20.0 and int(r[-1, 5]) == 0 and int(r[-1, 4]) >= 600
    print("F1: %s" % ("met" if ok else "NOT met"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
