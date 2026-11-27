# -*- coding: utf-8 -*-
r"""buildup_lab.py -- the analyser's build-up signal (audioBuildUp) against the generators' score cues.

The build-up signal (AudioFeatures::buildUp, Source/AudioAnalyzer.cpp "Build-up / drop detection") drives the depth
arc of P2, the final pass's held breath and the drop detector's arming (> 0.45 arms the "vacuum" path for ~8 s).  The
demos of the generator family carry their sections as score cues (Tools/analyser_cue_set.txt): where a Build section
runs into a drop, the music builds.  This lab measures any build-up signal against that truth, per demo:

  inB    the signal's mean inside the builds (the Build section that runs into a drop -- a /phos/drop cue or a Drop
         section -- with a short Break in between allowed, from its start to the drop)
  inG    its mean inside the Groove sections (from 12 s on)
  auc    the probability that a random build block reads higher than a random groove block (0.5 = no separation)
  rise   Pearson correlation of the signal with the time inside each build (does it climb towards the drop?), the
         mean over the demo's builds
  pre    the signal's mean over the last 4 s before each drop
  arm    drops whose last 8 s before the drop see the signal above 0.45 (what arms the drop detector), of all drops
  falseG the share of groove time above 0.45 -- false builds (an armed detector in a groove)

Builds of at most 80 s are the EDM kind (Breakbeat, Psytrance, Techno, Trance, Berlin School); the longer ones (the
Cinematic crescendos, the Ritual intros) are listed apart as "long".

    python Tools/buildup_lab.py                         # the C++ signal from PresetEditor --features CSVs
    python Tools/buildup_lab.py --csv DIR               # CSVs from DIR (default: .screen/cuebench of this tree,
                                                        #   else of the main checkout)
    python Tools/buildup_lab.py --lab                   # also the lab's port of the new signal (from the PCM WAVs)
    python Tools/buildup_lab.py --features              # the candidate inputs' separation (auc/rise) per demo
    python Tools/buildup_lab.py --check TRACE WAV       # the port against the C++ (PresetEditor --features WAV x.csv
                                                        #   --buildup-trace TRACE)

The port (New below) runs on the analyser's own 32 log bands -- the 2048-point Hann FFT of the mono mix per 480-sample
block, as Tools/drum_lab.py computes it -- and on the music-presence gate taken from the trace (or, without a trace,
from the CSV's `presence` column, interpolated: then the port is close, not exact).
"""
import argparse
import csv
import io
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "Kaleidoscope Enhanced")
if not os.path.isdir(MAIN):
    MAIN = ROOT
SET = os.path.join(ROOT, "Tools", "analyser_cue_set.txt")
WORK = os.path.join(ROOT, ".screen", "buildlab")
WARM = 12.0
ARM = 0.45
LONG = 80.0


# ------------------------------------------------------------------ truth ----
def cue_key(cues_path):
    """The cache name analyser_vs_cues.py gives a demo: <generator>_<name>."""
    w = cues_path[:-len(".cues.tsv")] + ".wav"
    return "%s_%s" % (os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(w)))),
                      os.path.splitext(os.path.basename(w))[0])


def read_cues(path):
    sections, drops = [], []
    for line in io.open(path, encoding="utf-8"):
        p = line.rstrip("\r\n").split("\t")
        if line.startswith("#") or len(p) < 2:
            continue
        if p[1].endswith("/section"):
            sections.append((float(p[0]), p[2].split()[0] if len(p) > 2 and p[2] else "?"))
        elif p[1].endswith("/drop"):
            drops.append(float(p[0]))
    return sections, drops


