# -*- coding: utf-8 -*-
"""beat_vs_cues.py -- the analyser's beats against the beats the generators wrote down.  Nothing is changed.

The tempo can be right while the beats fall between the real ones; what a beat-synchronous picture needs is the
phase.  For every demo of the set (the score cues' `/phos/beat`), three kinds of estimated beats are scored:

  kicks   the analyser's beat detections (AudioFeatures::isBeat; the trace's kick flag) -- an event detector
  phase   the wraps of the analyser's beatPhase (it restarts at every kick and runs at the tempo in between)
  pll     the wraps of the conditioner's beat phase (AudioConditioner's PLL) -- what the shaders animate with

with the usual measures (Davies, Degara & Plumley 2009, "Evaluation Methods for Musical Audio Beat Tracking
Algorithms"; the definitions follow mir_eval.beat):

  F       F-measure, a beat within +-70 ms of an annotation
  CMLt    share of beats correct at the annotated metrical level (phase and period within 17.5 % of the interval)
  AMLt    the same, also allowing the off-beat, double and half tempo (the best of the five variations)

and "hold": for annotated beats inside a stretch of at least 8 s without a kick detection, the share where the
pll phase is within an eighth of a beat of the annotation (phase 0 at the beat; a constant lead of the PLL is
measured and taken out first, per demo, from the beats where kicks are present).

    python Tools/beat_vs_cues.py @Tools/analyser_cue_set.txt
    python Tools/beat_vs_cues.py --detail @Tools/analyser_cue_set.txt

Only time after the first 12 s counts (as in Tools/tempo_vs_cues.py).  The inputs are Tools/tempo_lab.py's
recordings in .screen/beatbench (made when missing or older than the editor).
"""
import argparse
import csv
import io
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyser_vs_cues as avc   # noqa: E402
import tempo_lab as lab          # noqa: E402
import tempo_vs_cues as tvc      # noqa: E402

WARM = 12.0
F_WIN = 0.07
HOLD_GAP = 8.0


def f_measure(ref, est, win=F_WIN):
    """F-measure: each annotation matched to at most one estimated beat within +-win."""
    if len(ref) == 0 or len(est) == 0:
        return 0.0
    used = np.zeros(len(est), dtype=bool)
    hits = 0
    for r in ref:
        d = np.abs(est - r)
        d[used] = np.inf
        j = int(np.argmin(d))
        if d[j] <= win:
            used[j] = True
            hits += 1
    p, rc = hits / len(est), hits / len(ref)
    return 0.0 if p + rc == 0 else 2 * p * rc / (p + rc)


def _variations(ref):
    """The annotated level, the off-beat, double tempo, half tempo odd and even (mir_eval)."""
    idx = np.arange(0, len(ref) - 0.5, 0.5)
    double = np.interp(idx, np.arange(len(ref)), ref)
    return ref, double[1::2], double, ref[::2], ref[1::2]


def _continuity_one(ref, est, ph_thr=0.175, per_thr=0.175):
    """Total and continuous accuracy against one variation of the annotations (mir_eval.beat.continuity)."""
    n = max(len(ref), len(est))
    used = np.zeros(len(ref))
    ok = np.zeros(n)
    for m in range(len(est)):
        d = np.abs(est[m] - ref)
        k = int(np.argmin(d))
        if used[k]:
            continue
        if m == 0 or k == 0:
            ri = ref[k + 1] - ref[k] if k + 1 < len(ref) else ref[k] - ref[k - 1]
            ei = est[m + 1] - est[m] if m + 1 < len(est) else est[m] - est[m - 1]
        else:
            ri = ref[k] - ref[k - 1]
            ei = est[m] - est[m - 1]
        if ri <= 0:
            continue
        if abs(d[k] / ri) < ph_thr and abs(1.0 - ei / ri) < per_thr:
            used[k] = 1
            ok[m] = 1
    fails = np.nonzero(np.concatenate(([0], ok, [0])) == 0)[0]
    longest = int(np.max(np.diff(fails))) - 1
    return ok.sum() / n, longest / n


def continuity(ref, est):
    """(CMLt, AMLt)."""
    if len(ref) < 2 or len(est) < 2:
        return 0.0, 0.0
    tot = [_continuity_one(v, est)[0] for v in _variations(ref) if len(v) >= 2]
    return tot[0], max(tot)


