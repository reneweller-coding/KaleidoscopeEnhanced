# -*- coding: utf-8 -*-
"""tempo_lab.py -- tempo methods replayed on the analyser's recorded inputs, scored against the generators' beats.

A change to the tempo in Source/AudioAnalyzer.cpp costs a build and a pass over the 43 demos (minutes); a method
written here costs seconds.  `PresetEditor --features ... --tempo-trace FILE` records, for every 10-ms block, what
the tempo sees (the SuperFlux onset-envelope samples, the kicks and their intervals, track changes) and what it
published (AudioAnalyzer::M_TempoTrace, 14 float32 per block).  This script replays those inputs through a method
in Python and scores the result exactly like Tools/tempo_vs_cues.py (strict = within 4 % of the reference, the
median beat interval of the cues within 4 s; folded into 70..180; by tempo range; every 50 ms after the first 12 s).

    python Tools/tempo_lab.py @Tools/analyser_cue_set.txt                  # today's method, ported ("current")
    python Tools/tempo_lab.py --method current --check @Tools/analyser_cue_set.txt   # the port against the C++ trace
    python Tools/tempo_lab.py --method NAME --detail @Tools/analyser_cue_set.txt

The recordings live in .screen/beatbench/<key>.trace (and <key>.csv, every block, with the beat phase columns);
they are made when missing or older than the editor.  The PCM copies of the demos are the ones
Tools/analyser_vs_cues.py keeps in .screen/cuebench.  A method is a class with run(trace) -> published BPM per block
(0 = no tempo), registered in METHODS.
"""
import argparse
import io
import math
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyser_vs_cues as avc   # noqa: E402
import tempo_vs_cues as tvc      # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BENCH = os.path.join(ROOT, ".screen", "beatbench")
EDITOR = avc.EDITOR
REC = 14
# Columns of a trace record (AudioAnalyzer.cpp, "for replaying tempo candidates offline").
T, NENV, E0, E1, E2, ISBEAT, BEATIV, TRACK, ACBPM, ACCONF, BPM, PHASE, KICKBPM, EXPL = range(REC)
BLOCK = 0.01          # 480 samples at 48 kHz: the PCM copies are 48 kHz
EVERY = 5             # tempo_vs_cues reads the --every 5 feature rows