def truth(cues_path, length):
    """builds [(a, b, long)], grooves [(a, b)], drops [t] of one demo."""
    sections, cue_drops = read_cues(cues_path)
    sections.sort()
    ends = [s[0] for s in sections[1:]] + [length]
    drops = sorted(set(cue_drops) | {t for t, k in sections if k == "Drop"})
    merged = []
    for d in drops:
        if not merged or d - merged[-1] > 1.0:
            merged.append(d)
    builds = []
    for d in merged:
        before = [i for i, (t, k) in enumerate(sections) if t < d - 0.5]
        if not before:
            continue
        i = before[-1]
        if sections[i][1] == "Break" and d - sections[i][0] < 10.0 and i > 0 and sections[i - 1][1] == "Build":
            i -= 1                                  # a short vacuum between the build and the drop
        if sections[i][1] == "Build":
            a = max(sections[i][0], WARM)
            if d - a > 2.0:
                builds.append((a, d, d - sections[i][0] > LONG))
    grooves = [(max(t, WARM), e) for (t, k), e in zip(sections, ends) if k == "Groove" and e > max(t, WARM) + 1.0]
    return builds, grooves, merged


def inside(t, spans):
    m = np.zeros(len(t), bool)
    for sp in spans:
        m |= (t >= sp[0]) & (t < sp[1])
    return m


def auc(pos, neg):
    """P(random pos > random neg), ties half (Mann-Whitney)."""
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    allv = np.concatenate([pos, neg])
    order = allv.argsort(kind="mergesort")
    ranks = np.empty(len(allv))
    sv = allv[order]
    i = 0
    while i < len(sv):                              # average ranks of ties
        j = i
        while j + 1 < len(sv) and sv[j + 1] == sv[i]:
            j += 1
        ranks[order[i:j + 1]] = 0.5 * (i + j) + 1.0
        i = j + 1
    rp = ranks[:len(pos)].sum()
    return (rp - len(pos) * (len(pos) + 1) / 2.0) / (len(pos) * len(neg))


def measure(t, s, tr):
    """The metrics of one signal s(t) against one demo's truth."""
    builds, grooves, drops = tr
    out = {}
    for kind, sel in (("edm", [b for b in builds if not b[2]]), ("long", [b for b in builds if b[2]])):
        if not sel:
            continue
        mb = inside(t, sel)
        mg = inside(t, grooves) & ~mb
        rises = []
        for a, b, _ in sel:
            m = (t >= a) & (t < b)
            if m.sum() > 10 and s[m].std() > 1e-9:
                rises.append(float(np.corrcoef(t[m], s[m])[0, 1]))
            elif m.sum() > 10:
                rises.append(0.0)
        bd = [b for _, b, _ in sel]
        pre = [float(s[(t >= d - 4.0) & (t < d)].mean()) for d in bd]
        arm = sum(1 for d in bd if (s[(t >= d - 8.0) & (t < d)] > ARM).any())
        out[kind] = dict(inB=float(s[mb].mean()), inG=float(s[mg].mean()) if mg.any() else float("nan"),
                         auc=auc(s[mb], s[mg]) if mg.any() else float("nan"), rise=float(np.mean(rises)),
                         pre=float(np.mean(pre)), arm=arm, n=len(sel))
    mg = inside(t, grooves)
    mb = inside(t, builds)
    mx = (t >= WARM) & ~mb
    for kind in ("edm", "long"):
        if kind in out:
            sel = inside(t, [b for b in builds if b[2] == (kind == "long")])
            out[kind]["aucX"] = auc(s[sel], s[mx])
    out["falseG"] = float((s[mg] > ARM).mean()) if mg.any() else float("nan")
    out["falseX"] = float((s[mx] > ARM).mean()) if mx.any() else float("nan")
    out["groove_s"] = float(mg.sum() * (t[1] - t[0])) if len(t) > 1 else 0.0
    return out


# ------------------------------------------------------------ the signals ----
def read_csv(path, cols=("buildup", "presence")):
    t, v = [], {c: [] for c in cols}
    for r in csv.DictReader(io.open(path, encoding="utf-8")):
        t.append(float(r["t"]))
        for c in cols:
            v[c].append(float(r[c]))
    return np.array(t), {c: np.array(x) for c, x in v.items()}


