# -*- coding: utf-8 -*-
r"""depth_arc.py -- the depth effects' tension arc (plan P2, 27.11.2026) over real drops: render, measure, show.

The five depth effects (FX/FxDepthFog, FxDepthField, FxSunShafts, FxRimLight, FxAmbientOcclusion) read the build-up
and the drop when their preset knob `arcP` is above 0.  This tool renders one scene with one of them over a stretch of
a generator demo whose drops are known from its score cues (Tools/analyser_cue_set.txt; the music stays local -- the
stretch is cut into .screen/p2arc), as a video export on the frame clock (60 fps, 960 x 540, fixed rolls and photo,
the user's settings in a private copy), and measures each frame:

  far      mean linear luminance of the frame's far half (the pixels farther than the frame's median depth)
  near     the same of the near half
  detail   mean |Laplacian| of the far half's luma (sRGB), for the depth of field
  the build-up and the drop pulse the app saw (KALEIDO_FEATURE_LOG)

The depth per frame comes from a third run of the same scene with FxPlain (its entry carrying the effect's float
lines, so the rolls stay the same) and KALEIDO_SHOW_DEPTH=1.  `--old DIR` renders the effect from a copy of the old
shader (bit-identity at arcP 0 is shown by comparing the decoded frames).

    python Tools/depth_arc.py render goa PillarHall FxDepthFog 1          # one export (arcP 1)
    python Tools/depth_arc.py render goa PillarHall FxDepthFog 0 --old .screen/fxold
    python Tools/depth_arc.py render goa PillarHall depth                 # the depth run
    python Tools/depth_arc.py measure goa PillarHall FxDepthFog           # -> .screen/p2arc/*.tsv, the numbers
    python Tools/depth_arc.py same A.mp4 B.mp4                            # decoded frames identical?

Run render through the machine's heavy-job lock.
"""
import argparse
import csv
import io
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import screen  # noqa: E402
import flash_count  # noqa: E402

ROOT = screen.ROOT
WORK = os.path.join(ROOT, ".screen", "p2arc")
PHOTO = "kristallhoehle-indigo-fuchsia-2.jpg"   # the snapshot baseline's photo (it has a depth map)
W, H = 160, 90
FPS = 60
# demo -> (path without extension, first second, last second of the stretch).  The stretch starts >= 45 s before the
# drop: the analyser arms drops after 30 s and keeps the groove level of the last 45 s.
DEMOS = {
    "goa": ("G:/Tools/VRAudio/PsytranceGenerator/work/demos/goa", 15.0, 90.0),
    "uplifting": ("G:/Tools/VRAudio/TranceGenerator/work/demos/uplifting", 140.0, 205.0),
    "ostgut": ("G:/Tools/VRAudio/TechnoGenerator/work/demos/ostgut", 120.0, 192.0),
}


def cues(demo):
    """(drops, sections) of the demo's score cues inside its stretch, in seconds of the stretch."""
    path, a, b = DEMOS[demo]
    drops, secs = [], []
    for line in io.open(path + ".cues.tsv", encoding="utf-8"):
        p = line.rstrip("\r\n").split("\t")
        if line.startswith("#") or len(p) < 2:
            continue
        t = float(p[0])
        if not a <= t <= b:
            continue
        if p[1].endswith("/drop"):
            drops.append(t - a)
        elif p[1].endswith("/section"):
            secs.append((t - a, p[2].split()[0] if len(p) > 2 and p[2] else "?"))
    return drops, secs


def stretch(demo):
    """The demo's stretch as a 16-bit WAV in .screen/p2arc (cut once)."""
    path, a, b = DEMOS[demo]
    os.makedirs(WORK, exist_ok=True)
    wav = os.path.join(WORK, "%s_%d_%d.wav" % (demo, a, b))
    if not os.path.exists(wav):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-to", str(b), "-i", path + ".wav",
                        "-c:a", "pcm_s16le", wav], check=True)
    return wav


