# -*- coding: utf-8 -*-
"""Measures every class of the 2D chain: how much it moves, how much detail it makes, what it costs on the GPU.

The walk picks classes on a calm..energetic scale (the ord functions of the
lab, "Energie-Ordnung"); that order was set by hand.  This measures it:

  --visual  each class alone (the other stages 'none', the photo look, fixed
            photo pool), rendered by the editor's uber shader at sceneTime T
            and T + DT (deterministic):
              motion = mean absolute luma change between the two frames,
              detail = mean luma gradient of the frame (edge density).
  --gpu     each class alone in the app (chain runner), frozen
            (KALEIDO_FREEZE_TIME), KALEIDO_GPU_TIMING: the median frame GPU
            time minus that of an all-'none' chain = the class's own cost.
  --alias   each class alone in the editor at 960x540:
              alias   = mean absolute luma difference to the same frame
                        rendered at twice the size and averaged down
                        (what 2x2 supersampling would change),
              flicker = mean absolute second difference of three frames
                        1/60 s apart (sparkle; smooth motion gives ~0).
            The classes with the most get the chain on a doubled grid in
            the app (make_chainpass: "// @chainss").
  --world   the 3D lab's world stages (space, fold core, body): each class
            alone in ChainLab3D (the others on their first class, the colour
            chain plain), motion and detail as --visual, into world_stats.tsv
            (apply_energy_order.py --world).

Results go to Tools/scenegen/class_stats.tsv (one row per stage and class,
keyed by the class NAME -- positions change when the order does -- merged
with what is there).  apply_energy_order.py turns them into the order.

  python Tools/chain_class_stats.py --visual
  python Tools/chain_class_stats.py --gpu [--missing]   # the GPU must be otherwise idle
  python Tools/chain_class_stats.py --alias
  python Tools/chain_class_stats.py --world
"""
import argparse, io, os, re, shutil, statistics, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SG = os.path.join(ROOT, "Tools", "scenegen")
REL = os.path.join(ROOT, "Release")
# KALEIDO_EXE: a copy of the app in Release/ (a long run goes on while the app is rebuilt)
EXE = os.environ.get("KALEIDO_EXE", "Kaleidoscope.exe")
INI = os.path.join(ROOT, "kaleidoscope_settings.ini")
OUT = os.path.join(SG, "class_stats.tsv")
sys.path.insert(0, SG)
import chain_classes as cc                                    # noqa: E402

STAGES = [("A", "chainAP"), ("B", "chainBP"), ("C", "chainCP"), ("D", "chainDP")]
BASE = {"morphP": 0.0, "styleP": 0.1, "paletteP": 0.3, "orderP": 0.01, "speedP": 0.5, "detailP": 0.6,
        "tiltP": 0.0, "glowP": 0.0, "hueP": 1.0}


def pins_for(stage_knob, pos):
    p = dict(BASE)
    for _, k in STAGES:
        p[k] = 0.5 / len(cc.CLASSES[k])                       # 'none' (position 0)
    p[stage_knob] = (pos + 0.5) / len(cc.CLASSES[stage_knob])
    return p


def load():
    rows = {}
    if os.path.exists(OUT):
        lines = io.open(OUT, encoding="utf-8").read().splitlines()
        hdr = lines[0].split("\t")
        for l in lines[1:]:
            v = dict(zip(hdr, l.split("\t")))
            rows[(v["stage"], v["class"])] = v
    return rows


def save(rows):
    hdr = ["stage", "pos", "class", "motion", "detail", "gpu_ms", "alias", "flicker"]
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\t".join(hdr) + "\n")
        for key in sorted(rows, key=lambda k: ("ABCD".index(k[0]), int(rows[k].get("pos", 0)))):
            f.write("\t".join(str(rows[key].get(h, "")) for h in hdr) + "\n")