def bench(cue, wav):
    """The recorded inputs of one demo, made when missing or older than the editor.

    @param cue  The demo's .cues.tsv. (in)
    @param wav  The demo's WAV. (in)

    @return
      (key, feature csv, trace) paths, or None when the PCM copy is missing and cannot be made.
    """
    os.makedirs(BENCH, exist_ok=True)
    key = "%s_%s" % (os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(wav)))),
                     os.path.splitext(os.path.basename(wav))[0])
    pcm = os.path.join(avc.CACHE, key + ".wav")
    csv = os.path.join(BENCH, key + ".csv")
    trace = os.path.join(BENCH, key + ".trace")
    if not os.path.exists(pcm):
        os.makedirs(avc.CACHE, exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ar", "48000", "-c:a", "pcm_s16le", pcm], check=True)
    stale = lambda p: not os.path.exists(p) or os.path.getmtime(p) < os.path.getmtime(EDITOR)
    if stale(csv) or stale(trace):
        env = dict(os.environ, PATH=avc.QT_BIN + os.pathsep + os.environ.get("PATH", ""))
        subprocess.run([EDITOR, "--features", pcm, csv, "--every", "1", "--tempo-trace", trace],
                       cwd=os.path.dirname(EDITOR), env=env, capture_output=True, check=True,
                       creationflags=0x00004000 if os.name == "nt" else 0)   # below normal priority
    return key, csv, trace


def load_trace(path):
    """A trace as an (n, 14) float64 array."""
    return np.fromfile(path, dtype="<f4").reshape(-1, REC).astype(np.float64)


def fold(bpm):
    """A tempo folded by octaves into 70..180 (AudioAnalyzer's fold_bpm); below 1 stays."""
    if bpm < 1.0:
        return bpm
    while bpm < 70.0:
        bpm *= 2.0
    while bpm >= 180.0:
        bpm *= 0.5
    return bpm


class Kicks:
    """The kick-interval part of the analyser: the ring of intervals and ioiPeriod()."""

    IOI_LEN = 12
    MULT = (1.0, 1.5, 2.0, 2.5, 3.0, 4.0)

    def __init__(self):
        self.ioi = [0.0] * self.IOI_LEN
        self.idx = 0
        self.count = 0
        self.explained = 0.0
        self.bpm = 0.0

    def period(self, prev_period):
        """AudioAnalyzer::ioiPeriod: the period that explains the recent intervals as multiples."""
        self.explained = 0.0
        if self.count < 3:
            return 0.0
        p_lo, p_hi = 60.0 / 180.0, 60.0 / 70.0
        best, best_score, best_share = 0.0, -1.0, 0.0
        ioi = self.ioi[:self.count]
        for x in ioi:
            for n in self.MULT:
                p = x / n
                if p < p_lo or p > p_hi:
                    continue
                hits, simple, num, den = 0, 0.0, 0.0, 0.0
                for y in ioi:
                    err, m_best = 1e9, 1.0
                    for m in self.MULT:
                        if abs(y - m * p) < err:
                            err = abs(y - m * p)
                            m_best = m
                    if err < 0.03 + 0.04 * y:
                        hits += 1
                        simple += 1.0 / m_best
                        num += y * m_best
                        den += m_best * m_best
                cont = 0.6 if prev_period > 0.0 and abs(p - prev_period) < 0.03 * prev_period else 0.0
                score = hits + 0.3 * simple / self.count + cont
                if score > best_score and den > 0.0:
                    best_score = score
                    best = min(max(num / den, p_lo), p_hi)
                    best_share = hits / self.count
        self.explained = best_share
        return best

    def beat(self, iv, smoothed):
        """A kick with its interval; returns the kick tempo when it gives one (else 0)."""
        if not (0.12 < iv < 3.0):
            return 0.0
        self.ioi[self.idx] = iv
        self.idx = (self.idx + 1) % self.IOI_LEN
        self.count = min(self.count + 1, self.IOI_LEN)
        per = self.period(60.0 / smoothed if smoothed > 1.0 else 0.0)
        if per > 0.0:
            self.bpm = 60.0 / per
            return self.bpm
        return 0.0


class Current:
    """Today's method (10.11.2026), ported: autocorrelation of the last 4 s of SuperFlux every 100 ms under a
    log-Gaussian prior around 120 BPM, gated by peak, prominence and kurtosis; the kicks set the tempo only until
    the autocorrelation has one, and decide only a clean 3:2."""

    ENV_RATE = 100
    ENV_LEN = 400
    AC_EVERY = 10
    PRIOR_OCT = 1.0

    def __init__(self):
        self.ring = np.zeros(self.ENV_LEN)
        self.widx = 0
        self.block = 0
        self.rival = 0
        self.ac_bpm = 0.0
        self.ac_conf = 0.0
        self.smoothed = 0.0
        self.kicks = Kicks()
        self.lag_lo = (60 * self.ENV_RATE) // 180
        self.lag_hi = (60 * self.ENV_RATE) // 70
        lags = np.arange(self.lag_lo, self.lag_hi + 1)
        octs = np.log2(60.0 * self.ENV_RATE / (120.0 * lags)) / self.PRIOR_OCT
        self.prior = np.exp(-0.5 * octs * octs)

    def push(self, rec):
        """The block's onset-envelope samples into the ring."""
        for k in range(int(rec[NENV])):
            self.ring[self.widx] = rec[E0 + k]
            self.widx = (self.widx + 1) % self.ENV_LEN

    def autocorrelate(self):
        """One evaluation of the autocorrelation (AudioAnalyzer.cpp, "The tempo autocorrelation runs on ...")."""
        env = np.roll(self.ring, -self.widx)
        env = env - env.mean()
        var = 1e-9 + float(np.dot(env, env))
        kurt = float(np.sum(env ** 4)) * self.ENV_LEN / (var * var)
        lo, hi = self.lag_lo, self.lag_hi
        ac = np.array([float(np.dot(env[:self.ENV_LEN - lag], env[lag:])) / var for lag in range(lo - 1, hi + 2)])
        core = ac[1:-1]
        peak = max(0.0, float(core.max()))
        positive = float(np.maximum(core, 0.0).sum())
        score = core * self.prior
        best = int(np.argmax(score))
        best_lag = lo + best if score[best] > 0.0 else 0
        prom = peak / max(1e-6, positive / (hi - lo + 1))
        periodic = best_lag > 0 and peak >= 0.30 and prom >= 5.0 and kurt >= 8.0
        self.ac_conf += 0.025 * ((1.0 if periodic else 0.0) - self.ac_conf)
        if periodic:
            a, b, c = ac[best_lag - lo], ac[best_lag - lo + 1], ac[best_lag - lo + 2]
            curve = a - 2.0 * b + c
            shift = min(max(0.5 * (a - c) / curve, -0.5), 0.5) if curve < 0.0 else 0.0
            bpm = 60.0 * self.ENV_RATE / (best_lag + shift)
            if self.ac_bpm < 1.0 or abs(math.log2(bpm / self.ac_bpm)) < 0.1:
                self.ac_bpm = bpm if self.ac_bpm < 1.0 else 0.9 * self.ac_bpm + 0.1 * bpm
                self.rival = 0
            else:
                self.rival += 1
                if self.rival >= 2 * self.AC_EVERY:
                    self.ac_bpm = bpm
                    self.rival = 0

    def fuse(self, rec):
        """The kicks and the fusion (AudioAnalyzer.cpp, "BPM estimation from inter-beat intervals")."""
        if rec[TRACK] > 0.5:
            self.kicks.count = 0
        if rec[ISBEAT] > 0.5:
            kb = self.kicks.beat(rec[BEATIV], self.smoothed)
            if kb > 0.0 and self.ac_bpm < 1.0:
                self.smoothed = kb if self.smoothed < 1.0 else 0.85 * self.smoothed + 0.15 * kb
        explain = self.kicks.count >= 6 and self.kicks.explained >= 0.95
        if self.ac_bpm > 1.0:
            target = fold(self.ac_bpm)
            if explain and self.kicks.bpm > 1.0 and abs(self.kicks.bpm / target / 1.5 - 1.0) < 0.03:
                target *= 1.5
            if self.smoothed < 1.0:
                self.smoothed = target
            else:
                f = 0.1 if self.ac_conf > 0.2 else 0.005
                self.smoothed = (1.0 - f) * self.smoothed + f * target
        self.smoothed = fold(self.smoothed)

    def run(self, tr):
        """Replays a trace; returns the published tempo per block (0 = none)."""
        out = np.zeros(len(tr))
        for i, rec in enumerate(tr):
            self.push(rec)
            self.block += 1
            if self.block >= self.AC_EVERY:
                self.block = 0
                self.autocorrelate()
            self.fuse(rec)
            out[i] = self.smoothed if self.smoothed > 40.64 else 0.0
        return out


METHODS = {"current": Current}


def score(bpm, beats, key, per_track):
    """Scores one demo like tempo_vs_cues.py; adds to per_track[key] = (counts by (band, kind), folded ok, n)."""
    per, fok, n = {}, 0, 0
    for i in range(0, len(bpm), EVERY):
        t = i * BLOCK
        if t < tvc.WARM:
            continue
        ref = tvc.reference(beats, t)
        if ref <= 0.0:
            continue
        b = round(bpm[i], 1)
        kind = tvc.classify(b, ref)
        band = next(x[0] for x in tvc.BANDS if x[1] <= ref < x[2])
        per[(band, kind)] = per.get((band, kind), 0) + 1
        n += 1
        fok += b > 0.0 and abs(tvc.fold(b) / tvc.fold(ref) - 1.0) <= tvc.TOL
    per_track[key] = (per, fok, n)


def table(per_track, out=sys.stdout):
    """The tempo_vs_cues.py table over all demos; returns {band: right share} and the folded share."""
    total, folded, count = {}, 0, 0
    for per, fok, n in per_track.values():
        for k, v in per.items():
            total[k] = total.get(k, 0) + v
        folded += fok
        count += n
    kinds = ["right"] + [r[0] for r in tvc.RATIOS] + ["none", "other"]
    out.write("%d tracks, %.0f min of rhythmic time; folded into 70..180: %.0f %% right\n"
              % (len(per_track), count * EVERY * BLOCK / 60.0, 100.0 * folded / max(count, 1)))
    out.write("%-10s %7s  %s\n" % ("reference", "share", "  ".join("%6s" % k for k in kinds)))
    right = {}
    for band in [b[0] for b in tvc.BANDS] + ["all"]:
        row = {k: sum(v for (b, kk), v in total.items() if kk == k and (band == "all" or b == band)) for k in kinds}
        n = sum(row.values())
        if n:
            out.write("%-10s %6.0f %%  %s\n" % (band, 100.0 * n / count,
                                                "  ".join("%5.0f%%" % (100.0 * row[k] / n) for k in kinds)))
            right[band] = row["right"] / n
    return right, folded / max(count, 1)


def main():
    """Replays the chosen method on every demo and prints the table."""
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--method", default="current", choices=sorted(METHODS))
    ap.add_argument("--check", action="store_true", help="compare the port's tempo with the C++ trace, block by block")
    ap.add_argument("--detail", action="store_true")
    ap.add_argument("sets", nargs="*")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    pairs = avc.find_pairs(a.sets)
    per_track, cmp = {}, []
    for cue, wav in pairs:
        beats = tvc.beats_of(cue)
        if len(beats) < 8:
            continue
        got = bench(cue, wav)
        if not got:
            continue
        key, _, trace = got
        tr = load_trace(trace)
        bpm = METHODS[a.method]().run(tr)
        if a.check:
            ref = np.where(tr[:, BPM] > 40.64, tr[:, BPM], 0.0)
            off = np.abs(bpm - ref) > 0.5
            cmp.append((key, float(off.mean())))
        score(bpm, beats, key, per_track)
        if a.detail:
            per, fok, n = per_track[key]
            if n:
                right = sum(v for (b, k), v in per.items() if k == "right")
                worst = sorted(((v, k) for (b, k), v in per.items() if k != "right"), reverse=True)[:2]
                print("%-52s strict %3.0f %%  folded %3.0f %%  %s" % (key[:52], 100.0 * right / n, 100.0 * fok / n,
                      ", ".join("%s %.0f %%" % (k, 100.0 * v / n) for v, k in worst)))
    table(per_track)
    if a.check:
        bad = [(k, s) for k, s in cmp if s > 0.01]
        print("port against the C++ trace: %d of %d demos differ by > 0.5 BPM in more than 1 %% of their blocks%s"
              % (len(bad), len(cmp), (": " + ", ".join("%s %.1f %%" % (k, 100 * s) for k, s in bad[:6])) if bad else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