def csv_dir(arg):
    for d in ([arg] if arg else []) + [os.path.join(ROOT, ".screen", "cuebench"),
                                        os.path.join(MAIN, ".screen", "cuebench")]:
        if d and os.path.isdir(d):
            return d
    sys.exit("buildup_lab: no cuebench directory (run Tools/analyser_vs_cues.py @Tools/analyser_cue_set.txt first)")


def bands_of(wav):
    """The analyser's 32 linear band RMS values per 480-sample block (cached), and the block length in seconds."""
    import drum_lab
    os.makedirs(WORK, exist_ok=True)
    cache = os.path.join(WORK, os.path.splitext(os.path.basename(wav))[0] + ".b32.npy")
    x, sr = None, 44100
    if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(wav):
        b = np.load(cache)
        sr = int(b[0, 0])
        return b[1:].astype(np.float32), 480.0 / sr
    x, sr = drum_lab.read_wav(wav)
    b = drum_lab.bands32(drum_lab.spectra(x), sr)
    np.save(cache, np.vstack([np.full((1, 32), sr, np.float32), b]))
    return b, 480.0 / sr


class New:
    """The new build-up signal, ported from the C++ (the same order of operations, float32 state)."""

    def __init__(self, **kw):
        self.p = dict(kw)

    def run(self, bands, blk, presence):
        """bands (n, 32) linear RMS, blk seconds per block, presence (n,) the music gate.  -> (n,) signal, extras."""
        return new_signal(bands, blk, presence, **self.p)


def ema_coef(blk, tau):
    return np.float32(1.0 - np.exp(-blk / tau))


NEW_DEFAULTS = dict(gap_lo=6.0, gap_hi=30.0, c_scale=1.5, h_scale=3.0, base=0.2, tf=1.0, ts=6.0, up=0.5,
                    down=1.2, lo_cut=8, w_nogap=0.5, nogap_min=1.0)

_PREP = {}


def prep(bands, blk, lo_cut):
    """The parameter-free part per block: the drop detector's fast bass and groove level (dB), the centroid over the
    bands lo_cut..31 (band index) and the top's share (bands 20..31 over lo_cut..31, dB), whether the block is
    silent.  As the C++ computes them (float32 sums in band order)."""
    key = (bands.shape, float(bands[::97].sum()), lo_cut)
    if key in _PREP:
        return _PREP[key]
    f32 = np.float32
    n = bands.shape[0]
    b = bands.astype(np.float32)
    pw = b * b
    p_lo = np.zeros(n, np.float32)
    for k in range(8):                              # sequential float32 sums, as the C++ loops
        p_lo += pw[:, k]
    p_all = np.zeros(n, np.float32)
    p_idx = np.zeros(n, np.float32)
    p_hi = np.zeros(n, np.float32)
    for k in range(lo_cut, 32):
        p_all += pw[:, k]
        p_idx += pw[:, k] * f32(k)
        if k >= 20:
            p_hi += pw[:, k]
    cent = p_idx / (p_all + f32(1e-12))
    hr = f32(10.0) * np.log10((p_hi + f32(1e-12)) / (p_all + f32(1e-12)))
    a_fast = float(ema_coef(blk, 0.06))
    a_slow = float(ema_coef(blk, 2.0))
    fast = np.empty(n)
    slow = np.empty(n)
    bf = bs = 0.0
    pl = p_lo.tolist()
    for i in range(n):
        bf += a_fast * (pl[i] - bf)
        bs += a_slow * (pl[i] - bs)
        fast[i] = bf
        slow[i] = bs
    fast_db = 10.0 * np.log10(fast + 1e-12)
    slow_db = (10.0 * np.log10(slow + 1e-12)).tolist()
    groove = np.empty(n)
    slots = [-300.0] * 90
    # The C++ adds the block length in float32 until 0.5 s: at 48 kHz that is 51 blocks, not 50 -- count them so.
    per_slot, acc = 0, np.float32(0.0)
    while acc < np.float32(0.5):
        acc = np.float32(acc + np.float32(blk))
        per_slot += 1
    slot, secs, prev_max = 0, 0, -300.0         # secs: blocks into the slot; prev_max: the other 89 slots' maximum
    for i in range(n):
        if secs == 0:
            slots[slot] = slow_db[i]
        else:
            slots[slot] = max(slots[slot], slow_db[i])
        secs += 1
        g = max(prev_max, slots[slot])
        if secs >= per_slot:
            secs = 0
            slot = (slot + 1) % 90
            slots[slot] = -300.0
            prev_max = max(slots[j] for j in range(90) if j != slot)
            g = max(prev_max, -300.0)
        groove[i] = g
    out = dict(fast_db=fast_db, groove=groove, cent=cent.astype(np.float64), hr=hr.astype(np.float64),
               live=p_all > f32(1e-10))
    _PREP[key] = out
    return out