def render(pins, t, out, w=480, h=270, lab="ChainLab2D"):
    args = [os.path.join(ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe"), "--render",
            os.path.join("..", "Scene2D", lab + ".frag"), os.path.join("..", "FX", "FxPlain.frag"), out, str(w), str(h),
            "--time", str(t), "--expr", "sceneTime=%g" % t, "--expr", "sceneAdvance=%g" % (t / 2),
            "--expr", "audioPhase=%g" % (t * 0.05), "--expr", "audioAdvance=%g" % (t * 0.03),
            "--images", os.path.join(ROOT, "Images")]
    for k, v in pins.items():
        args += ["--param", "%s=%g" % (k, v)]
    subprocess.run(args, cwd=REL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    return os.path.exists(out)


def visual(rows, T, DT):
    from PIL import Image
    import numpy as np
    tmp = os.path.join(os.environ.get("TEMP", "."), "class_stats")
    os.makedirs(tmp, exist_ok=True)
    def luma(p):
        a = np.asarray(Image.open(p).convert("RGB")).astype(float) / 255.0
        return a @ np.array([0.299, 0.587, 0.114])
    for st, knob in STAGES:
        for pos, name in enumerate(cc.CLASSES[knob]):
            pins = pins_for(knob, pos)
            a, b = os.path.join(tmp, "a.png"), os.path.join(tmp, "b.png")
            for f in (a, b):
                if os.path.exists(f): os.remove(f)
            if not (render(pins, T, a) and render(pins, T + DT, b)):
                print("%s%-2d render failed" % (st, pos), flush=True)
                continue
            la, lb = luma(a), luma(b)
            motion = float(abs(la - lb).mean())
            gy, gx = np.gradient(la)
            detail = float(np.hypot(gx, gy).mean())
            r = rows.setdefault((st, name or "none"), {"stage": st, "class": name or "none"})
            r.update({"pos": pos, "motion": "%.5f" % motion, "detail": "%.5f" % detail})
            print("%s%-2d %-30s motion %.4f detail %.4f" % (st, pos, name or "none", motion, detail), flush=True)
            save(rows)


WORLD = [("space", "spaceP"), ("core", "coreP"), ("body", "bodyP")]
WORLD_OUT = os.path.join(SG, "world_stats.tsv")


def world(T, DT):
    from PIL import Image
    import numpy as np
    tmp = os.path.join(os.environ.get("TEMP", "."), "world_stats")
    os.makedirs(tmp, exist_ok=True)
    def luma(p):
        a = np.asarray(Image.open(p).convert("RGB")).astype(float) / 255.0
        return a @ np.array([0.299, 0.587, 0.114])
    rows = []
    for st, knob in WORLD:
        names = cc.CLASSES[knob]
        for pos, name in enumerate(names):
            pins = dict(BASE, layerP=0.0, hyperP=0.0, isoP=0.0, solidP=0.6, reliefP=0.0, camP=0.0)
            for _, k in STAGES:
                pins[k] = 0.5 / len(cc.CLASSES[k])            # the colour chain plain
            for _, k in WORLD:
                pins[k] = 0.5 / len(cc.CLASSES[k])            # the other world stages on their first class
            pins[knob] = (pos + 0.5) / len(names)
            a, b = os.path.join(tmp, "a.png"), os.path.join(tmp, "b.png")
            for f in (a, b):
                if os.path.exists(f): os.remove(f)
            if not (render(pins, T, a, lab="ChainLab3D") and render(pins, T + DT, b, lab="ChainLab3D")):
                print("%s %-2d render failed" % (st, pos), flush=True)
                continue
            la, lb = luma(a), luma(b)
            motion = float(abs(la - lb).mean())
            gy, gx = np.gradient(la)
            detail = float(np.hypot(gx, gy).mean())
            rows.append((st, pos, name, motion, detail))
            print("%-5s %-2d %-30s motion %.4f detail %.4f" % (st, pos, name, motion, detail), flush=True)
            with io.open(WORLD_OUT, "w", encoding="utf-8", newline="\n") as f:
                f.write("stage\tpos\tclass\tmotion\tdetail\n")
                for r in rows:
                    f.write("%s\t%d\t%s\t%.5f\t%.5f\n" % r)


def alias(rows, T):
    from PIL import Image
    import numpy as np
    tmp = os.path.join(os.environ.get("TEMP", "."), "class_alias")
    os.makedirs(tmp, exist_ok=True)
    def luma(p):
        a = np.asarray(Image.open(p).convert("RGB")).astype(float) / 255.0
        return a @ np.array([0.299, 0.587, 0.114])
    for st, knob in STAGES:
        for pos, name in enumerate(cc.CLASSES[knob]):
            pins = pins_for(knob, pos)
            fs = [os.path.join(tmp, "%d.png" % i) for i in range(4)]
            for f in fs:
                if os.path.exists(f): os.remove(f)
            ok = (render(pins, T, fs[0], 960, 540) and render(pins, T, fs[1], 1920, 1080)
                  and render(pins, T + 1 / 60, fs[2], 960, 540) and render(pins, T + 2 / 60, fs[3], 960, 540))
            if not ok:
                print("%s%-2d render failed" % (st, pos), flush=True)
                continue
            l0, big, l1, l2 = (luma(f) for f in fs)
            h, w = l0.shape                                  # the editor renders at the screen's DPI scale
            ss = big[:2 * h, :2 * w].reshape(h, 2, w, 2).mean(axis=(1, 3))
            al = float(abs(l0 - ss).mean())
            fl = float(abs(l0 - 2 * l1 + l2).mean())
            r = rows.setdefault((st, name or "none"), {"stage": st, "class": name or "none"})
            r.update({"pos": pos, "alias": "%.5f" % al, "flicker": "%.5f" % fl})
            print("%s%-2d %-30s alias %.4f flicker %.4f" % (st, pos, name or "none", al, fl), flush=True)
            save(rows)


def preset(pins):
    src = io.open(os.path.join(ROOT, "Presets", "Komplett.xml"), encoding="utf-8").read()
    fx = re.search(r"[ \t]*<CombineShader\b[^>]*[\\/]FxPlain\.frag\"[^>]*>.*?</CombineShader>", src, re.S).group(0)
    blk = re.search(r"[ \t]*<TextureShader\b[^>]*[\\/]ChainLab2D\.frag\"[^>]*>.*?</TextureShader>", src, re.S).group(0)
    for k, v in pins.items():
        blk = re.sub(r'(<float name="%s") minValue="[^"]*" maxValue="[^"]*"' % k, r'\1 minValue="%g" maxValue="%g"' % (v, v), blk)
    head, rest = blk.split(">", 1)
    head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo)="[^"]*"', "", head)
    blk = head + ' probability="1.0" minTimeSolo="100" maxTimeSolo="120">' + rest
    return ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..' + "\\\\" + 'Images" '
            'ConfigurationName="_stats" hidden="true">\n' + blk + "\n" + fx + "\n</configuration>\n")


