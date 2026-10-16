# -*- coding: utf-8 -*-
"""analyzer_regress.py -- the audio analysis against tracks whose truth is known, and against its own last state.

The analyzer (AudioAnalyzer::processBlock, two thousand lines run every 10 ms) had no test with a truth: on
16.10.2026 its harmonic change had been dead for months (it never passed 0.17) and nothing noticed.  This script
renders the synthetic tracks whose truth the generators write down, runs them through the real analyzer and
conditioner (PresetEditor --features, one row per 10-ms block) and checks:

  chords.wav (Tools/make_chord_wav.py, .changes.txt)
      chord changes seen: the harmony envelope (harm_c) rises above 0.5 within -0.3..+1.0 s of a change;
      false alarms: its rises in the stretches without a change (the drone, the held chord with a melody).
  structure128.wav (Tools/make_structure_wav.py, .drops.txt)
      drops seen: the drop counter steps within one bar (1.875 s) after a true drop; tempo: median 128 +-2 BPM.
  broadband120.wav (Tools/broadband120.wav)
      tempo: median 120 +-2 BPM.

and, for every feature column of every track: mean, 90th percentile, and that it moves at all (variance > 0),
against Tools/analyzer_baseline.json.  A count worse than the baseline, a dead feature, or a mean or p90 that
moved by more than its tolerance fails; `--update` writes the current state as the new baseline (deliberately,
after looking at what changed).

    python Tools/analyzer_regress.py            # exit code 0 = as good as the baseline
    python Tools/analyzer_regress.py --update   # accept the current state
"""
import argparse
import csv
import io
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREEN = os.path.join(ROOT, ".screen")
EDITOR = os.path.join(ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe")
BASELINE = os.path.join(ROOT, "Tools", "analyzer_baseline.json")
QT_BIN = os.environ.get("QTDIR", r"C:\Qt\6.11.1\msvc2022_64") + r"\bin"

# A feature's mean or p90 may move this much (absolute, the features are 0..1 or turns) before it counts as changed.
TOL = 0.05
# Columns that are counters, clocks or ids rather than features (their mean says nothing).
SKIP = {"t", "sections", "section_id", "known", "drops", "advance", "rotphase", "flip", "harm_adv", "bpm"}


def ensure(wav, maker):
    """Render a synthetic track once (they are deterministic)."""
    if not os.path.exists(wav):
        subprocess.run([sys.executable, os.path.join(ROOT, "Tools", maker), wav], check=True, cwd=ROOT,
                       stdout=subprocess.DEVNULL)
    return wav


def features(wav):
    """The analyzer's and conditioner's output for every 10-ms block of a WAV, as columns."""
    out = os.path.join(SCREEN, os.path.splitext(os.path.basename(wav))[0] + ".features.csv")
    env = dict(os.environ)
    env["PATH"] = QT_BIN + os.pathsep + env.get("PATH", "")
    subprocess.run([EDITOR, "--features", wav, out, "--every", "1"], check=True, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rows = list(csv.DictReader(io.open(out, encoding="utf-8")))
    return {k: np.array([float(r[k]) for r in rows]) for k in rows[0]}


def rises(t, v, thr):
    """The times a signal crosses thr upward."""
    up = (v[1:] > thr) & (v[:-1] <= thr)
    return t[1:][up]


def truth(wav, kind):
    """The generator's truth beside a track: <wav>.<kind>.txt (or <stem>.<kind>.txt), the time first on each line."""
    for path in (wav + "." + kind + ".txt", os.path.splitext(wav)[0] + "." + kind + ".txt"):
        if os.path.exists(path):
            return [float(l.split()[0]) for l in io.open(path, encoding="utf-8")
                    if l.strip() and not l.startswith("#")]
    sys.exit("no truth file beside %s" % wav)


def stats(f, warm):
    """Mean, p90 and whether it moves, per feature column, after the warm-up."""
    m = f["t"] >= warm
    out = {}
    for k, v in f.items():
        if k in SKIP:
            continue
        x = v[m]
        out[k] = {"mean": round(float(x.mean()), 4), "p90": round(float(np.percentile(x, 90)), 4),
                  "moves": bool(x.var() > 1e-10)}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--update", action="store_true", help="write the current state as the baseline")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(SCREEN, exist_ok=True)
    if not os.path.exists(EDITOR):
        sys.exit("PresetEditor is not built: %s" % EDITOR)

    now = {"counts": {}, "stats": {}}

    # ---- chord changes ----
    chords = ensure(os.path.join(SCREEN, "chords.wav"), "make_chord_wav.py")
    f = features(chords)
    changes = truth(chords, "changes")
    up = rises(f["t"], f["harm_c"], 0.5)
    seen = sum(1 for c in changes if any(c - 0.3 <= u <= c + 1.0 for u in up))
    quiet = [(2.0, 30.0), (126.0, 156.0)]                    # the drone; the held chord under a melody
    false = sum(1 for u in up if any(lo <= u < hi for lo, hi in quiet))
    now["counts"]["chord_changes_seen"] = seen
    now["counts"]["chord_changes_total"] = len(changes)
    now["counts"]["chord_false_alarms"] = false
    now["stats"]["chords"] = stats(f, 12.0)

    # ---- drops and tempo ----
    struct_wav = ensure(os.path.join(SCREEN, "structure128.wav"), "make_structure_wav.py")
    f = features(struct_wav)
    drops = truth(struct_wav, "drops")
    steps = f["t"][1:][np.diff(f["drops"]) > 0]
    now["counts"]["drops_seen"] = sum(1 for d in drops if any(d - 0.2 <= s <= d + 1.875 for s in steps))
    now["counts"]["drops_total"] = len(drops)
    now["counts"]["drops_false"] = sum(1 for s in steps if not any(d - 0.2 <= s <= d + 1.875 for d in drops))
    bpm = f["bpm"][(f["t"] >= 16.0) & (f["bpm"] > 0)]
    now["counts"]["bpm_128_median"] = round(float(np.median(bpm)), 1) if bpm.size else 0.0
    now["stats"]["structure128"] = stats(f, 16.0)

    bb = os.path.join(ROOT, "Tools", "broadband120.wav")
    f = features(bb)
    bpm = f["bpm"][(f["t"] >= 8.0) & (f["bpm"] > 0)]
    now["counts"]["bpm_120_median"] = round(float(np.median(bpm)), 1) if bpm.size else 0.0
    now["stats"]["broadband120"] = stats(f, 8.0)

    c = now["counts"]
    print("chord changes seen  %d of %d, %d false alarm(s)" % (c["chord_changes_seen"], c["chord_changes_total"],
                                                               c["chord_false_alarms"]))
    print("drops seen          %d of %d, %d false" % (c["drops_seen"], c["drops_total"], c["drops_false"]))
    print("tempo               %.1f BPM (128), %.1f BPM (120)" % (c["bpm_128_median"], c["bpm_120_median"]))

    if a.update or not os.path.exists(BASELINE):
        io.open(BASELINE, "w", encoding="utf-8").write(json.dumps(now, indent=1, sort_keys=True) + "\n")
        print("baseline written: %s" % BASELINE)
        return 0

    base = json.load(io.open(BASELINE, encoding="utf-8"))
    bad = []
    bc = base["counts"]
    for k in ("chord_changes_seen", "drops_seen"):
        if c[k] < bc.get(k, 0):
            bad.append("%s %d < %d" % (k, c[k], bc[k]))
    for k in ("chord_false_alarms", "drops_false"):
        if c[k] > bc.get(k, 0):
            bad.append("%s %d > %d" % (k, c[k], bc[k]))
    for k, want in (("bpm_128_median", 128.0), ("bpm_120_median", 120.0)):
        if abs(c[k] - want) > 2.0:
            bad.append("%s %.1f, not %g +-2" % (k, c[k], want))
    for track, feats in now["stats"].items():
        for name, s in feats.items():
            b = base["stats"].get(track, {}).get(name)
            if b is None:
                continue
            if b["moves"] and not s["moves"]:
                bad.append("%s: %s no longer moves" % (track, name))
            for q in ("mean", "p90"):
                if abs(s[q] - b[q]) > TOL * max(1.0, abs(b[q])):
                    bad.append("%s: %s %s %.4f, was %.4f" % (track, name, q, s[q], b[q]))
    for b in bad:
        print("  CHANGED  " + b)
    print("analyzer: %s" % ("as the baseline" if not bad else "%d difference(s) -- look, then --update" % len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