def snare_roll(bands):
    """Experimental (not in the C++): the old signal's snare-roll density -- the snare band group's onset envelope
    (drum_lab.Old, ported line by line from the band groups) through the leaky average 0.03 of the C++."""
    key = ("roll", bands.shape, float(bands[::97].sum()))
    if key in _PREP:
        return _PREP[key]
    n = bands.shape[0]
    raw = bands.astype(np.float32)
    ref = np.zeros(32, np.float32)
    sl = slice(8, 20)
    avg = 0.0
    cool = 0
    env = 0.0
    roll = 0.0
    out = np.zeros(n, np.float32)
    for t in range(n):
        r = raw[t]
        fm = float(r.max())
        d = r[sl] - ref[sl]
        pos = float(np.maximum(d, 0).sum())
        rg = float(ref[sl].sum()) + 1e-6
        np.maximum(r, ref * np.float32(0.985), out=ref)
        odf = pos / rg if fm > 1e-4 else 0.0
        if cool > 0:
            cool -= 1
        elif odf > avg * 2.2 + 0.060:
            env = max(env, min(odf / (avg * 2.2 + 1e-4) - 1.0, 1.0))
            cool = 12
        avg = 0.95 * avg + 0.05 * odf
        env *= 0.93
        roll += 0.03 * (min(env * 1.5, 1.0) - roll)
        out[t] = roll
    _PREP[key] = out
    return out