def blocks():
    """{name: block} of Komplett.xml's scene and combine entries (the first of each name)."""
    src = io.open(screen.KOMPLETT, encoding="utf-8").read()
    out = {}
    for m in screen.BLOCK.finditer(src):
        nm = screen.NAME.search(m.group(0).split(">", 1)[0])
        if nm and nm.group(1) not in out:
            out[nm.group(1)] = m.group(0)
    return out


def tag_of(demo, scene, fx, arc=None, old=None):
    if fx == "depth":
        return "%s_%s_depth" % (demo, scene)
    return "%s_%s_%s_arc%s%s" % (demo, scene, fx, ("%g" % arc).replace(".", "p"), "_old" if old else "")


def render(demo, scene, fx, arc, old=None, size="960x540"):
    """One export; returns the video's path."""
    os.makedirs(WORK, exist_ok=True)
    wav = stretch(demo)
    bl = blocks()
    scene_blk = bl[scene]
    head, rest = scene_blk.split(">", 1)
    head = re.sub(r'\s(probability|minTimeSolo|maxTimeSolo)="[^"]*"', "", head)
    scene_blk = head + ' probability="1.0" minTimeSolo="1000" maxTimeSolo="1200">' + rest
    base = "FxDepthFog" if fx == "depth" else fx
    fx_blk = bl[base]
    head, rest = fx_blk.split(">", 1)
    head = re.sub(r'\sprobability="[^"]*"', ' probability="1.0"', head)
    rest = re.sub(r'[ \t]*<float name="arcP"[^>]*>\s*</float>[ \t]*\n', "", rest)   # the preset's own roll goes
    rest = rest.replace("</CombineShader>", '  <float name="arcP" minValue="%g" maxValue="%g"></float>\n'
                        '  </CombineShader>' % (arc or 0.0, arc or 0.0))
    if fx == "depth":   # FxPlain with the same float lines: the same rolls, no effect
        head = head.replace(base + ".frag", "FxPlain.frag")
    fx_blk = head + ">" + rest
    # The old shader runs from the effect's own path: the rolls are seeded with the file's path, so a copy elsewhere
    # would roll differently.  The new file is put back afterwards (and is committed before such a run).
    swap = None
    if old and fx != "depth":
        target = os.path.join(ROOT, "FX", base + ".frag")
        swap = (target, io.open(target, "rb").read())
        io.open(target, "wb").write(io.open(os.path.join(old, base + ".frag"), "rb").read())
    _, _, cross = screen.read_master()
    cfg = "ZZArc"
    xml = ('<?xml version="1.0" encoding="utf-8" ?>\n<configuration ImageDirectory="..\\\\Images" '
           'ConfigurationName="%s" hidden="true" >\n\n' % cfg + scene_blk + "\n" + fx_blk + "\n" + cross
           + "</configuration>\n")
    preset = os.path.join(ROOT, "Presets", cfg + ".xml")
    io.open(preset, "w", encoding="utf-8").write(xml)
    tag = tag_of(demo, scene, fx, arc, old)
    vid = os.path.join(WORK, tag + ".mp4")
    log = os.path.join(WORK, tag + ".log")
    env = dict(os.environ, KALEIDO_SEED="7", KALEIDO_FIXED_PHOTO=PHOTO, KALEIDO_NO_ACTIVATE="1",
               KALEIDO_NP_FAKE=screen.NP_QUIET, KALEIDO_MAX_RUNTIME_SECS="900",
               KALEIDO_FEATURE_LOG=os.path.join(WORK, tag + ".feat.csv"))
    if fx == "depth":
        env["KALEIDO_SHOW_DEPTH"] = "1"
    screen.settings_env(env)
    try:
        if os.path.exists(vid):
            os.remove(vid)
        with io.open(log, "w", encoding="utf-8", errors="replace") as fh:
            subprocess.run([os.path.join(screen.APP_DIR, "Kaleidoscope.exe"), "-c", cfg, "-e", wav, "-g", size,
                            "-p", str(FPS), "-d", vid, "-j", "nofade", "-t", "0"], cwd=screen.APP_DIR, env=env,
                           stdout=fh, stderr=subprocess.STDOUT, creationflags=0x00004000 if os.name == "nt" else 0)
    finally:
        os.remove(preset)
        if swap:
            io.open(swap[0], "wb").write(swap[1])
    if not os.path.exists(vid):
        sys.exit("no video; see " + log)
    return vid


