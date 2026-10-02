# -*- coding: utf-8 -*-
"""One measuring run over the chain labs (or any scenes): a table to compare before and after.

Every scene runs alone in a hidden preset (its Komplett.xml entry, walking with
morphP 0.8 unless --still), with the GPU timer, the frame and gap log, the
ShaderForge log on and the same rolls (--seed), for --secs seconds.  Per scene:

  fps median / min       of the per-second counts after the first --skip seconds
  GPU median / p90 / max ms   (KALEIDO_GPU_TIMING, one value per second)
  frames > 25 ms         count and the longest (inside paintGL)
  gaps > 50 ms           count and the longest (between frames: swap, other processes)
  first draws            the longest first draw of a forged 3D-lab program
  GL                     KHR_debug messages of high or medium severity (--gldebug: a debug context, slower)

The repo ini (kaleidoscope_settings.ini) is backed up and restored, the
temporary preset removed.  Nothing is sent anywhere; the app ends itself
(KALEIDO_MAX_RUNTIME_SECS).

  python Tools/perf_labs.py                       # the chain labs and the 3D named chains
  python Tools/perf_labs.py ChainLab2D --secs 60  # some scenes
  python Tools/perf_labs.py --tsv perf.tsv        # also as a table file
  python Tools/perf_labs.py --wav Tools/review128.wav   # with music (a steady beat: phrase-locked walks)
"""
import argparse, io, os, re, shutil, statistics, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REL = os.path.join(ROOT, "Release")
# KALEIDO_EXE: a copy of the app in Release/ (a long run goes on while the app is rebuilt)
EXE = os.environ.get("KALEIDO_EXE", "Kaleidoscope.exe")
INI = os.path.join(ROOT, "kaleidoscope_settings.ini")
DEFAULT = ["ChainLab2D", "ChainLabTunnel", "ChainLab3D", "ChainSlice3D",
           "Chain3DKifsTetra", "Chain3DMandelbox", "Chain3DOctaGyroid", "Chain3DPolarTunnelBoxes", "Chain3DTwistTorus",
           "ChainP4mSpiralKaleidoWarp", "ChainWaveDrosteHex"]


def preset(scene, still):
    src = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
    fx = re.search(r"[ \t]*<CombineShader\b[^>]*[\\/]FxPlain\.frag\"[^>]*>.*?</CombineShader>", src, re.S).group(0)
    m = re.search(r"[ \t]*<TextureShader\b[^>]*[\\/]" + scene + r"\.frag\"[^>]*>.*?</TextureShader>", src, re.S)
    if not m:
        raise SystemExit("no TextureShader entry for %s in Komplett.xml" % scene)
    blk = m.group(0)
    if not still:
        blk = re.sub(r'(<float name="morphP") minValue="[^"]*" maxValue="[^"]*"', r'\1 minValue="0.8" maxValue="0.8"', blk)
    head, rest = blk.split(">", 1)
    head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo)="[^"]*"', "", head)
    blk = head + ' probability="1.0" minTimeSolo="1000" maxTimeSolo="1200">' + rest
    return ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..' + "\\\\" + 'Images" '
            'ConfigurationName="_perf" hidden="true">\n' + blk + "\n" + fx + "\n</configuration>\n")


SEED, GLDEBUG = 1, False


WAV = None


