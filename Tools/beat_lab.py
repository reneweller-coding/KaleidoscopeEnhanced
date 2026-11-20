# -*- coding: utf-8 -*-
"""beat_lab.py -- beat-phase methods replayed on the analyser's recorded inputs, scored like Tools/beat_vs_cues.py.

The shaders animate with the conditioner's beat phase: a PLL (AudioConditioner) that runs at the published tempo and
is pulled toward the analyser's beatPhase.  This script replays a method that makes the analyser's phase from the
recorded onset envelope, the published tempo and the kicks (the traces of Tools/tempo_lab.py), runs the same PLL in
Python, and scores the result against the generators' beats:

    python Tools/beat_lab.py @Tools/analyser_cue_set.txt                   # the C++ build's own phase ("trace")
    python Tools/beat_lab.py --method current @Tools/analyser_cue_set.txt   # the beat tracker in the code, ported
    python Tools/beat_lab.py --check @Tools/analyser_cue_set.txt           # the PLL model against the C++ column

Methods: "trace" (the analyser's recorded phase), "kick" (its rule in Python: the phase restarts at every kick and
runs at the tempo in between), "btrack" (a cumulative score of the onset envelope and a predicted next beat, after
Stark, Davies & Plumley 2009, "Real-Time Beat-Synchronous Analysis of Musical Audio", the BTrack algorithm).
"""
import argparse
import csv
import io
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyser_vs_cues as avc   # noqa: E402
import beat_vs_cues as bvc       # noqa: E402
import tempo_lab as lab          # noqa: E402
import tempo_vs_cues as tvc      # noqa: E402

DT = lab.BLOCK


def pll(phase, bpm, gate):
    """AudioConditioner's beat-phase PLL: runs at the tempo, pulled toward the analyser's phase, gated.

    @param phase  The analyser's beat phase per block. (in)
    @param bpm    The published tempo per block (0 = none). (in)
    @param gate   The conditioner's music gate per block. (in)

    @return
      The PLL phase per block.
    """
    out = np.zeros(len(phase))
    p = 0.0
    corr = min(2.0 * DT, 0.3)
    for i in range(len(phase)):
        est = max(0.0, min((bpm[i] - 40.0) / 160.0, 1.0)) if bpm[i] > 0 else 0.0
        rate = (40.0 + 160.0 * est) / 60.0 if est > 0.004 else 0.0
        err = phase[i] - p
        err -= math.floor(err + 0.5)
        p += (DT * rate + err * corr) * gate[i]
        p -= math.floor(p)
        out[i] = p
    return out


def kick_phase(tr, bpm):
    """The analyser's rule: the phase restarts at every kick and runs at the tempo in between."""
    out = np.zeros(len(tr))
    since = 1e9
    for i in range(len(tr)):
        if tr[i, lab.ISBEAT] > 0.5:
            since = 0.0
        else:
            since += DT
        if bpm[i] > 1.0:
            ph = since * bpm[i] / 60.0
            out[i] = ph - math.floor(ph)
    return out