def wraps(t, phase):
    """The times a phase in [0, 1) wraps (interpolated between the blocks)."""
    w = np.nonzero(phase[1:] < phase[:-1] - 0.5)[0]
    out = []
    for i in w:
        a, b = phase[i], phase[i + 1] + 1.0
        f = (1.0 - a) / max(b - a, 1e-6)
        out.append(t[i] + f * (t[i + 1] - t[i]))
    return np.array(out)


def phase_at(t, phase, when):
    """The (unwrapped-interpolated) phase at the given times."""
    un = np.unwrap(phase * 2 * np.pi) / (2 * np.pi)
    return np.interp(when, t, un) % 1.0


def demo(cue, wav):
    """The scores of one demo, or None."""
    ref = np.array(tvc.beats_of(cue))
    if len(ref) < 8:
        return None
    got = lab.bench(cue, wav)
    if not got:
        return None
    key, feat, trace = got
    tr = lab.load_trace(trace)
    rows = list(csv.DictReader(io.open(feat, encoding="utf-8")))
    t = np.array([float(r["t"]) for r in rows])
    ph_raw = np.array([float(r["beat_phase"]) for r in rows])
    ph_pll = np.array([float(r["beat_phase_c"]) for r in rows])
    tk = np.arange(len(tr)) * lab.BLOCK
    kicks = tk[tr[:, lab.ISBEAT] > 0.5]
    ref = ref[ref >= WARM]
    est = {"kicks": kicks, "phase": wraps(t, ph_raw), "pll": wraps(t, ph_pll)}
    out = {"key": key, "n": len(ref)}
    for name, e in est.items():
        e = e[e >= WARM]
        out[name] = (f_measure(ref, e),) + continuity(ref, e)
    # hold: annotated beats in stretches of >= 8 s without a kick
    kick_all = kicks
    gap_beats = []
    for r in ref:
        j = np.searchsorted(kick_all, r)
        prev_k = kick_all[j - 1] if j > 0 else -1e9
        nxt_k = kick_all[j] if j < len(kick_all) else 1e9
        if nxt_k - prev_k >= HOLD_GAP and r - prev_k >= 2.0:
            gap_beats.append(r)
    near = [r for r in ref if np.min(np.abs(kick_all - r)) < 0.07] if len(kick_all) else []
    lead = 0.0
    if len(near) >= 8:
        e = phase_at(t, ph_pll, np.array(near))
        lead = float(np.angle(np.mean(np.exp(2j * np.pi * e))) / (2 * np.pi))
    if gap_beats:
        e = phase_at(t, ph_pll, np.array(gap_beats)) - lead
        e = (e + 0.5) % 1.0 - 0.5
        out["hold"] = (len(gap_beats), float(np.mean(np.abs(e) < 0.125)))
    out["lead"] = lead
    return out


def main():
    """Scores the set and prints the table."""
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--detail", action="store_true")
    ap.add_argument("sets", nargs="*")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    res = [r for r in (demo(c, w) for c, w in avc.find_pairs(a.sets)) if r]
    names = ("kicks", "phase", "pll")
    if a.detail:
        print("%-44s %5s  %s  %s" % ("demo", "beats", "  ".join("%-17s" % n for n in names), "hold (beats, ok)"))
        for r in res:
            print("%-44s %5d  %s  %s" % (r["key"][:44], r["n"], "  ".join("F%3.0f C%3.0f A%3.0f   " % tuple(100 * x for x in r[n])
                                                                         for n in names),
                                       ("%4d %3.0f %%" % (r["hold"][0], 100 * r["hold"][1])) if "hold" in r else "-"))
    w = np.array([r["n"] for r in res], dtype=float)
    print("%d demos, %d annotated beats after %g s (means weighted by beats)" % (len(res), int(w.sum()), WARM))
    print("%-6s %6s %6s %6s" % ("", "F", "CMLt", "AMLt"))
    for n in names:
        m = np.array([r[n] for r in res])
        avg = (m * w[:, None]).sum(0) / w.sum()
        print("%-6s %5.1f%% %5.1f%% %5.1f%%" % ((n,) + tuple(100 * avg)))
    hold = [r["hold"] for r in res if "hold" in r]
    if hold:
        nb = sum(h[0] for h in hold)
        ok = sum(h[0] * h[1] for h in hold)
        print("hold: %d beats in %d demos inside stretches of >= %g s without a kick; pll within 1/8 beat: %.0f %%"
              % (nb, len(hold), HOLD_GAP, 100.0 * ok / max(nb, 1)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
