# -*- coding: utf-8 -*-
r"""breath_drop.py -- the held breath around real and forced drops, old (follows the build-up) against new (let go at
the drop with the depth arc's envelope): render, measure, show.

The final pass's held breath (`breath`, Engine/Present.frag; its value from Source/AudioConditioner.cpp) dims,
desaturates and closes a vignette in a build-up.  Since 27.11.2026 a drop releases it with the depth effects' tension
arc envelope; KALEIDO_BREATH_DROP=0 brings back the old breath that lets go only as the build-up falls.  This tool
renders the stretches of the three cue demos of Tools/depth_arc.py (PillarHall with FxDepthFog at arcP 1, the same
export settings) once with the switch at 0 and once at 1, optionally with a forced drop (KALEIDO_FORCE_DROP) where the
build-up is high, and reads per frame the breath the app computed (KALEIDO_FEATURE_LOG, column `breath`), the
conditioned drop pulse (`dropFx`), the build-up, the frame's mean linear luminance and Tools/flash_count.py's count.

    python Tools/breath_drop.py render goa 1                 # one export (the new breath)
    python Tools/breath_drop.py render ostgut 0 --force 43   # the old breath, a forced drop 43 s into the stretch
    python Tools/breath_drop.py measure goa ostgut:43 ...    # numbers per run pair; sheet with --sheet <jpg>
    python Tools/breath_drop.py features a.wav b.wav          # whole tracks through PresetEditor --features, 0 and 1

Run render through the machine's heavy-job lock.
"""
import argparse
import csv
import io
import os
import shutil
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import depth_arc  # noqa: E402
import flash_count  # noqa: E402

WORK = depth_arc.WORK
SCENE, FX, ARC = "PillarHall", "FxDepthFog", 1.0


def tag(demo, breath, force=None):
    return "%s_breath%d%s" % (demo, breath, "" if force is None else "_force%g" % force)


def render(demo, breath, force=None):
    """One export with KALEIDO_BREATH_DROP=<breath> (and a forced drop); renames depth_arc's outputs to our tag."""
    saved = {k: os.environ.get(k) for k in ("KALEIDO_BREATH_DROP", "KALEIDO_FORCE_DROP")}
    os.environ["KALEIDO_BREATH_DROP"] = str(breath)
    if force is not None:
        os.environ["KALEIDO_FORCE_DROP"] = "%g" % force
    else:
        os.environ.pop("KALEIDO_FORCE_DROP", None)
    try:
        depth_arc.render(demo, SCENE, FX, ARC)
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    src = depth_arc.tag_of(demo, SCENE, FX, ARC)
    dst = tag(demo, breath, force)
    for ext in (".mp4", ".feat.csv", ".log"):
        shutil.move(os.path.join(WORK, src + ext), os.path.join(WORK, dst + ext))
    return os.path.join(WORK, dst + ".mp4")


def features(path):
    rows = list(csv.DictReader(io.open(path, encoding="utf-8")))
    return {k: np.array([float(r[k]) for r in rows]) for k in ("t", "buildUp", "dropFx", "breath")}


def run(demo, breath, force=None):
    """Per-frame series of one export: t, buildUp, dropFx, breath (from the log, at the frame times), mean linear
    luminance; and flash_count's (worst flashes/s, share above 3, mean luminance)."""
    t0 = tag(demo, breath, force)
    f = features(os.path.join(WORK, t0 + ".feat.csv"))
    L, fps = flash_count.frames(os.path.join(WORK, t0 + ".mp4"))
    n = len(L)
    t = np.arange(n) / fps
    j = np.minimum(np.searchsorted(f["t"], t), len(f["t"]) - 1)
    return dict(t=t, buildUp=f["buildUp"][j], dropFx=f["dropFx"][j], breath=f["breath"][j],
                lum=L.mean(axis=(1, 2)), flash=flash_count.count(L, fps), frames=L)


def hits(d):
    """Frame times where the conditioned drop pulse jumps above 0.5."""
    up = np.flatnonzero((d["dropFx"][1:] > 0.5) & (d["dropFx"][:-1] <= 0.5)) + 1
    return d["t"][up]


