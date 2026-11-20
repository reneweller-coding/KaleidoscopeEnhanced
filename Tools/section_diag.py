# -*- coding: utf-8 -*-
r"""section_diag.py -- what changes at a section boundary, by kind of feature: timbre, loudness, harmony, rhythm.

The section detector (AudioAnalyzer, 22.10.2026) compares the last 3 s with the 12 s before them in two things only:
the shape of 32 log bands and the loudness.  A5 of docs/PLAN_2026-11-20.md found that its misses are not a matter of
timing -- at a missed boundary the novelty stays under the threshold.  This asks which other change is there instead.
For every annotated boundary (after the first 12 s, with 6 s of music after it) and for random moments at least 6 s
from any boundary (the control), at the moment 3 s after it: the two-window contrast of each feature group, the
detector's own test -- the difference of the means of the last 3 s and the 12 s before, in units of the earlier
window's spread (plus a floor), root mean square over the group's dimensions:

    timbre    the shape of 32 log bands, 40 Hz..11 kHz (dB, the frame's mean over the bands removed) -- as the detector
    loudness  the total power in dB                                                           -- as the detector
    harmony   the 12 pitch classes (power of the spectrum folded onto C..B, 55 Hz..5 kHz, normalised per frame)
    rhythm    the onset density in three band groups (spectral flux, low < 200 Hz, mid, high > 2 kHz; log)

Each contrast is divided by the track's own median contrast at the control moments (the detector reads its novelty
against its own running median the same way).  Then per set: how well each group tells boundaries from the control
(AUC), and at the boundaries the current detector found and missed.  The detector's result is read from the cached
feature files of Tools/analyser_vs_cues.py (run it on the set first): found = an analyser section from 2 s before to
6 s after the boundary.

    python Tools/section_diag.py @Tools/analyser_cue_set.txt @.screen/harmonix/set.txt

Audio: the 16-bit PCM copies analyser_vs_cues.py keeps in .screen/cuebench.  Below normal priority, one track at a time.
"""
import csv
import io
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyser_vs_cues as avc  # noqa: E402

SR = 22050
HOP = 441                 # 20 ms; five hops make the detector's 0.1-s frame
FRAME = 5
A_FRAMES, B_FRAMES = 30, 120
WARM = 12.0
GROUPS = ("timbre", "loudness", "harmony", "rhythm")


def below_normal():
    """Lower this process's priority (Windows; elsewhere nice)."""
    try:
        import psutil
        psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 10)
    except Exception:
        pass


def cache_paths(cue, wav):
    """(PCM copy, feature CSV) that analyser_vs_cues.py wrote for this track."""
    key = "%s_%s" % (os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(wav)))),
                     os.path.splitext(os.path.basename(wav))[0])
    return os.path.join(avc.CACHE, key + ".wav"), os.path.join(avc.CACHE, key + ".csv")


def read_pcm(path):
    """Mono float samples at SR from a 16-bit PCM WAV (via ffmpeg for the resampling)."""
    import subprocess
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def features(x):
    """Per 0.1-s frame: {group: array (frames, dims)}."""
    n = 1 + (len(x) - 2048) // HOP
    fr = np.lib.stride_tricks.as_strided(x, shape=(n, 2048), strides=(x.strides[0] * HOP, x.strides[0]))
    spec = np.abs(np.fft.rfft(fr * np.hanning(2048), axis=1)) ** 2          # power, (n, 1025)
    freq = np.fft.rfftfreq(2048, 1.0 / SR)
    # 32 log bands
    edges = np.geomspace(40.0, 11000.0, 33)
    bidx = np.clip(np.searchsorted(edges, freq) - 1, -1, 32)
    bands = np.zeros((n, 32))
    for b in range(32):
        m = bidx == b
        if m.any():
            bands[:, b] = spec[:, m].sum(axis=1)
    # chroma
    ok = (freq >= 55.0) & (freq <= 5000.0)
    pc = np.round(12.0 * np.log2(freq[ok] / 440.0)).astype(int) % 12
    chroma = np.zeros((n, 12))
    for c in range(12):
        chroma[:, c] = spec[:, ok][:, pc == c].sum(axis=1)
    # onset strength per band group (log-magnitude flux)
    lm = np.log1p(1000.0 * np.sqrt(spec))
    flux = np.maximum(np.diff(lm, axis=0, prepend=lm[:1]), 0.0)
    groups = [freq < 200.0, (freq >= 200.0) & (freq < 2000.0), freq >= 2000.0]
    onset = np.stack([flux[:, g].sum(axis=1) for g in groups], axis=1)
    # 0.1-s frames
    m = n // FRAME

    def pool(a):
        return a[:m * FRAME].reshape(m, FRAME, -1).mean(axis=1)

    bp = pool(bands)
    db = 10.0 * np.log10(bp + 1e-10)
    shape = db - db.mean(axis=1, keepdims=True)
    loud = 10.0 * np.log10(bp.sum(axis=1, keepdims=True) + 1e-10)
    ch = pool(chroma)
    ch = ch / (ch.sum(axis=1, keepdims=True) + 1e-12)
    rh = np.log1p(pool(onset))
    return {"timbre": shape, "loudness": loud, "harmony": ch, "rhythm": rh}