def gpu_once(pins, secs):
    io.open(os.path.join(ROOT, "Presets", "_stats.xml"), "w", encoding="utf-8").write(preset(pins))
    env = dict(os.environ, KALEIDO_MAX_RUNTIME_SECS=str(secs), KALEIDO_NO_ACTIVATE="1", KALEIDO_GPU_TIMING="1",
               KALEIDO_FREEZE_TIME="30", KALEIDO_SEED="7", KALEIDO_FIXED_PHOTO=sorted(os.listdir(os.path.join(ROOT, "Images")))[0])
    subprocess.run([os.path.join(REL, EXE), "-c", "_stats", "-l"], cwd=REL, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=secs + 120)
    log = io.open(os.path.join(REL, "kaleidoscope.log"), encoding="utf-8", errors="replace").read()
    g = [float(x) for x in re.findall(r"\[gpu\] ([0-9.]+) ms avg", log)][3:]
    return statistics.median(g) if g else float("nan")


MISSING_ONLY = False


def gpu(rows, secs):
    backup = INI + ".stats_backup"
    shutil.copy(INI, backup)
    try:
        base = gpu_once(pins_for("chainAP", 0), secs)
        print("baseline (all none): %.3f ms" % base, flush=True)
        for st, knob in STAGES:
            for pos, name in enumerate(cc.CLASSES[knob]):
                have = rows.get((st, name or "none"), {}).get("gpu_ms", "")
                if MISSING_ONLY and have not in ("", "nan"):
                    continue
                ms = gpu_once(pins_for(knob, pos), secs) - base
                r = rows.setdefault((st, name or "none"), {"stage": st, "class": name or "none"})
                r.update({"pos": pos, "gpu_ms": "%.3f" % ms})
                print("%s%-2d %-30s gpu %+.3f ms" % (st, pos, name or "none", ms), flush=True)
                save(rows)
    finally:
        shutil.copy(backup, INI)
        os.remove(backup)
        try:
            os.remove(os.path.join(ROOT, "Presets", "_stats.xml"))
        except OSError:
            pass


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--visual", action="store_true")
    ap.add_argument("--gpu", action="store_true")
    ap.add_argument("--alias", action="store_true")
    ap.add_argument("--world", action="store_true")
    ap.add_argument("--t", type=float, default=40.0, help="scene time of the first frame (visual)")
    ap.add_argument("--dt", type=float, default=2.0, help="seconds between the two frames (visual)")
    ap.add_argument("--secs", type=int, default=9, help="seconds per GPU run")
    ap.add_argument("--missing", action="store_true", help="GPU: only the classes without a value yet")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    global MISSING_ONLY
    MISSING_ONLY = a.missing
    rows = load()
    if a.visual:
        visual(rows, a.t, a.dt)
    if a.gpu:
        gpu(rows, a.secs)
    if a.alias:
        alias(rows, a.t)
    if a.world:
        world(a.t, a.dt)
        return
    save(rows)


if __name__ == "__main__":
    main()