def numbers(a, b, h):
    """Around one hit h (old run a, new run b): the breath at the hit, when each has gone half / all the way down
    (s after the hit), the largest frame-to-frame rise of the breath's release (per second) and of the mean
    luminance in the 2 s after the hit."""
    t = a["t"]
    at = int(np.argmin(np.abs(t - h)))
    out = {"b_hit": a["breath"][at]}
    w = (t >= h) & (t <= h + 3.0)
    for nm, d in (("old", a), ("new", b)):
        x = d["breath"][w]
        tw = t[w] - h
        b0 = max(x[0], 1e-6)
        half = tw[np.argmax(x <= 0.5 * b0)] if (x <= 0.5 * b0).any() else float("nan")
        zero = tw[np.argmax(x <= 0.01)] if (x <= 0.01).any() else float("nan")
        out[nm + "_half"], out[nm + "_zero"] = half, zero
        out[nm + "_rate"] = float(np.max(-np.diff(x)) * 60.0) if len(x) > 1 else 0.0
        lw = d["lum"][(t >= h) & (t <= h + 2.0)]
        out[nm + "_lumrise"] = float(np.max(np.diff(lw))) if len(lw) > 1 else 0.0
    return out


def sheet(pairs, out):
    """One panel per run pair and hit: 10 s before to 6 s after.  Upper: the breath, old (grey) and new (gold).
    Lower: the build-up (blue), the conditioned drop pulse (red), the mean luminance new minus old (green, scaled)."""
    from PIL import Image, ImageDraw
    panels = [(lab, a, b, h) for lab, a, b in pairs for h in hits(b)]
    pw, ph, lm = 1000, 260, 80
    img = Image.new("RGB", (pw + lm + 20, ph * max(1, len(panels)) + 40), (24, 24, 24))
    dr = ImageDraw.Draw(img)
    dr.text((10, 10), "held breath around the drops: old = follows the build-up (KALEIDO_BREATH_DROP=0), "
            "new = let go with the depth arc's envelope", fill=(230, 230, 230))
    for k, (lab, a, b, h) in enumerate(panels):
        y0 = 40 + k * ph
        t = a["t"] - h
        sel = (t >= -10) & (t <= 6)
        ts = t[sel]
        top, bot = (y0 + 22, y0 + 120), (y0 + 130, y0 + ph - 28)

        def xy(tt, v, lo, hi, box):
            return [(lm + (x + 10) / 16.0 * pw, box[1] - (y - lo) / (hi - lo + 1e-9) * (box[1] - box[0]))
                    for x, y in zip(tt, v)]
        for box in (top, bot):
            dr.rectangle([lm, box[0], lm + pw, box[1]], outline=(80, 80, 80))
        for s in range(-10, 7, 2):
            x = lm + (s + 10) / 16.0 * pw
            dr.line([(x, bot[1]), (x, bot[1] + 4)], fill=(120, 120, 120))
            dr.text((x - 8, bot[1] + 6), "%+d" % s if s else "hit", fill=(150, 150, 150))
        dr.line(xy(ts, a["breath"][sel], 0, 1, top), fill=(150, 150, 150), width=2)
        dr.line(xy(ts, b["breath"][sel], 0, 1, top), fill=(250, 190, 60), width=2)
        dr.line(xy(ts, a["buildUp"][sel], 0, 1, bot), fill=(70, 110, 220), width=2)
        dr.line(xy(ts, b["dropFx"][sel], 0, 1, bot), fill=(200, 60, 60), width=1)
        dl = (b["lum"] - a["lum"])[sel]
        r = max(abs(dl).max(), 0.005)
        dr.line(xy(ts, dl, -r, r, bot), fill=(90, 220, 120), width=1)
        x = lm + 10 / 16.0 * pw
        dr.line([(x, top[0]), (x, bot[1])], fill=(255, 255, 255))
        n = numbers(a, b, h)
        dr.text((lm + 4, y0 + 4), "%s, hit at %.2f s: breath at the hit %.2f; half-way old %.2f s / new %.2f s, "
                "zero old %.2f / new %.2f s; flashes/s old %.1f, new %.1f" % (
                    lab, h, n["b_hit"], n["old_half"], n["new_half"], n["old_zero"], n["new_zero"],
                    a["flash"][0], b["flash"][0]), fill=(220, 220, 220))
        dr.text((4, top[0] + 4), "grey old", fill=(150, 150, 150))
        dr.text((4, top[0] + 18), "gold new", fill=(250, 190, 60))
        dr.text((4, bot[0] + 4), "blue build-up", fill=(70, 110, 220))
        dr.text((4, bot[0] + 20), "red drop", fill=(200, 60, 60))
        dr.text((4, bot[0] + 36), "green lum\nnew-old\n+-%.3f" % r, fill=(90, 220, 120))
    img.save(out, quality=90)
    return out