def new_signal(bands, blk, presence, **kw):
    """The port of AudioAnalyzer.cpp's new build-up (see the C++ for the reasoning).

    gap   the bass (bands 0..7, the drop detector's fast bass) under its groove level (the loudest 2-s bass of the
          last 45 s): 0 at gap_lo dB, 1 at gap_hi dB -- the build happens where the groove's low end is gone
    ctr   the spectral centroid above the bass (power-weighted band index of bands lo_cut..31) rising: its 1-s
          average over its 6-s average, 1 at c_scale bands
    htr   the top's share (bands 20..31, 2.9-16 kHz, in dB of bands lo_cut..31) rising the same way, 1 at h_scale
          dB -- the riser, the filter opening.  Above the bass, so that the bass leaving does not read as a rise.
    raw = max(gap * (base + (1 - base) * rise), w_nogap * rise) * presence, rise = max(ctr, htr); smoothed (rise
    `up` s, fall `down` s).
    """
    p = dict(NEW_DEFAULTS)
    p.update(kw)
    pr = prep(bands, blk, int(p["lo_cut"]))
    n = bands.shape[0]
    a_tf = float(ema_coef(blk, p["tf"]))
    a_ts = float(ema_coef(blk, p["ts"]))
    a_up = float(ema_coef(blk, p["up"]))
    a_dn = float(ema_coef(blk, p["down"]))
    cent, hr, live = pr["cent"].tolist(), pr["hr"].tolist(), pr["live"].tolist()
    gap_all = np.clip((pr["groove"] - pr["fast_db"] - p["gap_lo"]) / (p["gap_hi"] - p["gap_lo"]), 0.0, 1.0).tolist()
    pres = np.asarray(presence, np.float64).tolist()
    base, wng, cs_, hs_ = p["base"], p["w_nogap"], p["c_scale"], p["h_scale"]
    wroll = p.get("w_roll", 0.0)
    a_hold = float(ema_coef(blk, p["hold"])) if p.get("hold", 0.0) else 0.0
    wlvl = p.get("w_lvl", 0.0)
    if wlvl:
        lvl = (10.0 * np.log10((bands.astype(np.float64) ** 2).sum(1) + 1e-12)).tolist()
        a_lf = float(ema_coef(blk, p.get("lvl_f", 4.0)))
        a_ls = float(ema_coef(blk, p.get("lvl_s", 20.0)))
        lf = ls = lvl[0]
    held = 0.0
    roll = snare_roll(bands).tolist() if wroll else None
    out = np.zeros(n, np.float32)
    extra = np.zeros((n, 3), np.float32)
    init = False
    cf = cs = hf = hs = s = 0.0
    for i in range(n):
        if live[i]:
            if not init:
                cf = cs = cent[i]
                hf = hs = hr[i]
                init = True
            cf += a_tf * (cent[i] - cf)
            cs += a_ts * (cent[i] - cs)
            hf += a_tf * (hr[i] - hf)
            hs += a_ts * (hr[i] - hs)
        if not init:
            continue
        gap = gap_all[i]
        ctr = min(max((cf - cs) / cs_, 0.0), 1.0)
        htr = min(max((hf - hs) / hs_, 0.0), 1.0)
        rise = max(ctr, htr)
        if a_hold:                                  # experimental: hold the rise while the gap lasts
            held = max(rise, held - a_hold * held * (1.0 if gap > 0.5 else 20.0))
            rise = held
        r2 = min(ctr, htr) if p["nogap_min"] else rise
        raw = max(gap * (base + (1.0 - base) * rise), wng * r2)
        if wroll:
            raw = max(raw, gap * wroll * roll[i])
        if wlvl:                                    # experimental: a slow loudness ramp (crescendos)
            lf += a_lf * (lvl[i] - lf)
            ls += a_ls * (lvl[i] - ls)
            raw = max(raw, wlvl * min(max((lf - ls) / p.get("lvl_scale", 6.0), 0.0), 1.0))
        raw *= pres[i]
        s += (a_up if raw > s else a_dn) * (raw - s)
        out[i] = s
        extra[i, 0] = gap
        extra[i, 1] = ctr
        extra[i, 2] = htr
    return out, extra


# ---------------------------------------------------------- the candidates ----
def candidate_features(bands, blk):
    """Per-block candidate inputs (all causal) for --features."""
    n = bands.shape[0]
    pw = bands.astype(np.float64) ** 2
    lo = 10 * np.log10(pw[:, :8].sum(1) + 1e-12)
    hi = 10 * np.log10(pw[:, 20:].sum(1) + 1e-12)
    mid = 10 * np.log10(pw[:, 8:20].sum(1) + 1e-12)
    tot = 10 * np.log10(pw.sum(1) + 1e-12)
    idx = np.arange(32)
    cent = (pw * idx).sum(1) / (pw.sum(1) + 1e-12)
    # positive band flux against the previous block, per group: onset-ish
    lb = np.log1p(100 * bands.astype(np.float64))
    fl = np.maximum(np.diff(lb, axis=0, prepend=lb[:1]), 0)
    fl_hi = fl[:, 8:].sum(1)

    def ema(x, tau):
        a = 1.0 - np.exp(-blk / tau)
        y = np.empty_like(x)
        acc = x[0]
        for i in range(len(x)):
            acc += a * (x[i] - acc)
            y[i] = acc
        return y

    f = {}
    f["hi_db"] = ema(hi, 0.5)
    f["hi_rel"] = ema(hi - tot, 0.5)
    f["lo_rel"] = ema(lo - tot, 0.5)
    f["cent"] = ema(cent, 0.5)
    f["hi_trend"] = ema(hi, 1.0) - ema(hi, 6.0)
    f["tot_trend"] = ema(tot, 1.0) - ema(tot, 6.0)
    f["cent_trend"] = ema(cent, 1.0) - ema(cent, 6.0)
    f["flux_hi"] = ema(fl_hi, 1.0)
    f["flux_trend"] = ema(fl_hi, 1.0) - ema(fl_hi, 6.0)
    lo_s = ema(10 ** (lo / 10), 2.0)
    lo_s_db = 10 * np.log10(lo_s + 1e-12)
    # the groove level: max of the 2-s bass over the last 45 s
    w = int(round(45.0 / blk))
    step = max(1, int(round(0.5 / blk)))
    g = np.empty(n)
    for i in range(0, n, step):
        g[i:i + step] = lo_s_db[max(0, i - w):i + 1].max()
    f["bass_gap"] = g - ema(lo, 0.1)
    f["hi_vs_groove"] = ema(hi, 0.5) - np.array([ema(hi, 0.5)[max(0, i - w):i + 1].max() if i % step == 0 else np.nan
                                                  for i in range(n)])
    f["hi_vs_groove"] = np.where(np.isnan(f["hi_vs_groove"]), np.nan, f["hi_vs_groove"])
    v = f["hi_vs_groove"]
    for i in range(n):
        if np.isnan(v[i]):
            v[i] = v[i - 1]
    return f