def decode(vid, gray=False):
    """The video's frames at W x H: sRGB 0..1, (n, H, W, 3)."""
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vf", "scale=%d:%d" % (W, H), "-pix_fmt", "rgb24",
                        "-f", "rawvideo", "-"], capture_output=True)
    b = np.frombuffer(p.stdout, np.uint8)
    n = b.size // (W * H * 3)
    return b[:n * W * H * 3].reshape(n, H, W, 3).astype(np.float32) / 255.0


def linear_lum(x):
    lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    return lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def features(path):
    """{column: array} of a KALEIDO_FEATURE_LOG file."""
    rows = list(csv.DictReader(io.open(path, encoding="utf-8")))
    return {k: np.array([float(r[k]) for r in rows]) for k in ("t", "buildUp", "dropPulse", "dropCount")}


def measure(demo, scene, fx, arcs=(0.0, 1.0)):
    """Per frame far/near luminance and far detail for each arc value; writes <demo>_<scene>_<fx>.tsv."""
    dep = decode(os.path.join(WORK, tag_of(demo, scene, "depth") + ".mp4"))[..., 0]
    cols = {}
    for a in arcs:
        vid = os.path.join(WORK, tag_of(demo, scene, fx, a) + ".mp4")
        if not os.path.exists(vid):    # arcP 0 is the old shader's picture (shown bit for bit by `same`)
            vid = os.path.join(WORK, tag_of(demo, scene, fx, a, old=True) + ".mp4")
        x = decode(vid)
        n = min(len(x), len(dep))
        L = linear_lum(x[:n])
        luma = x[:n] @ np.array([0.299, 0.587, 0.114], np.float32)
        lap = np.abs(4 * luma[:, 1:-1, 1:-1] - luma[:, :-2, 1:-1] - luma[:, 2:, 1:-1] - luma[:, 1:-1, :-2]
                     - luma[:, 1:-1, 2:])
        far, near, det = [], [], []
        for i in range(n):
            d = dep[i]
            far_m = d <= np.median(d)          # the depth view is bright near, dark far
            if far_m.all():
                far_m = d <= d.min()
            far.append(L[i][far_m].mean())
            near.append(L[i][~far_m].mean() if (~far_m).any() else np.nan)
            det.append(lap[i][far_m[1:-1, 1:-1]].mean())
        cols[a] = (np.array(far), np.array(near), np.array(det), flash_count.count(L, FPS))
    f = features(os.path.join(WORK, tag_of(demo, scene, fx, arcs[-1]) + ".feat.csv"))
    out = os.path.join(WORK, "%s_%s_%s.tsv" % (demo, scene, fx))
    n = min(len(c[0]) for c in cols.values())
    with io.open(out, "w", encoding="utf-8") as fh:
        fh.write("t\tbuildUp\tdropPulse\t" + "\t".join("far%g\tnear%g\tdetail%g" % (a, a, a) for a in arcs) + "\n")
        for i in range(n):
            t = i / float(FPS)
            j = min(np.searchsorted(f["t"], t), len(f["t"]) - 1)
            fh.write("%.3f\t%.3f\t%.3f\t" % (t, f["buildUp"][j], f["dropPulse"][j])
                     + "\t".join("%.5f\t%.5f\t%.5f" % (cols[a][0][i], cols[a][1][i], cols[a][2][i]) for a in arcs)
                     + "\n")
    for a in arcs:
        print("%s arcP %g: worst %.1f flashes/s, mean luminance %.4f" % (fx, a, cols[a][3][0], cols[a][3][2]))
    return out


def read_tsv(path):
    rows = list(csv.DictReader(io.open(path, encoding="utf-8"), delimiter="\t"))
    return {k: np.array([float(r[k]) for r in rows]) for k in rows[0]}