def run(scene, secs, skip, still):
    io.open(os.path.join(ROOT, "Presets", "_perf.xml"), "w", encoding="utf-8").write(preset(scene, still))
    env = dict(os.environ, KALEIDO_MAX_RUNTIME_SECS=str(secs), KALEIDO_NO_ACTIVATE="1", KALEIDO_FPS_LOG="1",
               KALEIDO_GPU_TIMING="1", KALEIDO_FRAME_LOG="25", KALEIDO_SPEC_LOG="1", KALEIDO_SEED=str(SEED))
    if GLDEBUG:
        env["KALEIDO_GL_DEBUG"] = "1"
    cmd = [os.path.join(REL, EXE), "-c", "_perf", "-l"] + (["-w", os.path.abspath(WAV)] if WAV else [])
    p = subprocess.Popen(cmd, cwd=REL, env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p.wait(timeout=secs + 120)
    log = io.open(os.path.join(REL, "kaleidoscope.log"), encoding="utf-8", errors="replace").read()
    fps = [int(x) for x in re.findall(r"\[fps\] (\d+) fps", log)][skip:]
    gpu = sorted(float(x) for x in re.findall(r"\[gpu\] ([0-9.]+) ms avg", log)[skip:])
    frames = [float(x) for x in re.findall(r"\[frame\] t=\s*[0-9.]+s\s+([0-9.]+) ms", log)]
    gaps = [float(x) for x in re.findall(r"\[gap\] t=\s*[0-9.]+s\s+([0-9.]+) ms", log)]
    geom = [float(x) for x in re.findall(r"GEOM first draw \d+: ([0-9.]+) ms", log)]
    gl = len(re.findall(r"GLDEBUG \[(?:HIGH|MEDIUM|high|medium)", log))
    pick = lambda v, q: v[min(len(v) - 1, int(len(v) * q))] if v else float("nan")
    return {
        "scene": scene,
        "fps_med": statistics.median(fps) if fps else float("nan"), "fps_min": min(fps) if fps else float("nan"),
        "gpu_med": pick(gpu, 0.5), "gpu_p90": pick(gpu, 0.9), "gpu_max": gpu[-1] if gpu else float("nan"),
        "frames": len(frames), "frame_max": max(frames) if frames else 0.0,
        "gaps": len(gaps), "gap_max": max(gaps) if gaps else 0.0,
        "first_draw_max": max(geom) if geom else 0.0, "gl": gl,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("scenes", nargs="*", default=DEFAULT)
    ap.add_argument("--secs", type=int, default=40, help="seconds per scene (default 40)")
    ap.add_argument("--skip", type=int, default=5, help="seconds of warm-up left out of fps and GPU (default 5)")
    ap.add_argument("--still", action="store_true", help="no walk: the scene's own morphP range")
    ap.add_argument("--tsv", help="also write the table here")
    ap.add_argument("--seed", type=int, default=1, help="KALEIDO_SEED: the same rolls in every run (default 1)")
    ap.add_argument("--wav", help="analyse this WAV instead of the live input (silent, real time): music for the walk")
    ap.add_argument("--gldebug", action="store_true", help="KHR_debug on (a debug context: slower, the GL column counts)")
    a = ap.parse_args()
    global SEED, GLDEBUG, WAV
    SEED, GLDEBUG, WAV = a.seed, a.gldebug, a.wav
    sys.stdout.reconfigure(encoding="utf-8")
    backup = INI + ".perf_backup"
    shutil.copy(INI, backup)
    rows = []
    try:
        hdr = "%-26s %6s %5s %7s %7s %7s %10s %10s %8s %4s" % ("scene", "fps", "min", "gpu ms", "p90", "max",
                                                                "frames>25", "gaps>50", "1st draw", "GL")
        print(hdr); print("-" * len(hdr))
        for s in a.scenes:
            r = run(s, a.secs, a.skip, a.still)
            rows.append(r)
            print("%-26s %6.0f %5.0f %7.2f %7.2f %7.2f %4d/%5.0f %4d/%5.0f %8.1f %4d" % (
                s, r["fps_med"], r["fps_min"], r["gpu_med"], r["gpu_p90"], r["gpu_max"], r["frames"], r["frame_max"],
                r["gaps"], r["gap_max"], r["first_draw_max"], r["gl"]), flush=True)
    finally:
        shutil.copy(backup, INI)
        os.remove(backup)
        try:
            os.remove(os.path.join(ROOT, "Presets", "_perf.xml"))
        except OSError:
            pass
    if a.tsv and rows:
        keys = list(rows[0].keys())
        with io.open(a.tsv, "w", encoding="utf-8") as f:
            f.write("\t".join(keys) + "\n")
            for r in rows:
                f.write("\t".join(str(r[k]) for k in keys) + "\n")


if __name__ == "__main__":
    main()
