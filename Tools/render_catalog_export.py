# -*- coding: utf-8 -*-
"""Catalogue frames for many scenes in one go: a video export on the frame clock, the scene sweep walking them.

    python Tools/render_catalog_export.py --out cat1016 Name1 Name2 ...
    python Tools/render_catalog_export.py --out cat1016 --list names.txt [--jobs 2] [--chunk 60]

Tools/render_catalog_images.ps1 starts the app once per scene and waits 28 s of real time for it: 35 s a scene,
three hours for 300.  This renders the scenes of a chunk in ONE video export (Kaleidoscope.exe -e): the scene sweep
(KALEIDO_SCENE_SWEEP) walks them on the export's frame clock, one 27-s window each, and the audio is the catalogue
track (Tools/catalog_scan.wav: quiet to 17 s, loud after) once per window, so every scene hears what it heard
before.  The export renders as fast as the GPU allows; the three frames of a scene come out of the video at 8, 16
and 21 s into its window -- the marks the old tool took from the start of its own run.  The rest is as before: the
real preset entry (probability 1), the photo pool, FxPlain on top, KALEIDO_SEED; a staged scene (sceneProgress)
runs its arc over 24 s (KALEIDO_SOLO_SECS), so the third frame shows it near the end.

The catalogue shows the frames at 320 x 200; the export is 1280 x 720 (--size).  Several chunks run side by side
(--jobs): each export has its own preset, video, log and settings copy.  The first window of a chunk is a
sacrificial copy of its first scene (the app coming up).  Resumable: a scene whose three PNGs exist is left out.
Writes into docs/Catalog/rendered/<out>; make_catalog.py takes it from there.
"""
import argparse
import concurrent.futures
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import wave

from private_settings import PrivateSettings

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QT_BIN = r"C:\Qt\6.11.1\msvc2022_64\bin"
TRACK = os.path.join(ROOT, "Tools", "catalog_scan.wav")
WINDOW = 27                       # seconds a scene stands: the catalogue track's length
MARKS = (("A", 8.0), ("B", 16.0), ("C", 21.0))
SWEEP = re.compile(r"^\[sweep\]\s+(\d+)/\d+\s+t=([\d.]+)s\s+(\S+)", re.M)
SHOWN = re.compile(r"^\[shown\] t=([\d.]+)s\s+(-?\d+)\s+(\S+)", re.M)


def stem(name):
    """A scene name as the sweep logs it (a path, a .frag) reduced to the bare name."""
    return re.split(r"[\\/]", name)[-1].rsplit(".frag", 1)[0]


def entries():
    """{scene name: its TextureShader block} from Komplett.xml (the first entry of a shader)."""
    src = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"[ \t]*<TextureShader\b[^>]*file=\"[^\"]*[\\/](\w+)\.frag\"[^>]*>.*?</TextureShader>",
                         src, re.S):
        out.setdefault(m.group(1), m.group(0))
    return out


def write_preset(name, blocks):
    """A hidden sweep preset: the scenes in order (probability 1), FxPlain on top."""
    body = []
    for b in blocks:
        head, rest = b.split(">", 1)
        head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo)="[^"]*"', "", head)
        body.append(head + ' probability="1.0" minTimeSolo="100" maxTimeSolo="120">' + rest)
    fx = ('  <CombineShader file="..\\\\FX\\\\FxPlain.frag" type="normal" probability="1.0" complexity="1" '
          'minTimeSolo="100" maxTimeSolo="120" minTimeInterpolation="20" maxTimeInterpolation="30">\n'
          '  </CombineShader>\n')
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="%s" hidden="true">\n' % name + "\n".join(body) + "\n" + fx + "</configuration>\n")
    path = os.path.join(ROOT, "Presets", name + ".xml")
    io.open(path, "w", encoding="utf-8").write(xml)
    return path


def write_track(path, windows):
    """The catalogue track once per window."""
    src = wave.open(TRACK)
    params, frames = src.getparams(), src.readframes(src.getnframes())
    src.close()
    if abs(params.nframes / float(params.framerate) - WINDOW) > 0.05:
        sys.exit("%s is %.2f s long, the window %d s" % (TRACK, params.nframes / float(params.framerate), WINDOW))
    out = wave.open(path, "wb")
    out.setparams(params)
    for _ in range(windows):
        out.writeframes(frames)
    out.close()