def contrast(f, k, floor):
    """The two-window test at frame k (exclusive end of the last window): RMS over the dims of z."""
    a = f[k - A_FRAMES:k]
    b = f[k - A_FRAMES - B_FRAMES:k - A_FRAMES]
    z = (a.mean(axis=0) - b.mean(axis=0)) / (b.std(axis=0) + floor)
    return float(np.sqrt(np.mean(z * z)))


def analyser_sections(csv_path):
    """The analyser's section starts (seconds) from a feature CSV of analyser_vs_cues.py."""
    secs, last = [], 0
    for r in csv.DictReader(io.open(csv_path, encoding="utf-8")):
        s = int(r["sections"])
        if s > last:
            secs.append(float(r["t"]))
        last = s
    return secs


def auc(pos, neg):
    """Probability that a boundary's value exceeds a control's (ties half)."""
    pos, neg = np.asarray(pos), np.asarray(neg)
    if not len(pos) or not len(neg):
        return float("nan")
    gt = (pos[:, None] > neg[None, :]).mean()
    eq = (pos[:, None] == neg[None, :]).mean()
    return float(gt + 0.5 * eq)


def run_set(listfile, rng):
    """Rows (kind, found, label, {group: ratio}) of one set."""
    rows = []
    for cue, wav in avc.find_pairs([listfile]):
        pcm, feat = cache_paths(cue, wav)
        if not (os.path.exists(pcm) and os.path.exists(feat)):
            print("  (no cache for %s -- run analyser_vs_cues.py on the set)" % os.path.basename(cue))
            continue
        f = features(read_pcm(pcm))
        n = len(next(iter(f.values())))
        floors = {g: 0.25 * f[g].std(axis=0) + 1e-6 for g in GROUPS}
        floors["timbre"] = np.maximum(floors["timbre"], 1.0)      # the detector's floor of 1 dB
        floors["loudness"] = np.maximum(floors["loudness"], 1.0)
        sections, _ = avc.read_cues(cue)
        bounds = [(t, k) for t, k in sections if t >= WARM + 3.0 and t + 6.0 <= n / 10.0]
        found_at = analyser_sections(feat)
        alltimes = [t for t, _ in sections]
        ctrl_t = [t for t in np.arange(WARM + 3.0, n / 10.0 - 6.0, 1.0)
                  if all(abs(t - b) >= 6.0 for b in alltimes)]
        ctrl_t = list(rng.choice(ctrl_t, size=min(len(ctrl_t), 40), replace=False)) if ctrl_t else []

        def at(t):
            k = int(round((t + 3.0) * 10.0))
            if k - A_FRAMES - B_FRAMES < 0 or k > n:
                return None
            return {g: contrast(f[g], k, floors[g]) for g in GROUPS}

        ctrl = [c for c in (at(t) for t in ctrl_t) if c]
        if len(ctrl) < 5:
            continue
        med = {g: float(np.median([c[g] for c in ctrl])) + 1e-6 for g in GROUPS}
        for c in ctrl:
            rows.append(("control", None, "", {g: c[g] / med[g] for g in GROUPS}))
        for t, label in bounds:
            c = at(t)
            if not c:
                continue
            found = any(t - 2.0 <= s <= t + 6.0 for s in found_at)
            rows.append(("boundary", found, label, {g: c[g] / med[g] for g in GROUPS}))
    return rows


def report(name, rows):
    """The table of one set."""
    ctrl = [r[3] for r in rows if r[0] == "control"]
    found = [r[3] for r in rows if r[0] == "boundary" and r[1]]
    missed = [r[3] for r in rows if r[0] == "boundary" and not r[1]]
    print("\n%s: %d boundaries (%d found by the detector, %d missed), %d control moments"
          % (name, len(found) + len(missed), len(found), len(missed), len(ctrl)))
    print("  %-9s %18s %18s %18s   %s" % ("group", "AUC all bounds", "AUC missed only", "AUC found only",
                                          "median ratio: found / missed / control"))
    for g in GROUPS:
        cg = [c[g] for c in ctrl]
        fg = [c[g] for c in found]
        mg = [c[g] for c in missed]
        print("  %-9s %18.2f %18.2f %18.2f   %5.2f / %5.2f / %5.2f"
              % (g, auc(fg + mg, cg), auc(mg, cg), auc(fg, cg), np.median(fg) if fg else float("nan"),
                 np.median(mg) if mg else float("nan"), np.median(cg)))
    # Which group is the strongest at each missed boundary, and is it strong at all (ratio >= 2)?
    if missed:
        lead = {}
        for c in missed:
            g = max(GROUPS, key=lambda k: c[k])
            key = g if c[g] >= 2.0 else "none >= 2"
            lead[key] = lead.get(key, 0) + 1
        print("  missed boundaries, the strongest change there (ratio >= 2 over the track's ordinary):",
              ", ".join("%s %d" % kv for kv in sorted(lead.items(), key=lambda kv: -kv[1])))
        new = [c for c in missed if max(c["timbre"], c["loudness"]) < 2.0 and max(c["harmony"], c["rhythm"]) >= 2.0]
        print("  missed with timbre and loudness under 2 but harmony or rhythm at 2 or more: %d of %d"
              % (len(new), len(missed)))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    below_normal()
    rng = np.random.default_rng(1)
    for listfile in sys.argv[1:] or ["@" + os.path.join(avc.ROOT, "Tools", "analyser_cue_set.txt")]:
        report(listfile.lstrip("@"), run_set(listfile, rng))
    return 0


if __name__ == "__main__":
    sys.exit(main())