class BTrack:
    """Cumulative score and beat prediction after Stark, Davies & Plumley (2009), on the SuperFlux envelope at
    100 Hz with the tempo the TempoTracker publishes.

    C(m) = (1 - ALPHA) O(m) + ALPHA max_{v in [-2 tau, -tau/2]} W1(v) C(m + v), W1 a log-Gaussian around -tau
    (TIGHT).  Half a beat after a beat the next one is predicted: C is continued one period into the future without
    onsets and weighted by a Gaussian around tau/2 after the prediction point; its maximum is the next beat.  The
    phase is the time since the last beat over the period.  Without a tempo the phase stays the kick rule's.
    """

    ALPHA = 0.9
    TIGHT = 5.0
    HIST = 512
    KICK_W = 0.0      # a detected kick adds this much (times the envelope's running mean) to the onset function
    HALFWAY = False   # predict half a beat after a beat (BTrack); False: right after it
    LEAD = 0          # blocks the phase is moved ahead (detection delay)

    def run(self, tr, bpm):
        out = self._run(tr, bpm)
        if self.LEAD:
            out = (out + self.LEAD * bpm / 6000.0) % 1.0
        return out

    def _run(self, tr, bpm):
        n = len(tr)
        out = np.zeros(n)
        cs = np.zeros(self.HIST)
        last_beat = -1e9
        countdown = None        # blocks until the predicted beat
        to_predict = None       # blocks until the next prediction
        since_kick = 1e9
        avg = 1e-3
        for i in range(n):
            o = tr[i, lab.E0] if tr[i, lab.NENV] >= 1 else 0.0
            avg = 0.995 * avg + 0.005 * o
            if self.KICK_W and tr[i, lab.ISBEAT] > 0.5:
                o += self.KICK_W * avg
            since_kick = 0.0 if tr[i, lab.ISBEAT] > 0.5 else since_kick + DT
            if bpm[i] < 1.0:
                ph = 0.0
                out[i] = 0.0
                cs = np.roll(cs, -1)
                cs[-1] = (1 - self.ALPHA) * o
                countdown = to_predict = None
                continue
            tau = 100.0 * 60.0 / bpm[i]
            # cumulative score
            lo, hi = int(round(2 * tau)), int(round(tau / 2))
            v = -np.arange(lo, hi - 1, -1, dtype=float)                 # -2tau .. -tau/2
            w1 = np.exp(-0.5 * (self.TIGHT * np.log(-v / tau)) ** 2)
            past = cs[self.HIST - lo:self.HIST - hi + 1]
            c = (1 - self.ALPHA) * o + self.ALPHA * float(np.max(past * w1)) if len(past) == len(w1) else o
            cs = np.roll(cs, -1)
            cs[-1] = c
            if countdown is None and (to_predict is None or not self.HALFWAY):
                to_predict = 0
            if to_predict is not None:
                if to_predict <= 0:
                    countdown = self.predict(cs, tau)
                    to_predict = None
                else:
                    to_predict -= 1
            if countdown is not None:
                if countdown <= 0:
                    last_beat = i * DT
                    countdown = None
                    to_predict = int(round(tau / 2))
                else:
                    countdown -= 1
            ph = (i * DT - last_beat) * bpm[i] / 60.0
            out[i] = ph - math.floor(ph) if last_beat > -1e8 else 0.0
        return out

    def predict(self, cs, tau):
        """Blocks from now to the predicted beat."""
        win = max(1, int(tau))
        lo, hi = int(round(2 * tau)), int(round(tau / 2))
        v = -np.arange(lo, hi - 1, -1, dtype=float)
        w1 = np.exp(-0.5 * (self.TIGHT * np.log(-v / tau)) ** 2)
        fut = np.concatenate([cs, np.zeros(win)])
        for j in range(self.HIST, self.HIST + win):
            past = fut[j - lo:j - hi + 1]
            fut[j] = float(np.max(past * w1))
        w2 = np.exp(-((np.arange(1, win + 1) - tau / 2) ** 2) / (2 * (tau / 2) ** 2))
        return int(np.argmax(fut[self.HIST:] * w2))


# "current" is the beat tracker in Source/TempoTracker.cpp (BTrack with the paper's constants); the rest is what was
# tried on 20.11.2026 (the first ones predicted right after a beat instead of half a beat later -- a slip, see section 67).
VARIANTS = {"current": {"HALFWAY": True}, "btrack": {}, "btrack_kick2": {"KICK_W": 2.0}, "btrack_kick5": {"KICK_W": 5.0},
            "btrack_lead2": {"LEAD": 2}, "btrack_lead4": {"LEAD": 4}, "btrack_kick5_lead2": {"KICK_W": 5.0, "LEAD": 2},
            "btrack_a8": {"ALPHA": 0.8}, "btrack_t3": {"TIGHT": 3.0},
            "btrack_t3_lead4": {"TIGHT": 3.0, "LEAD": 4}, "btrack_t2_lead4": {"TIGHT": 2.0, "LEAD": 4},
            "btrack_t3_lead6": {"TIGHT": 3.0, "LEAD": 6},
            "btrack_t2_lead6": {"TIGHT": 2.0, "LEAD": 6}, "btrack_t15_lead6": {"TIGHT": 1.5, "LEAD": 6},
            "btrack_t2_lead8": {"TIGHT": 2.0, "LEAD": 8}, "btrack_t2_lead10": {"TIGHT": 2.0, "LEAD": 10},
            "btrack_t2_lead12": {"TIGHT": 2.0, "LEAD": 12},
            "bt_half_t2_lead0": {"TIGHT": 2.0, "HALFWAY": True}, "bt_half_t2_lead4": {"TIGHT": 2.0, "LEAD": 4, "HALFWAY": True},
            "bt_half_t2_lead8": {"TIGHT": 2.0, "LEAD": 8, "HALFWAY": True}, "bt_half_t5_lead4": {"TIGHT": 5.0, "LEAD": 4, "HALFWAY": True},
            "bt_half_t5": {"TIGHT": 5.0, "HALFWAY": True}, "bt_half_t3": {"TIGHT": 3.0, "HALFWAY": True}, "btrack_t2_lead5": {"TIGHT": 2.0, "LEAD": 5}}
METHODS = ("trace", "kick", "kick_lead4", "kick_lead8") + tuple(VARIANTS)


