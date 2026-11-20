# -*- coding: utf-8 -*-
r"""section_lab.py -- the section detector replayed in Python on its own inputs, and variants of it scored at once.

`PresetEditor --features ... --section-trace FILE` writes, for every 0.1-s frame of AudioAnalyzer's section detector,
what it saw and what it decided (AudioAnalyzer::M_SectionTrace, 55 float32: time, the 32 bands' log shape and the
loudness, the 12 pitch classes, the three band groups' onset envelopes, music presence, the block's band sum, the drop
count, the novelty, whether a section started, the novelty's median).  The lab replays a detector on those inputs and
scores it exactly like Tools/analyser_vs_cues.py (a boundary after the first 12 s is found if a section starts from 2 s
before to 6 s after it; a section is invented if no boundary lies from 6 s before to 2 s after it) -- a second per
variant instead of a build and minutes of analysis.  "current" is the method in the code; --check compares its replay
with the sections the C++ decided, frame by frame.

    python Tools/section_lab.py --check @Tools/analyser_cue_set.txt @.screen/harmonix/set.txt
    python Tools/section_lab.py --sweep @Tools/analyser_cue_set.txt @.screen/harmonix/set.txt
    python Tools/section_lab.py --method NAME ...

The sets: the 43 demos of the generators (their score cues), and real tracks with the Harmonix Set's annotations
(Tools/harmonix_key.py).  Run Tools/analyser_vs_cues.py on a set once first: the lab reads its 16-bit PCM copies in
.screen/cuebench.  Traces are kept in .screen/sectionlab (rebuilt when PresetEditor is newer).  Below normal priority,
one track at a time.
"""
import argparse
import io
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyser_vs_cues as avc  # noqa: E402

ROOT = avc.ROOT
WORK = os.path.join(ROOT, ".screen", "sectionlab")
REC = 55
NB = 32
WARM = 12.0

# The trace's columns.
T, F0, CH0, ON0, PRES, SUM, DROPS, NOV, TRIG, MED = 0, 1, 34, 46, 49, 50, 51, 52, 53, 54


def below_normal():
    """Lower this process's priority."""
    try:
        import psutil
        psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 10)
    except Exception:
        pass


def trace(cue, wav):
    """The track's section trace (frames x 55), made once with PresetEditor."""
    os.makedirs(WORK, exist_ok=True)
    key = "%s_%s" % (os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(wav)))),
                     os.path.splitext(os.path.basename(wav))[0])
    pcm = os.path.join(avc.CACHE, key + ".wav")
    out = os.path.join(WORK, key + ".bin")
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(avc.EDITOR):
        if not os.path.exists(pcm):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "pcm_s16le", pcm], check=True)
        env = dict(os.environ, PATH=avc.QT_BIN + os.pathsep + os.environ.get("PATH", ""))
        subprocess.run([avc.EDITOR, "--features", pcm, os.path.join(WORK, key + ".csv"), "--every", "50",
                        "--section-trace", out], cwd=os.path.dirname(avc.EDITOR), env=env, capture_output=True,
                       check=True, creationflags=0x00004000 if os.name == "nt" else 0)
    return np.fromfile(out, dtype=np.float32).reshape(-1, REC).astype(np.float64)


def window_z(x, a, b, floor):
    """For every frame k (the last frame of the recent window): z = (mean of the last a frames - mean of the b frames
    before them) / (their spread + floor), per dimension; NaN where the history is short."""
    n = len(x)
    c1 = np.vstack([np.zeros((1, x.shape[1])), np.cumsum(x, axis=0)])
    c2 = np.vstack([np.zeros((1, x.shape[1])), np.cumsum(x * x, axis=0)])
    z = np.full(x.shape, np.nan)
    k = np.arange(a + b - 1, n)
    end = k + 1
    mid = end - a
    beg = mid - b
    ma = (c1[end] - c1[mid]) / a
    mb = (c1[mid] - c1[beg]) / b
    vb = np.maximum((c2[mid] - c2[beg]) / b - mb * mb, 0.0)
    z[k] = (ma - mb) / (np.sqrt(vb) + floor)
    return z


METHODS = {
    # name: parameters (see novelty() and decide())
    # the code: the threshold 2.5 since 20.11.2026, the one change that held up (docs/engine-internals.md, 68)
    "current": dict(a=30, b=120, w_loud=0.5, w_harm=0.0, w_rhy=0.0, thr=2.5, cool=120, abs_min=1.0),
    # the code until 20.11.2026
    "thr30": dict(a=30, b=120, w_loud=0.5, w_harm=0.0, w_rhy=0.0, thr=3.0, cool=120, abs_min=1.0),
}


