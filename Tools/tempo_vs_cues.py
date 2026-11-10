# -*- coding: utf-8 -*-
"""The analyser's tempo against the beats the generators wrote down: how much of the time it is right, and how it is wrong.

    python Tools/tempo_vs_cues.py @Tools/analyser_cue_set.txt      # the frozen set of 43 demos
    python Tools/tempo_vs_cues.py --detail @Tools/analyser_cue_set.txt
    python Tools/tempo_vs_cues.py DIR_OR_CUES_FILE ...

The score cues of a demo (`<name>.cues.tsv`) hold every beat (`/phos/beat`).  The reference tempo at a moment is 60 over
the median interval of the beats within 4 s around it; where fewer than four beats lie there, the music has no pulse
and the moment does not count.  The analyser's tempo is the `bpm` column of `PresetEditor --features` (every 50 ms; the
feature files of Tools/analyser_vs_cues.py in .screen/cuebench are used and made when missing).  After the first 12 s:

  strict   within 4 % of the reference -- what a beat-synchronous motion needs
  folded   within 4 % after both are folded by octaves into 70..180 -- the number docs/engine-internals.md (62) reports
  and the wrong time by the ratio analyser / reference: double, half, 3:2, 2:3, 4:3, 3:4, none (no tempo), other

by tempo range of the reference, because slow music fails differently from fast music.  Nothing is changed.
"""
import bisect
import csv
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyser_vs_cues as avc

WARM = 12.0
TOL = 0.04
RATIOS = (("double", 2.0), ("half", 0.5), ("3:2", 1.5), ("2:3", 2.0 / 3.0), ("4:3", 4.0 / 3.0), ("3:4", 0.75))
BANDS = (("under 90", 0.0, 90.0), ("90 to 135", 90.0, 135.0), ("over 135", 135.0, 1e9))


def beats_of(cue_file):
    """The beat times of a cue file.

    @param cue_file  The `.cues.tsv` file. (in)

    @return
      The sorted beat times in seconds.
    """
    out = []
    for ln in io.open(cue_file, encoding="utf-8", errors="replace"):
        v = ln.rstrip("\n").split("\t")
        if len(v) >= 2 and v[1] == "/phos/beat":
            try:
                out.append(float(v[0]))
            except ValueError:
                pass
    return sorted(out)


def reference(beats, t):
    """The tempo the beats around a moment give.

    @param beats  The sorted beat times. (in)
    @param t      The moment in seconds. (in)

    @return
      Beats per minute, or 0 where fewer than four beats lie within 4 s.
    """
    a = bisect.bisect_left(beats, t - 4.0)
    b = bisect.bisect_right(beats, t + 4.0)
    if b - a < 4:
        return 0.0
    gaps = sorted(beats[i + 1] - beats[i] for i in range(a, b - 1))
    med = gaps[len(gaps) // 2]
    return 60.0 / med if med > 1e-3 else 0.0


def fold(bpm):
    """A tempo folded by octaves into 70..180.

    @param bpm  The tempo. (in)

    @return
      The folded tempo (0 stays 0).
    """
    if bpm <= 0.0:
        return 0.0
    while bpm < 70.0:
        bpm *= 2.0
    while bpm >= 180.0:
        bpm *= 0.5
    return bpm


def classify(bpm, ref):
    """How an analyser tempo relates to the reference.

    @param bpm  The analyser's tempo. (in)
    @param ref  The reference tempo. (in)

    @return
      "right", one of the ratio names, "none" or "other".
    """
    if bpm <= 0.0:
        return "none"
    r = bpm / ref
    if abs(r - 1.0) <= TOL:
        return "right"
    for name, q in RATIOS:
        if abs(r / q - 1.0) <= TOL:
            return name
    return "other"


def main():
    """Evaluates the set and prints the table.

    @return
      The process exit code.
    """
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    detail = "--detail" in sys.argv
    pairs = avc.find_pairs(args)
    total = {}
    folded_ok = 0
    count = 0
    for cue_file, wav in pairs:
        beats = beats_of(cue_file)
        if len(beats) < 8:
            continue
        avc.analyse(wav)                              # makes the feature file when it is missing or older than the editor
        feat = os.path.join(avc.CACHE, "%s_%s.csv" % (os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(wav)))),
                                                      os.path.splitext(os.path.basename(wav))[0]))
        if not os.path.exists(feat):
            continue
        per = {}
        fok = n = 0
        for row in csv.DictReader(io.open(feat, encoding="utf-8", errors="replace")):
            try:
                t = float(row["t"])
                bpm = float(row["bpm"])
            except (KeyError, ValueError):
                continue
            if t < WARM:
                continue
            ref = reference(beats, t)
            if ref <= 0.0:
                continue
            kind = classify(bpm, ref)
            band = next(b[0] for b in BANDS if b[1] <= ref < b[2])
            per[(band, kind)] = per.get((band, kind), 0) + 1
            n += 1
            fok += bpm > 0.0 and abs(fold(bpm) / fold(ref) - 1.0) <= TOL
        if not n:
            continue
        for k, v in per.items():
            total[k] = total.get(k, 0) + v
        folded_ok += fok
        count += n
        if detail:
            right = sum(v for (b, k), v in per.items() if k == "right")
            worst = sorted(((v, k) for (b, k), v in per.items() if k != "right"), reverse=True)[:2]
            print("%-52s strict %3.0f %%  folded %3.0f %%  %s" % (os.path.basename(wav)[:52], 100.0 * right / n, 100.0 * fok / n,
                  ", ".join("%s %.0f %%" % (k, 100.0 * v / n) for v, k in worst)))
    if not count:
        print("no rhythmic time measured")
        return 1
    kinds = ["right"] + [r[0] for r in RATIOS] + ["none", "other"]
    print("%d tracks, %.0f min of rhythmic time; folded into 70..180: %.0f %% right" % (len(pairs), count * 0.05 / 60.0, 100.0 * folded_ok / count))
    print("%-10s %7s  %s" % ("reference", "share", "  ".join("%6s" % k for k in kinds)))
    for band in [b[0] for b in BANDS] + ["all"]:
        row = {k: sum(v for (b, kk), v in total.items() if kk == k and (band == "all" or b == band)) for k in kinds}
        n = sum(row.values())
        if n:
            print("%-10s %6.0f %%  %s" % (band, 100.0 * n / count, "  ".join("%5.0f%%" % (100.0 * row[k] / n) for k in kinds)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