def phase_of(method, tr, rows):
    """The analyser phase a method makes from a trace (rows: the feature csv)."""
    bpm = np.where(tr[:, lab.BPM] > 40.64, tr[:, lab.BPM], 0.0)
    if method == "trace":
        return np.array([float(r["beat_phase"]) for r in rows])
    if method == "kick":
        return kick_phase(tr, bpm)
    if method.startswith("kick_lead"):
        return (kick_phase(tr, bpm) + int(method[9:]) * bpm / 6000.0) % 1.0
    if method in VARIANTS:
        return type(method, (BTrack,), VARIANTS[method])().run(tr, bpm)
    raise SystemExit("unknown method " + method)


def demo(job):
    """Scores one demo: (key, n, {name: (F, CMLt, AMLt)}, hold, pll-model error)."""
    method, cue, wav, check = job
    ref = np.array(tvc.beats_of(cue))
    key, feat, trace = lab.bench(cue, wav)
    tr = lab.load_trace(trace)
    rows = list(csv.DictReader(io.open(feat, encoding="utf-8")))
    t = np.array([float(r["t"]) for r in rows])
    gate = np.array([float(r["gate"]) for r in rows])
    bpm = np.where(tr[:, lab.BPM] > 40.64, tr[:, lab.BPM], 0.0)
    aph = phase_of(method, tr, rows)
    pph = pll(aph, bpm, gate)
    err = None
    if check:
        c = np.array([float(r["beat_phase_c"]) for r in rows])
        d = (pph - c + 0.5) % 1.0 - 0.5
        err = float(np.mean(np.abs(d) > 0.01))
    kicks = np.arange(len(tr))[tr[:, lab.ISBEAT] > 0.5] * DT
    ref = ref[ref >= bvc.WARM]
    res = {}
    for name, ph in (("phase", aph), ("pll", pph)):
        e = bvc.wraps(t, ph)
        e = e[e >= bvc.WARM]
        res[name] = (bvc.f_measure(ref, e),) + bvc.continuity(ref, e)
    gap = [r for r in ref if (lambda j: (kicks[j] if j < len(kicks) else 1e9) - (kicks[j - 1] if j > 0 else -1e9) >= bvc.HOLD_GAP
                              and r - (kicks[j - 1] if j > 0 else -1e9) >= 2.0)(np.searchsorted(kicks, r))]
    hold = None
    if gap:
        near = [r for r in ref if len(kicks) and np.min(np.abs(kicks - r)) < 0.07]
        lead = 0.0
        if len(near) >= 8:
            e0 = bvc.phase_at(t, pph, np.array(near))
            lead = float(np.angle(np.mean(np.exp(2j * np.pi * e0))) / (2 * np.pi))
        e = (bvc.phase_at(t, pph, np.array(gap)) - lead + 0.5) % 1.0 - 0.5
        hold = (len(gap), float(np.mean(np.abs(e) < 0.125)))
    return key, len(ref), res, hold, err


def main():
    """Scores a method on the set."""
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--method", default="trace", choices=METHODS)
    ap.add_argument("--check", action="store_true", help="the PLL model against the C++ beat_phase_c column")
    ap.add_argument("--detail", action="store_true")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("sets", nargs="*")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    jobs = [(a.method, c, w, a.check) for c, w in avc.find_pairs(a.sets) if len(tvc.beats_of(c)) >= 8]
    for _, c, w, _ in jobs:
        lab.bench(c, w)
    if a.jobs > 1:
        import multiprocessing
        with multiprocessing.Pool(a.jobs, initializer=lab._below_normal) as pool:
            res = pool.map(demo, jobs)
    else:
        res = [demo(j) for j in jobs]
    w = np.array([r[1] for r in res], dtype=float)
    if a.detail:
        for key, n, sc, hold, err in res:
            print("%-44s %5d  phase F%3.0f C%3.0f A%3.0f   pll F%3.0f C%3.0f A%3.0f   hold %s" % (
                key[:44], n, *(100 * np.array(sc["phase"])), *(100 * np.array(sc["pll"])),
                ("%4d %3.0f %%" % (hold[0], 100 * hold[1])) if hold else "-"))
    print("%s: %d demos, %d beats" % (a.method, len(res), int(w.sum())))
    for name in ("phase", "pll"):
        m = np.array([r[2][name] for r in res])
        avg = (m * w[:, None]).sum(0) / w.sum()
        print("%-6s F %5.1f%%  CMLt %5.1f%%  AMLt %5.1f%%" % ((name,) + tuple(100 * avg)))
    holds = [r[3] for r in res if r[3]]
    nb = sum(h[0] for h in holds)
    print("hold: %d beats in %d demos; pll within 1/8 beat: %.0f %%" % (nb, len(holds),
                                                                        100.0 * sum(h[0] * h[1] for h in holds) / max(nb, 1)))
    if a.check:
        errs = [r[4] for r in res]
        print("PLL model against the C++ column: blocks off by > 0.01 turn: median %.2f %%, worst %.2f %%"
              % (100 * np.median(errs), 100 * max(errs)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