def editor_features(wavs):
    """The whole tracks through the real analyser and conditioner (PresetEditor --features, 10-ms rows), with the
    switch at 0 and 1: the breath at each of the analyser's drops, when it is half-way / all the way down."""
    import subprocess
    editor = os.path.join(depth_arc.ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe")
    env = dict(os.environ)
    env["PATH"] = os.environ.get("QTDIR", r"C:\Qt\6.11.1\msvc2022_64") + r"\bin" + os.pathsep + env.get("PATH", "")
    os.makedirs(WORK, exist_ok=True)
    for wav in wavs:
        cols = {}
        for k in (0, 1):
            out = os.path.join(WORK, "%s_features_breath%d.csv" % (os.path.splitext(os.path.basename(wav))[0], k))
            env["KALEIDO_BREATH_DROP"] = str(k)
            subprocess.run([editor, "--features", wav, out, "--every", "1"], check=True, env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            rows = list(csv.DictReader(io.open(out, encoding="utf-8")))
            cols[k] = {c: np.array([float(r[c]) for r in rows]) for c in ("t", "drops", "drop_c", "breath", "buildup")}
        t = cols[0]["t"]
        steps = t[1:][np.diff(cols[0]["drops"]) > 0]
        print("%s: %d drops; breath max |new-old| %.3f" % (os.path.basename(wav), len(steps),
                                                            float(np.abs(cols[1]["breath"] - cols[0]["breath"]).max())))
        for s in steps:
            i = int(np.searchsorted(t, s))
            w = (t >= s) & (t <= s + 4.0)
            tw = t[w] - s
            b_hit = cols[0]["breath"][i]
            res = []
            for k in (0, 1):
                x = cols[k]["breath"][w]
                half = tw[np.argmax(x <= 0.5 * b_hit)] if b_hit > 0.01 and (x <= 0.5 * b_hit).any() else float("nan")
                zero = tw[np.argmax(x <= 0.01)] if (x <= 0.01).any() else float("nan")
                res += [half, zero]
            print("  drop at %.2f s: build-up %.2f, breath at the hit %.3f; half-way old %.2f / new %.2f s, zero old "
                  "%.2f / new %.2f s" % (s, cols[0]["buildup"][i], b_hit, res[0], res[2], res[1], res[3]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    fe = sub.add_parser("features")
    fe.add_argument("wavs", nargs="+")
    r = sub.add_parser("render")
    r.add_argument("demo", choices=sorted(depth_arc.DEMOS))
    r.add_argument("breath", type=int, choices=(0, 1))
    r.add_argument("--force", type=float, help="a forced drop this many seconds into the stretch")
    m = sub.add_parser("measure")
    m.add_argument("runs", nargs="+", help="demo or demo:force")
    m.add_argument("--sheet")
    a = ap.parse_args()
    if a.cmd == "features":
        editor_features(a.wavs)
        return
    if a.cmd == "render":
        print(render(a.demo, a.breath, a.force))
        return
    pairs = []
    for spec in a.runs:
        demo, _, f = spec.partition(":")
        force = float(f) if f else None
        old, new = run(demo, 0, force), run(demo, 1, force)
        n = min(len(old["t"]), len(new["t"]))
        for d in (old, new):
            for k in ("t", "buildUp", "dropFx", "breath", "lum", "frames"):
                d[k] = d[k][:n]
        same = int(np.count_nonzero(np.abs(old["frames"] - new["frames"]).max(axis=(1, 2)) > 0))
        lab = demo + ("" if force is None else " forced drop at %g s" % force)
        print("%s: frames differing %d of %d; breath max |new-old| %.3f; flashes/s old %.1f new %.1f; mean lum "
              "old %.4f new %.4f" % (lab, same, n, float(np.abs(new["breath"] - old["breath"]).max()),
                                     old["flash"][0], new["flash"][0], old["flash"][2], new["flash"][2]))
        for h in hits(new):
            q = numbers(old, new, h)
            print("  hit %.2f s: breath at the hit %.3f; half-way old %.2f / new %.2f s; zero old %.2f / new %.2f s; "
                  "fastest release old %.2f/s new %.2f/s; largest frame rise of the mean luminance (2 s) old %.4f "
                  "new %.4f" % (h, q["b_hit"], q["old_half"], q["new_half"], q["old_zero"], q["new_zero"],
                                q["old_rate"], q["new_rate"], q["old_lumrise"], q["new_lumrise"]))
        pairs.append((lab, old, new))
    if a.sheet:
        print(sheet(pairs, a.sheet))


if __name__ == "__main__":
    main()