def smooth(x, n=12):
    """A moving average over n frames (0.2 s at 60 fps), the ends held."""
    k = np.ones(n) / float(n)
    return np.convolve(np.pad(x, (n // 2, n - 1 - n // 2), mode="edge"), k, mode="valid")


def numbers(demo, scene, fx, col="far"):
    """The arc in numbers, from the effect's relative change (arcP 1 against 0, smoothed over 0.2 s):

      corr    its correlation with the build-up over the 30 s before the drop's hit
      peak    its extreme over the 6 s before the hit (the build-up's tension)
      before  its mean over the 0.5 s before the hit
      after   its mean from 0.5 to 1.5 s after the hit
      hit     the analyser's hit (drop pulse above 0.5) against the cue drop, s
      half    when, after the hit, it has gone half the way from `before` to `after`, s
    """
    d = read_tsv(os.path.join(WORK, "%s_%s_%s.tsv" % (demo, scene, fx)))
    drop = cues(demo)[0][0]
    t = d["t"]
    base = smooth(d[col + "0"])
    rel = smooth(d[col + "1"] - d[col + "0"]) / np.maximum(base, 1e-6)
    hit = t[np.argmax(d["dropPulse"] > 0.5)] if (d["dropPulse"] > 0.5).any() else drop
    pre = (t > hit - 30) & (t < hit - 0.05)
    corr = float(np.corrcoef(rel[pre], d["buildUp"][pre])[0, 1]) if rel[pre].std() > 1e-9 else 0.0
    six = rel[(t > hit - 6) & (t < hit - 0.05)]
    peak = six[np.argmax(np.abs(six))]
    before = rel[(t > hit - 0.5) & (t < hit - 0.05)].mean()
    after = rel[(t > hit + 0.5) & (t < hit + 1.5)].mean()
    w = (t >= hit) & (t <= hit + 2.5)
    half = float("nan")
    if abs(after - before) > 1e-4:
        crossed = (rel[w] - before) / (after - before) >= 0.5
        if crossed.any():
            half = t[w][np.argmax(crossed)] - hit
    return dict(corr=corr, peak=peak, before=before, after=after, hit=hit - drop, half=half)


def plot(panels, out, col="far", title=""):
    """A sheet: one panel per (demo, scene, fx), 40 s before to 8 s after the cue drop (white line).  Upper part: the
    measure with arcP 0 (grey) and 1 (gold), smoothed over 0.2 s.  Lower part: the relative change arcP 1 against 0
    (green, its scale printed), the build-up (blue, 0..1) and the drop pulse (red, 0..1) the app saw."""
    from PIL import Image, ImageDraw
    pw, ph, lm = 1000, 300, 70
    img = Image.new("RGB", (pw + lm + 20, ph * len(panels) + 40), (24, 24, 24))
    dr = ImageDraw.Draw(img)
    dr.text((10, 10), title, fill=(230, 230, 230))
    for k, (demo, scene, fx) in enumerate(panels):
        d = read_tsv(os.path.join(WORK, "%s_%s_%s.tsv" % (demo, scene, fx)))
        drop = cues(demo)[0][0]
        y0 = 40 + k * ph
        t = d["t"] - drop
        sel = (t >= -40) & (t <= 8)
        ts = t[sel]
        a0, a1 = smooth(d[col + "0"])[sel], smooth(d[col + "1"])[sel]
        rel = (smooth(d[col + "1"] - d[col + "0"]) / np.maximum(smooth(d[col + "0"]), 1e-6))[sel]
        lo, hi = min(a0.min(), a1.min()), max(a0.max(), a1.max())
        r = max(abs(rel).max(), 0.02)
        top = (y0 + 22, y0 + 150)
        bot = (y0 + 160, y0 + ph - 28)

        def xy(tt, v, vlo, vhi, box):
            return [(lm + (x + 40) / 48.0 * pw, box[1] - (y - vlo) / (vhi - vlo + 1e-9) * (box[1] - box[0]))
                    for x, y in zip(tt, v)]
        for box in (top, bot):
            dr.rectangle([lm, box[0], lm + pw, box[1]], outline=(80, 80, 80))
        for s in range(-40, 9, 5):
            x = lm + (s + 40) / 48.0 * pw
            dr.line([(x, bot[1]), (x, bot[1] + 4)], fill=(120, 120, 120))
            dr.text((x - 8, bot[1] + 6), "%+d" % s if s else "drop", fill=(150, 150, 150))
        dr.line(xy(ts, a0, lo, hi, top), fill=(150, 150, 150), width=1)
        dr.line(xy(ts, a1, lo, hi, top), fill=(250, 190, 60), width=1)
        dr.line(xy(ts, d["buildUp"][sel], 0, 1, bot), fill=(70, 110, 220), width=2)
        dr.line(xy(ts, d["dropPulse"][sel], 0, 1, bot), fill=(200, 60, 60), width=1)
        zero = xy([0], [0], -r, r, bot)[0][1]
        dr.line([(lm, zero), (lm + pw, zero)], fill=(70, 70, 70))
        dr.line(xy(ts, rel, -r, r, bot), fill=(90, 220, 120), width=2)
        x = lm + 40 / 48.0 * pw
        dr.line([(x, top[0]), (x, bot[1])], fill=(255, 255, 255))
        n = numbers(demo, scene, fx, col)
        dr.text((lm + 4, y0 + 4), "%s  %s  %s  (%s %.4f..%.4f)   change: corr with build-up %.2f, extreme in the 6 s "
                "before %+.1f %%, before the hit %+.1f %%, after %+.1f %%, half-way %.2f s after the hit (hit %+.2f s "
                "from the cue)" % (demo, scene, fx, col, lo, hi, n["corr"], 100 * n["peak"], 100 * n["before"],
                                   100 * n["after"], n["half"], n["hit"]), fill=(220, 220, 220))
        dr.text((4, top[0] + 4), "grey arc0", fill=(150, 150, 150))
        dr.text((4, top[0] + 18), "gold arc1", fill=(250, 190, 60))
        dr.text((4, bot[0] + 4), "green\nchange\n+-%.0f %%" % (100 * r), fill=(90, 220, 120))
        dr.text((4, bot[0] + 50), "blue\nbuild-up", fill=(70, 110, 220))
        dr.text((4, bot[0] + 82), "red drop", fill=(200, 60, 60))
    img.save(out, quality=90)
    return out


def frozen(scenes, fxs, label):
    """Frozen frames (Tools/scene_snapshots.py's shot: fixed steps, silent, the photo) of each scene with each effect,
    from the old shader (.screen/fxold) and from the new one with the preset's entry as it is (no arcP: the uniform
    stays 0); prints how many pixels differ."""
    import scene_snapshots as ss
    from private_settings import PrivateSettings
    from PIL import Image
    ss.PS = PrivateSettings("p2frozen")
    out = os.path.join(WORK, "frozen_" + label)
    os.makedirs(out, exist_ok=True)
    bl = blocks()
    same_n = 0
    for sc in scenes:
        for fx in fxs:
            blk = re.sub(r'[ \t]*<float name="arcP"[^>]*>\s*</float>[ \t]*\n', "", bl[fx])
            target = os.path.join(ROOT, "FX", fx + ".frag")
            new_src = io.open(target, "rb").read()
            pics = []
            for kind in ("old", "new"):
                f = os.path.join(out, "%s_%s_%s.jpg" % (sc, fx, kind))
                try:   # the old shader from the effect's own path (the rolls are seeded with it)
                    if kind == "old":
                        io.open(target, "wb").write(io.open(os.path.join(ROOT, ".screen", "fxold", fx + ".frag"),
                                                            "rb").read())
                    r = ss.shoot(bl[sc], blk, f, PHOTO, 60)
                finally:
                    io.open(target, "wb").write(new_src)
                pics.append(np.asarray(Image.open(f), np.int16) if r else None)
            if pics[0] is None or pics[1] is None:
                print("%s %s: no frame" % (sc, fx))
                continue
            d = np.abs(pics[0] - pics[1])
            same_n += int(d.max() == 0)
            print("%s %s: max %d, mean %.4f of 255" % (sc, fx, d.max(), d.mean()), flush=True)
    print("%d of %d identical" % (same_n, len(scenes) * len(fxs)))
    snap = os.path.join(ROOT, "Presets", "_snap0.xml")   # the shot's preset (PresetEditor --validate would list it)
    if os.path.exists(snap):
        os.remove(snap)


def frame_at(vid, t, w=384, h=216):
    p = subprocess.run(["ffmpeg", "-v", "error", "-ss", "%.3f" % t, "-i", vid, "-frames:v", "1", "-vf",
                        "scale=%d:%d" % (w, h), "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True)
    return np.frombuffer(p.stdout, np.uint8)[:w * h * 3].reshape(h, w, 3)


def strip(demo, rows, out, times=(-20.0, -6.0, -1.0, 0.25, 0.6, 2.0, 5.0)):
    """A sheet of frames around the drop: per (scene, fx) a row arcP 0 and a row arcP 1, columns at the times."""
    from PIL import Image, ImageDraw
    drop = cues(demo)[0][0]
    w, h, lm = 384, 216, 170
    img = Image.new("RGB", (lm + w * len(times), 30 + (h + 4) * 2 * len(rows)), (20, 20, 20))
    dr = ImageDraw.Draw(img)
    for j, t in enumerate(times):
        dr.text((lm + j * w + 4, 8), "drop %+.2f s" % t, fill=(220, 220, 220))
    for i, (sc, fx) in enumerate(rows):
        for k, arc in enumerate((0.0, 1.0)):
            vid = os.path.join(WORK, tag_of(demo, sc, fx, arc) + ".mp4")
            if not os.path.exists(vid):
                vid = os.path.join(WORK, tag_of(demo, sc, fx, arc, old=True) + ".mp4")
            y = 30 + (2 * i + k) * (h + 4)
            dr.text((6, y + 6), "%s\n%s\narcP %g" % (sc, fx, arc), fill=(220, 220, 220))
            for j, t in enumerate(times):
                img.paste(Image.fromarray(frame_at(vid, drop + t, w, h)), (lm + j * w, y))
    img.save(out, quality=88)
    return out


def same(a, b):
    """Whether two videos decode to the same frames (full size)."""
    def frames(v):
        return subprocess.run(["ffmpeg", "-v", "error", "-i", v, "-f", "framemd5", "-"], capture_output=True,
                              text=True).stdout.splitlines()
    fa, fb = [l for l in frames(a) if not l.startswith("#")], [l for l in frames(b) if not l.startswith("#")]
    fa = [l.split(",")[-1].strip() for l in fa if l.startswith("0,")]
    fb = [l.split(",")[-1].strip() for l in fb if l.startswith("0,")]
    diff = sum(1 for x, y in zip(fa, fb) if x != y)
    print("%d / %d frames, %d differ" % (len(fa), len(fb), diff + abs(len(fa) - len(fb))))
    return diff == 0 and len(fa) == len(fb)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render")
    r.add_argument("demo", choices=sorted(DEMOS))
    r.add_argument("scene")
    r.add_argument("fx", help="FxDepthFog ... or 'depth' for the depth run")
    r.add_argument("arc", nargs="?", type=float, default=0.0)
    r.add_argument("--old", help="folder with the old shader")
    m = sub.add_parser("measure")
    m.add_argument("demo", choices=sorted(DEMOS))
    m.add_argument("scene")
    m.add_argument("fx")
    s = sub.add_parser("same")
    s.add_argument("a")
    s.add_argument("b")
    c = sub.add_parser("cues")
    c.add_argument("demo", choices=sorted(DEMOS))
    b = sub.add_parser("batch", help="several renders: demo:scene:fx[:arc[:old]] each, skipping videos that exist")
    b.add_argument("specs", nargs="+")
    q = sub.add_parser("strip", help="frames around the drop, arcP 0 and 1, rows scene:fx -> JPG")
    q.add_argument("demo", choices=sorted(DEMOS))
    q.add_argument("out")
    q.add_argument("rows", nargs="+")
    z = sub.add_parser("frozen", help="frozen frames, old shader against new without arcP")
    z.add_argument("label")
    z.add_argument("--scenes", nargs="+", default=["PillarHall", "FoldLab"])
    z.add_argument("--fx", nargs="+", default=["FxDepthFog", "FxDepthField", "FxSunShafts", "FxRimLight",
                                               "FxAmbientOcclusion"])
    p = sub.add_parser("sheet", help="a sheet of panels demo:scene:fx (measured) -> JPG")
    p.add_argument("out")
    p.add_argument("panels", nargs="+")
    p.add_argument("--col", default="far", help="far, near or detail")
    p.add_argument("--title", default="")
    k = sub.add_parser("clip", help="before | after side by side over the drop, with the music (stays local)")
    k.add_argument("demo", choices=sorted(DEMOS))
    k.add_argument("scene")
    k.add_argument("fx")
    k.add_argument("out")
    k.add_argument("--scene2", help="a second scene below the first (before | after each)")
    k.add_argument("--pre", type=float, default=20.0)
    k.add_argument("--post", type=float, default=6.0)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    if a.cmd == "render":
        print(render(a.demo, a.scene, a.fx, a.arc, a.old))
    elif a.cmd == "batch":
        import time
        for spec in a.specs:
            p = spec.split(":")
            arc = float(p[3]) if len(p) > 3 else 0.0
            old = os.path.join(ROOT, ".screen", "fxold") if len(p) > 4 and p[4] == "old" else None
            if os.path.exists(os.path.join(WORK, tag_of(p[0], p[1], p[2], arc, old) + ".mp4")):
                continue
            t0 = time.time()
            vid = render(p[0], p[1], p[2], arc, old)
            print("%s  %.0f s" % (os.path.basename(vid), time.time() - t0), flush=True)
    elif a.cmd == "measure":
        print(measure(a.demo, a.scene, a.fx))
    elif a.cmd == "strip":
        print(strip(a.demo, [tuple(r.split(":")) for r in a.rows], a.out))
    elif a.cmd == "frozen":
        frozen(a.scenes, a.fx, a.label)
    elif a.cmd == "sheet":
        print(plot([tuple(s.split(":")) for s in a.panels], a.out, a.col, a.title))
    elif a.cmd == "clip":
        drop = cues(a.demo)[0][0]
        ss, dur = max(drop - a.pre, 0.0), a.pre + a.post
        inputs = []
        for sc in [a.scene] + ([a.scene2] if a.scene2 else []):
            before = os.path.join(WORK, tag_of(a.demo, sc, a.fx, 0.0) + ".mp4")
            if not os.path.exists(before):
                before = os.path.join(WORK, tag_of(a.demo, sc, a.fx, 0.0, old=True) + ".mp4")
            inputs += [before, os.path.join(WORK, tag_of(a.demo, sc, a.fx, 1.0) + ".mp4")]
        cmd = ["ffmpeg", "-v", "error", "-y"]
        for v in inputs:
            cmd += ["-ss", "%.3f" % ss, "-t", "%.3f" % dur, "-i", v]
        if len(inputs) == 2:
            fc = "[0:v][1:v]hstack=inputs=2[v]"
        else:
            fc = "[0:v][1:v]hstack=inputs=2[t];[2:v][3:v]hstack=inputs=2[b];[t][b]vstack=inputs=2[v]"
        subprocess.run(cmd + ["-filter_complex", fc, "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-crf", "21",
                              "-preset", "veryfast", "-c:a", "aac", "-b:a", "160k", a.out], check=True)
        print(a.out)
    elif a.cmd == "same":
        return 0 if same(a.a, a.b) else 1
    elif a.cmd == "cues":
        print(cues(a.demo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