def novelty(tr, p):
    """The novelty per frame of a method (0 before the history is full, as in the C++)."""
    shape = tr[:, F0:F0 + NB]
    loud = tr[:, F0 + NB:F0 + NB + 1]
    zs = window_z(shape, p["a"], p["b"], 1.0)
    zl = window_z(loud, p["a"], p["b"], 1.0)
    nov = np.sqrt(np.mean(zs * zs, axis=1)) + p["w_loud"] * np.abs(zl[:, 0])
    if p.get("w_harm"):
        ch = tr[:, CH0:CH0 + 12]
        zc = window_z(ch, p["a"], p["b"], p.get("harm_floor", 0.02))
        nov = nov + p["w_harm"] * np.sqrt(np.mean(zc * zc, axis=1))
    if p.get("w_rhy"):
        on = np.log1p(10.0 * tr[:, ON0:ON0 + 3])
        zr = window_z(on, p["a"], p["b"], p.get("rhy_floor", 0.1))
        nov = nov + p["w_rhy"] * np.sqrt(np.mean(zr * zr, axis=1))
    return np.nan_to_num(nov, nan=0.0)


def resets(tr):
    """The frames at which the analyser started a new song (AudioAnalyzer::beginSong(): the windows start over, so
    its novelty is exactly 0 for the next 149 frames) -- read from the C++ novelty, used by every method."""
    nz = tr[:, NOV] != 0.0
    return {i for i in range(1, len(tr)) if not nz[i] and nz[i - 1]}