# ------------------------------------------------------------------- main ----
def demos(only=None):
    out = []
    for c in io.open(SET, encoding="utf-8"):
        c = c.strip()
        if not c:
            continue
        k = cue_key(c)
        if only and not any(o in k for o in only):
            continue
        out.append((c, k))
    return out


def fmt(v, f="%5.2f"):
    return "  -  " if v is None or (isinstance(v, float) and np.isnan(v)) else f % v


def print_table(rows, title):
    print("\n" + title)
    cols = ("inB", "inG", "auc", "aucX", "rise", "pre")
    print("%-34s %-4s %5s %5s %5s %5s %5s %5s %5s %6s %6s" % (("demo", "kind") + cols + ("arm", "falseG", "falseX")))
    agg = {}
    for name, m in rows:
        for kind in ("edm", "long"):
            if kind not in m:
                continue
            k = m[kind]
            print("%-34s %-4s %s %s %s %s %s %s %2d/%-2d %s %s" % ((name[:34], kind) + tuple(fmt(k[x]) for x in cols)
                                                                + (k["arm"], k["n"], fmt(m["falseG"], "%6.3f"),
                                                                   fmt(m["falseX"], "%6.3f"))))
            a = agg.setdefault(kind, dict(arm=0, n=0, **{x: [] for x in cols}))
            for x in cols:
                if not np.isnan(k[x]):
                    a[x].append(k[x])
            a["arm"] += k["arm"]
            a["n"] += k["n"]
        if "edm" not in m and "long" not in m:
            print("%-34s %-4s %35s %5s %s %s" % (name[:34], "grv", "", "", fmt(m["falseG"], "%6.3f"),
                                                fmt(m["falseX"], "%6.3f")))
    fg = [m["falseG"] for _, m in rows if not np.isnan(m["falseG"])]
    fgw = sum(m["falseG"] * m["groove_s"] for _, m in rows if not np.isnan(m["falseG"]))
    gs = sum(m["groove_s"] for _, m in rows if not np.isnan(m["falseG"]))
    for kind, a in agg.items():
        print("%-34s %-4s %s %2d/%-2d" % ("MEAN", kind, " ".join(fmt(float(np.mean(a[x])) if a[x] else None)
                                                                  for x in cols), a["arm"], a["n"]))
    fx = [m["falseX"] for _, m in rows if not np.isnan(m["falseX"])]
    print("outside the builds: %.3f of the time above %.2f (mean over %d demos)" % (float(np.mean(fx)), ARM, len(fx)))
    print("false builds: %.3f of all groove time above %.2f (%d demos with grooves, %.0f s)" % (fgw / max(gs, 1e-9), ARM,
                                                                                               len(fg), gs))