def export(job, names, blocks, exe, size, fps, work, ps):
    """One chunk: preset, track, export.  Returns (names, video, log text, seconds)."""
    preset = "_catexport%d" % job
    ppath = write_preset(preset, [blocks[0]] + blocks)        # window 0: a sacrificial copy of the first
    wav = os.path.join(work, "track%d.wav" % job)
    write_track(wav, len(blocks) + 1)
    mp4 = os.path.join(work, "chunk%d.mp4" % job)
    env = ps.env(os.environ, job)
    env.update(PATH=QT_BIN + os.pathsep + env.get("PATH", ""), KALEIDO_SCENE_SWEEP=str(WINDOW),
               KALEIDO_SOLO_SECS="24", KALEIDO_SEED="1", KALEIDO_NO_ACTIVATE="1", KALEIDO_NO_MIDI="1",
               KALEIDO_MAX_RUNTIME_SECS=str((len(blocks) + 1) * WINDOW + 600))   # never longer than real time
    t = time.time()
    p = subprocess.run([exe, "-c", preset, "-e", wav, "-g", size, "-p", str(fps), "-d", mp4, "-j", "nofade", "-t", "0"],
                       cwd=os.path.dirname(exe), env=env, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", creationflags=0x00004000 if os.name == "nt" else 0)  # below normal
    os.remove(ppath)
    os.remove(wav)
    log = (p.stdout or "") + (p.stderr or "")
    io.open(os.path.join(work, "chunk%d.log" % job), "w", encoding="utf-8").write(log)
    if p.returncode != 0 or not os.path.exists(mp4):
        print("chunk %d: export failed (rc %d): %s" % (job, p.returncode,
                                                        " | ".join(l for l in log.splitlines() if "[export]" in l)[-400:]))
        return names, None, log, time.time() - t
    return names, mp4, log, time.time() - t


def frames(names, mp4, log, out):
    """The three marks of every window, checked against what the sweep says was on screen."""
    sweeps = {int(m.group(1)): (float(m.group(2)), m.group(3)) for m in SWEEP.finditer(log)}
    shown = [(float(m.group(1)), m.group(3)) for m in SHOWN.finditer(log)]
    jobs, problems = [], []
    for w, name in enumerate(names, start=1):
        if w not in sweeps:
            problems.append("%s: no sweep window" % name)
            continue
        t0, swept = sweeps[w]
        if stem(swept) != name:
            problems.append("%s: window %d swept %s" % (name, w, swept))
            continue
        for tag, dt in MARKS:
            at = t0 + dt
            on = [s for ts, s in shown if ts <= at]
            if not on or stem(on[-1]) != name:
                problems.append("%s_%s: %s on screen at %.1f s" % (name, tag, on[-1] if on else "nothing", at))
            jobs.append((at, os.path.join(out, "%s_%s.png" % (name, tag))))

    def grab(job):
        at, png = job
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-threads", "2", "-ss", "%.3f" % at, "-i", mp4,
                        "-frames:v", "1", png], check=False)
        return os.path.exists(png)

    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        ok = sum(pool.map(grab, jobs))
    return ok, problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("names", nargs="*")
    ap.add_argument("--list", help="a file with one scene name per line")
    ap.add_argument("--out", required=True, help="folder under docs/Catalog/rendered")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--chunk", type=int, default=60, help="scenes per export")
    ap.add_argument("--size", default="1280x720")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--exe", default=os.path.join(ROOT, "Release", "Kaleidoscope.exe"))
    a = ap.parse_args()

    names = list(a.names) + ([l.strip() for l in io.open(a.list, encoding="utf-8") if l.strip()] if a.list else [])
    out = os.path.join(ROOT, "docs", "Catalog", "rendered", a.out)
    os.makedirs(out, exist_ok=True)
    known = entries()
    todo = [n for n in names if not all(os.path.exists(os.path.join(out, "%s_%s.png" % (n, t))) for t, _ in MARKS)]
    missing = [n for n in todo if n not in known]
    todo = [n for n in todo if n in known]
    if missing:
        print("not in Komplett.xml: %s" % ", ".join(missing))
    print("%d scene(s) to render, %d already there" % (len(todo), len(names) - len(todo) - len(missing)))
    if not todo:
        return 0
    chunks = [todo[i:i + a.chunk] for i in range(0, len(todo), a.chunk)]
    work = tempfile.mkdtemp(prefix="kaleido_catexport_")
    t = time.time()
    rendered, problems = 0, []
    with PrivateSettings("catexport") as ps, concurrent.futures.ThreadPoolExecutor(a.jobs) as pool:
        futures = [pool.submit(export, i, c, [known[n] for n in c], a.exe, a.size, a.fps, work, ps)
                   for i, c in enumerate(chunks)]
        for f in concurrent.futures.as_completed(futures):
            names_c, mp4, log, secs = f.result()
            if not mp4:
                problems.append("export of %d scenes failed (log in %s)" % (len(names_c), work))
                continue
            ok, prob = frames(names_c, mp4, log, out)
            rendered += ok
            problems += prob
            print("chunk of %d scenes: export %.0f s (%.1f s a scene), %d frames" % (len(names_c), secs,
                                                                                    secs / len(names_c), ok))
            os.remove(mp4)
    print("%d frames for %d scenes in %.1f min -> %s" % (rendered, len(todo), (time.time() - t) / 60, out))
    for p in problems:
        print("  * " + p)
    if problems:
        print("the export logs stay in %s" % work)
    else:
        shutil.rmtree(work, ignore_errors=True)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