def decide(tr, p, nov=None, song_starts=None):
    """The section starts (seconds) of a method: the C++ decision -- the novelty against its median of the last
    minute (taken every second), the threshold, a minimum level, 12 s apart (a drop counts as a change and starts the
    12 s as well), music present, a change that a drop takes over in the next frame does not count, and everything
    starts over with a new song."""
    if nov is None:
        nov = novelty(tr, p)
    if song_starts is None:
        song_starts = resets(tr)
    a_b = p["a"] + p["b"]
    hist = np.zeros(600)
    pos = n_hist = tick = frames = 0
    med = 0.0
    pending, pending_drops, cool = False, 0.0, 0
    mad = 1.0
    cand, cand_at = None, 0
    starts = []
    for i in range(len(tr)):
        if i in song_starts:
            frames = n_hist = pos = tick = cool = 0
            pending = False
            cand = None
        trigger = pending and tr[i, DROPS] == pending_drops
        pending = False
        if trigger:
            starts.append(tr[i, T])
        if i > 0 and tr[i, DROPS] > tr[i - 1, DROPS]:
            cool = max(cool, 120)
        frames += 1
        v = nov[i] if frames >= a_b else 0.0
        hist[pos] = v
        pos = (pos + 1) % 600
        n_hist = min(n_hist + 1, 600)
        tick += 1
        if tick >= 10:
            tick = 0
            med = float(np.partition(hist[:n_hist], n_hist // 2)[n_hist // 2])
            if p.get("norm") == "mad":
                mad = float(np.median(np.abs(hist[:n_hist] - med)))
        if p.get("norm") == "mad":
            rel = (v - med) / (mad + 1e-3) if n_hist else 0.0
        else:
            rel = v / (med + 1e-3)
        if cool > 0:
            cool -= 1
        ok = (frames >= 120 and cool == 0 and tr[i, PRES] > 0.5 and tr[i, SUM] > 1e-3 and rel > p["thr"]
              and v > p["abs_min"])
        w = p.get("peak", 0)
        if not w:
            if ok:
                pending, pending_drops, cool = True, tr[i, DROPS], p["cool"]
            continue
        # Peak picking: the highest novelty of a rise wins; it fires once w frames have passed without a higher one.
        if ok and (cand is None or v > cand):
            cand, cand_at = v, i
        if cand is not None and i - cand_at >= w:
            if cool == 0:
                pending, pending_drops, cool = True, tr[i, DROPS], p["cool"]
            cand = None
    return starts


def score(sets, p):
    """Per set: (boundaries, found, sections, invented, median delay of the found ones in seconds)."""
    out = {}
    for name, tracks in sets.items():
        nb = nf = ns = ni = 0
        delays = []
        for cues, tr in tracks:
            secs = [s for s in decide(tr, p) if s >= WARM]
            bounds = [t for t, _ in cues if t >= WARM]
            allb = [t for t, _ in cues]
            nb += len(bounds)
            for t in bounds:
                hit = [s - t for s in secs if t - 2.0 <= s <= t + 6.0]
                if hit:
                    nf += 1
                    delays.append(min(hit, key=abs))
            ns += len(secs)
            ni += sum(1 for s in secs if not avc.near(s, allb, 6.0, 2.0))
        out[name] = (nb, nf, ns, ni, float(np.median(delays)) if delays else float("nan"))
    return out


def fmeasure(nb, nf, ns, ni):
    """F of the found share (recall) and the share not invented (precision)."""
    r = nf / max(nb, 1)
    q = 1.0 - ni / max(ns, 1)
    return 2.0 * q * r / max(q + r, 1e-9)


def line(name, res):
    """One line of results: found, invented, F and the median delay per set."""
    parts = []
    for s, (nb, nf, ns, ni, dl) in res.items():
        parts.append("%s %3.0f %% found %3.0f %% inv. F %.2f (%3d, %+.1f s)"
                     % (s, 100.0 * nf / max(nb, 1), 100.0 * ni / max(ns, 1), fmeasure(nb, nf, ns, ni), ns, dl))
    return "%-30s %s" % (name, "   ".join(parts))


def sweep(sets, grid):
    """Every variant of the grid, one line each."""
    for name, p in grid:
        print(line(name, score(sets, p)), flush=True)


def grid_features():
    """Stage 2: the windows of the code, the harmony and the rhythm added, the threshold and the gap."""
    base = METHODS["current"]
    out = []
    for thr in (2.5, 2.75, 3.0):
        for cool in (120, 90):
            for wh in (0.0, 0.25, 0.5, 1.0):
                for wr in (0.0, 0.25, 0.5):
                    out.append(("thr%.2f cool%d harm%.2f rhy%.2f" % (thr, cool, wh, wr),
                                dict(base, thr=thr, cool=cool, w_harm=wh, w_rhy=wr)))
    return out


def grid_norm():
    """Stage 3: the novelty against its median and spread (MAD) instead of a multiple of the median; peak picking."""
    base = METHODS["current"]
    out = []
    for cool in (120, 90):
        for peak in (0, 5, 10):
            for thr in (2.5, 3.0):
                out.append(("median thr%.1f cool%d peak%d" % (thr, cool, peak), dict(base, thr=thr, cool=cool, peak=peak)))
            for k in (3.0, 4.0, 5.0, 6.0, 8.0):
                out.append(("mad k%.0f cool%d peak%d" % (k, cool, peak),
                            dict(base, norm="mad", thr=k, cool=cool, peak=peak)))
    return out


def grid_windows():
    """Stage 1: the windows and the threshold."""
    base = METHODS["current"]
    out = []
    for a, b in ((30, 120), (40, 40), (50, 50), (60, 60), (30, 60), (40, 80), (50, 100)):
        for thr in (2.5, 3.0, 3.5):
            out.append(("a%d b%d thr%.1f" % (a, b, thr), dict(base, a=a, b=b, thr=thr)))
    return out


def load(args):
    """{set name: [(cues, trace)]}."""
    sets = {}
    for a in args:
        name = os.path.basename(a.lstrip("@")).replace(".txt", "")
        if "harmonix" in a:
            name = "real"
        elif "cue_set" in a:
            name = "demos"
        tracks = []
        for cue, wav in avc.find_pairs([a]):
            sections, _ = avc.read_cues(cue)
            tracks.append((sections, trace(cue, wav)))
        sets[name] = tracks
    return sets


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("sets", nargs="+")
    ap.add_argument("--check", action="store_true", help="the replay of 'current' against the C++ decisions")
    ap.add_argument("--method", default="current", choices=sorted(METHODS))
    ap.add_argument("--sweep", default="", help="a grid of variants: windows, features, norm")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    below_normal()
    sets = load(a.sets)
    if a.check:
        p = METHODS["current"]
        bad = 0
        for name, tracks in sets.items():
            for cues, tr in tracks:
                mine = decide(tr, p)
                cpp = list(tr[tr[:, TRIG] > 0.5, T])
                nov = novelty(tr, p)
                live = tr[:, NOV] != 0.0
                dn = np.max(np.abs(nov[live] - tr[live, NOV])) if live.any() else 0.0
                if mine != cpp or dn > 1e-3:
                    bad += 1
                    print("  %s: replay %d sections, C++ %d, largest novelty difference %.4f"
                          % (name, len(mine), len(cpp), dn))
        print("replay against the C++: %d of %d tracks differ" % (bad, sum(len(t) for t in sets.values())))
    if a.sweep:
        sweep(sets, {"windows": grid_windows, "features": grid_features, "norm": grid_norm}[a.sweep]())
        return 0
    print(line(a.method, score(sets, METHODS[a.method])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