TRACE_COLS = ("t", "presence", "fast_db", "groove", "cent", "hr", "gap", "ctr", "htr", "raw", "new", "old")


def check_trace(trace, wav, **kw):
    """The port against the C++: the same WAV, the trace's music presence; the largest differences per column."""
    tr = np.fromfile(trace, "<f4").reshape(-1, len(TRACE_COLS))
    bands, blk = bands_of(wav)
    n = min(len(tr), bands.shape[0])
    if len(tr) != bands.shape[0]:
        print("rows: trace %d, port %d (compared: %d)" % (len(tr), bands.shape[0], n))
    s, ex = new_signal(bands[:n], blk, tr[:n, 1], **kw)
    pr = prep(bands[:n], blk, int(dict(NEW_DEFAULTS, **kw)["lo_cut"]))
    worst = 0.0
    for name, mine in (("fast_db", pr["fast_db"]), ("groove", pr["groove"]), ("cent", pr["cent"]), ("hr", pr["hr"]),
                       ("gap", ex[:, 0]), ("ctr", ex[:, 1]), ("htr", ex[:, 2]), ("new", s)):
        c = tr[:n, TRACE_COLS.index(name)]
        live = np.isfinite(c) & (c > -200)
        dif = np.abs(np.asarray(mine, np.float64)[live] - c[live])
        print("%-8s max |port - C++| %.5f  (99.9th pct %.5f)" % (name, dif.max(), np.percentile(dif, 99.9)))
        if name == "new":
            worst = dif.max()
    print("new build-up: %s (max difference %.4f)" % ("MATCH" if worst < 0.01 else "DIFFERS", worst))
    return worst < 0.01


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=None)
    ap.add_argument("--lab", action="store_true")
    ap.add_argument("--features", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--check", nargs=2, default=None)
    ap.add_argument("--param", nargs="*", default=[])
    a = ap.parse_args()
    kw = {}
    for p in a.param:
        k, v = p.split("=")
        kw[k] = float(v)
    if a.check:
        sys.exit(0 if check_trace(a.check[0], a.check[1], **kw) else 1)
    d = csv_dir(a.csv)
    rows_old, rows_new, feat_rows = [], [], {}
    for cues, key in demos(a.only):
        path = os.path.join(d, key + ".csv")
        if not os.path.exists(path):
            print("(no CSV for %s)" % key)
            continue
        t, v = read_csv(path)
        tr = truth(cues, t[-1])
        if not tr[0] and not tr[1]:
            continue
        rows_old.append((key, measure(t, v["buildup"], tr)))
        if a.lab or a.features:
            wav = os.path.join(d, key + ".wav")
            bands, blk = bands_of(wav)
            tb = (np.arange(bands.shape[0]) + 1) * blk
            if a.lab:
                pres = np.interp(tb, t, v["presence"]).astype(np.float32)
                s, _ = New(**kw).run(bands, blk, pres)
                rows_new.append((key, measure(tb, s, tr)))
            if a.features:
                f = candidate_features(bands, blk)
                for name, x in f.items():
                    feat_rows.setdefault(name, []).append((key, measure(tb, x, tr)))
    print_table(rows_old, "C++ buildUp (%s)" % d)
    if a.lab:
        print_table(rows_new, "lab: new signal %s" % (kw or ""))
    for name, rows in feat_rows.items():
        aucs = [m["edm"]["auc"] for _, m in rows if "edm" in m and not np.isnan(m["edm"]["auc"])]
        rises = [m["edm"]["rise"] for _, m in rows if "edm" in m]
        per = " ".join("%s:%.2f/%.2f" % (k.split("_", 1)[1][:6], m["edm"]["auc"], m["edm"]["rise"])
                       for k, m in rows if "edm" in m)
        print("%-13s auc %.2f (min %.2f) rise %.2f  %s" % (name, np.mean(aucs) if aucs else np.nan,
                                                           np.min(aucs) if aucs else np.nan,
                                                           np.mean(rises) if rises else np.nan, per))


if __name__ == "__main__":
    main()
