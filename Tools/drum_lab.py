# -*- coding: utf-8 -*-
r"""drum_lab.py -- the analyser's kick / snare / hat envelopes, old and new, against drums whose onsets are known.

The shaders' audioKick, audioSnare and audioHat come from three onset envelopes the analyser computes every 10-ms
block (Source/AudioAnalyzer.cpp: until 27.11.2026 onsets of three band groups; since then Source/DrumSeparator.cpp).
This lab replays both on the analyser's own spectra -- the 2048-point Hann FFT of the mono mix, one per 480-sample
block, computed here exactly as the C++ does -- and scores them against ground truth:

  screen     the screening music (Tools/screen.py, Tools/reactivity.py voice_stems): kick, snare and hat on a known
             grid, with the bass (sawtooth, gated in eighths) and the lead (sixteenths) as the voices that must NOT
             drive them.  Seven mixes: full, each voice muted.
  break      the BreakbeatGenerator's track "x" (G:\Tools\VRAudio\BreakbeatGenerator\work\x_stems + x.mid): real
             sampled drums and a break, kick and snare onsets from the MIDI file; the drums stem muted for the leak.
  real       the user's tracks in .screen/music of the main checkout (no truth: level statistics only, never copied).
  cues       the 43 generator demos (.screen/cuebench PCM copies): level statistics and the share of kick hits on
             the /phos/beat grid.

Measures per instrument (README of the method: docs/engine-internals.md (70)):
  F      onset F-measure of the envelope's triggers against the true onsets (+-30 ms after the latency offset);
  leak   the envelope's onset-locked energy (its maximum 0..120 ms after each true onset) with that instrument
         muted, over the same with it playing -- 0 = the envelope needs the instrument;
  xtalk  how much the envelope changes when another voice is muted: sum |e_full - e_muted| / sum e_full; and at the
         other voice's own hits (60 ms or more from this drum's), the part of the envelope that goes with it.
  Leak and crosstalk on what the shaders see: the conditioner's drum stage (peak hold, slew) after the envelope.

    python Tools/drum_lab.py                     # all sets, old against new, one table
    python Tools/drum_lab.py --set screen        # one set
    python Tools/drum_lab.py --check TRACE WAV   # the port against the C++ (PresetEditor --features WAV x.csv --drum-trace TRACE)
    python Tools/drum_lab.py --stats real,cues   # level statistics old/new on the user's tracks and the demos
    python Tools/drum_lab.py --same PresetEditor_old.exe   # every other feature column, old editor against this one
    python Tools/drum_lab.py --write             # the truth sets' mixes as WAVs (.screen/drumlab)
    python Tools/drum_lab.py --param thr_k=2.6   # a knob of New for one run (New.__init__ and its run() steps)

The method in the C++ is New() with its defaults: the median across frequency above 250 Hz (perc="vmed"), the rise
over the band's recent peak below 250 Hz and over the previous block above (flag="ref"), the decomposition of that
rise onto fixed templates (mode="flux"), the drum's part in its own band against the band's level (norm="band"),
the old peak picking with the average floored (avg_floor=0.03, thr_k 2.2/3.0/2.2).  The other modes and knobs are
the variants that were measured and dropped; they stay here so a later change can be compared with them.
"""
import argparse
import glob
import os
import struct
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "Kaleidoscope Enhanced")
if not os.path.isdir(MAIN):
    MAIN = ROOT
WORK = os.path.join(ROOT, ".screen", "drumlab")
BREAK = r"G:\Tools\VRAudio\BreakbeatGenerator\work"
N = 2048
HALF = N // 2 + 1
BLOCK = 480
DRUMS = ("kick", "snare", "hat")
# The templates' shape constants (DrumSeparator.cpp has the same).  The DL_* environment variables change them for a
# run of the lab -- how the variants of "tried and dropped" (docs/engine-internals.md (70)) were measured.
ABS_RHO = tuple(float(v) for v in os.environ.get("DL_RHO", "0.5").split(","))
KICK_TOP = 200.0
HARM_LO = 250.0
SNARE_SPLIT = os.environ.get("DL_SPLIT", "0") == "1"
SNARE_BF = float(os.environ.get("DL_BF", "200"))
SNARE_BW = float(os.environ.get("DL_BW", "0.5"))
HAT_LO = float(os.environ.get("DL_HL", "6500"))
SNARE_HI = float(os.environ.get("DL_SH", "9000"))
SNARE_BODY = float(os.environ.get("DL_SB", "0.5"))
HARM_HI = float(os.environ.get("DL_HH", "3000"))
NORM_BANDS = ((35.0, 200.0), (float(os.environ.get("DL_SNLO", "1000")), 8000.0), (6000.0, 17000.0))


# ------------------------------------------------------------------ audio ----
def read_wav(path):
    """Mono float32 samples (the mean of the channels, as the analyser mixes) and the rate; PCM16 or float32."""
    with open(path, "rb") as f:
        d = f.read()
    p, fmt, ch, sr, bits, data = 12, None, 1, 44100, 16, None
    while p + 8 <= len(d):
        cid, sz = d[p:p + 4], struct.unpack("<I", d[p + 4:p + 8])[0]
        if cid == b"fmt ":
            fmt, ch, sr = struct.unpack("<HHI", d[p + 8:p + 16])
            bits = struct.unpack("<H", d[p + 22:p + 24])[0]
            if fmt == 0xFFFE:
                fmt = struct.unpack("<H", d[p + 32:p + 34])[0]
        elif cid == b"data":
            data = d[p + 8:p + 8 + sz]
            break
        p += 8 + sz + (sz & 1)
    if fmt == 1 and bits == 16:
        x = np.frombuffer(data[:len(data) // 2 * 2], "<i2").astype(np.float32) / 32768.0
    elif fmt == 3 and bits == 32:
        x = np.frombuffer(data[:len(data) // 4 * 4], "<f4").astype(np.float32)
    else:
        raise ValueError("%s: unsupported WAV (fmt %s, %s bit)" % (path, fmt, bits))
    x = x[:len(x) // ch * ch].reshape(-1, ch).mean(axis=1)
    return x.astype(np.float32), sr


_SPEC = {}


def spectra(x):
    key = (len(x), float(x[::997].sum()), float(np.abs(x[::1009]).sum()))
    if key not in _SPEC:
        _SPEC[key] = _spectra(x)
    return _SPEC[key]


def _spectra(x):
    """The analyser's magnitude spectra, one per 480-sample block (the 2048 newest samples, Hann, k = 0..1024).

    @return
      float32 array (blocks, 1025).
    """
    win = (0.5 * (1.0 - np.cos(2.0 * np.pi * np.arange(N) / (N - 1)))).astype(np.float32)
    nb = len(x) // BLOCK
    xp = np.concatenate([np.zeros(N, np.float32), x.astype(np.float32)])
    out = np.empty((nb, HALF), np.float32)
    step = 2048
    for s in range(0, nb, step):
        e = min(nb, s + step)
        ends = (np.arange(s, e) + 1) * BLOCK + N          # one past the block's last sample, in xp
        idx = ends[:, None] - N + np.arange(N)[None, :]
        fr = xp[idx] * win
        out[s:e] = np.abs(np.fft.rfft(fr, axis=1)).astype(np.float32)
    return out


def bands32(mags, sr):
    """The analyser's 32 log bands (40 Hz..16 kHz, RMS of the bins), as in the C++ (int truncation included)."""
    nb = 32
    bin_hz = np.float32(sr) / np.float32(N)
    out = np.zeros((mags.shape[0], nb), np.float32)
    for b in range(nb):
        f0 = np.float32(40.0 * (16000.0 / 40.0) ** (b / nb))
        f1 = np.float32(40.0 * (16000.0 / 40.0) ** ((b + 1) / nb))
        k0 = max(1, int(f0 / bin_hz))
        k1 = min(HALF - 1 - 1, max(k0 + 1, int(f1 / bin_hz))) if False else min(N // 2, max(k0 + 1, int(f1 / bin_hz)))
        out[:, b] = np.sqrt((mags[:, k0:k1].astype(np.float64) ** 2).mean(axis=1)) if k1 > k0 else 0.0
    return out


# ------------------------------------------------------- the old detector ----
class Old:
    """The band-group detector of AudioAnalyzer.cpp until 27.11.2026 (ported line by line)."""

    name = "old"

    def __init__(self, grp=None, pre=None):
        self.grp = np.array([0] * 8 + [1] * 12 + [2] * 12) if grp is None else np.asarray(grp)
        self.pre = pre

    def run(self, mags, sr):
        if self.pre is not None:
            mags = self.pre(mags, sr)
        raw = bands32(mags, sr)
        n = raw.shape[0]
        ref = np.zeros(32, np.float32)
        avg = np.zeros(3, np.float32)
        cool = np.zeros(3, int)
        env = np.zeros(3, np.float32)
        out = np.zeros((n, 3), np.float32)
        trig = np.zeros((n, 3), bool)
        odfs = np.zeros((n, 3), np.float32)
        grp = self.grp
        use = grp >= 0
        grp = np.where(use, grp, 0)
        for t in range(n):
            r = raw[t]
            fm = max(1e-6, float(r.max()))
            d = r - ref
            pos = np.bincount(grp, np.maximum(d, 0) * use, 3)
            rg = np.bincount(grp, ref * use, 3) + 1e-6
            ref = np.maximum(r, ref * np.float32(0.985))
            for g in range(3):
                odf = pos[g] / rg[g] if fm > 1e-4 else 0.0
                odfs[t, g] = odf
                if cool[g] > 0:
                    cool[g] -= 1
                elif odf > avg[g] * 2.2 + 0.060:
                    s = min(odf / (avg[g] * 2.2 + 1e-4) - 1.0, 1.0)
                    env[g] = max(env[g], s)
                    cool[g] = 12
                    trig[t, g] = True
                avg[g] = 0.95 * avg[g] + 0.05 * odf
                env[g] *= 0.93
            out[t] = env
        return out, trig, odfs


# ------------------------------------------------------- the new detector ----
def log_bands(sr, lo=30.0, hi=16000.0, per_oct=4):
    """Band edges in bins for a log-frequency reduction: (k0, k1) per band, at least one bin wide."""
    nb = int(np.ceil(np.log2(hi / lo) * per_oct))
    bin_hz = sr / N
    edges = []
    for b in range(nb):
        f0 = lo * 2 ** (b / per_oct)
        f1 = lo * 2 ** ((b + 1) / per_oct)
        k0 = max(1, int(np.floor(f0 / bin_hz + 0.5)))
        k1 = max(k0 + 1, int(np.floor(f1 / bin_hz + 0.5)))
        edges.append((k0, min(k1, HALF - 1)))
    # merge bands that share bins at the bottom
    merged = []
    for k0, k1 in edges:
        if merged and k0 < merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], k1))
        else:
            merged.append((k0, k1))
    centres = np.array([np.sqrt(max(k0, 0.5) * k1) * bin_hz for k0, k1 in merged])
    return merged, centres


def templates(fc, bass_roots=(40.0, 55.0, 70.0, 90.0, 115.0, 145.0), hat_lo=None, snare_hi=None):
    """Fixed spectral templates over the band centres fc (columns, unit sum): kick, snare, hat, then the absorbers.

    Parametric, from the drums' acoustics rather than learned from a data set: the kick a body around 60 Hz and a
    faint beater click; the snare a shell around 200 Hz and a noise plateau 1-9 kHz; the hat noise above ~6 kHz.
    The absorbers take what is no drum (the partially fixed NMF of Wu & Lerch 2015, here with fixed shapes): a bass
    note's onset per root (nothing below the root, its harmonics falling above it) and a tonal mid onset.
    """
    lf = np.log2(fc)

    def bump(f, width_oct):
        return np.exp(-0.5 * ((lf - np.log2(f)) / width_oct) ** 2)

    def sig(f, slope):
        return 1.0 / (1.0 + np.exp(-(lf - np.log2(f)) * slope))

    low = sig(35.0, 6.0) * (1.0 - sig(160.0, 6.0))            # 35..160 Hz plateau
    kick = sig(35.0, 6.0) * (1.0 - sig(KICK_TOP, 6.0)) + 0.03 * bump(3000.0, 1.0)
    snare = SNARE_BODY * bump(SNARE_BF, SNARE_BW) + sig(900.0, 3.0) * (1.0 - sig(SNARE_HI if snare_hi is None else snare_hi, 3.0))
    hat = sig(HAT_LO if hat_lo is None else hat_lo, 4.0)
    cols = [kick, snare, hat]
    if bass_roots == "ratio":
        # a bass note's onset: the same low plateau and harmonics above it (falling as 1/f, no highs), the
        # harmonics' share of the low part rho; the kick has none (its click aside)
        harm = sig(HARM_LO, 6.0) * (np.maximum(fc, HARM_LO) / HARM_LO) ** -1.0 * (1.0 - sig(HARM_HI, 3.0))
        for rho in ABS_RHO:
            cols.append(low / low.sum() + rho * harm / harm.sum())
    else:
        for r in bass_roots:
            cols.append(sig(r * 0.85, 8.0) * (np.maximum(fc, r) / r) ** -0.7 * (1.0 - sig(2500.0, 3.0)))
    cols.append(bump(1200.0, 1.0))
    if SNARE_SPLIT:
        # the snare in two parts: column 1 its noise alone, an extra last column its shell
        cols[1] = sig(900.0, 3.0) * (1.0 - sig(SNARE_HI if snare_hi is None else snare_hi, 3.0))
        cols.append(bump(SNARE_BF, SNARE_BW))
    W = np.stack(cols, axis=1) + 1e-4
    return W / W.sum(axis=0, keepdims=True)


def sr_of(m):
    return m.sr


class New:
    """Causal HPSS (median filters) -> fixed-template NMF activations -> per-drum onset envelopes."""

    name = "new"

    def __init__(self, **kw):
        self.p = dict(fmed=17, tmed=17, beta=1.0, mask_pow=2.0, iters=30, per_oct=4, comp=1.0,
                      thr_k=(2.2, 3.0, 2.2), floor=0.06, rel=0.985, absorbers=True, thr_abs=0.3, sat=3.0, avg_floor=0.03, mode="flux", perc="vmed", fsplit=250.0, clip=False)
        self.sr = 44100
        self.p.update(kw)

    def percussive(self, mags):
        p = self.p
        X = mags.astype(np.float32)
        n = X.shape[0]
        mode = p["perc"]
        if mode == "none":
            return X
        fm = p["fmed"] // 2
        Xpad = np.pad(X, ((0, 0), (fm, fm)), mode="edge")
        P = np.median(np.lib.stride_tricks.sliding_window_view(Xpad, p["fmed"], axis=1), axis=2)
        if mode == "vmed":
            # the vertical median alone (Fitzgerald's percussion-enhanced spectrum) above the split; below it the
            # bins are too coarse to tell a partial from a noise band, the templates decide there
            ks = int(np.floor(p["fsplit"] / (sr_of(self) / N) + 0.5))
            P[:, :ks] = X[:, :ks]
            return np.minimum(X, P) if p["clip"] else P
        L = p["tmed"]
        Xt = np.concatenate([np.repeat(X[:1] * 0, L - 1, axis=0), X], axis=0)
        H = np.empty_like(X)
        for s in range(0, n, 1024):
            e = min(n, s + 1024)
            win = np.lib.stride_tricks.sliding_window_view(Xt[s:e + L - 1], L, axis=0)
            H[s:e] = np.median(win, axis=2)
        b = p["beta"]
        q = p["mask_pow"]
        Pq, Hq = P ** q, (b * H) ** q
        M = Pq / (Pq + Hq + 1e-12)
        return X * M

    def run(self, mags, sr):
        p = self.p
        self.sr = sr
        Xp = self.percussive(mags)
        edges, fc = log_bands(sr, per_oct=p["per_oct"])
        V = np.stack([np.sqrt((Xp[:, k0:k1].astype(np.float64) ** 2).mean(axis=1)) for k0, k1 in edges], axis=1)
        V = V * (4.0 / N)
        if p["comp"] == "log":
            V = np.log1p(p.get("gamma", 100.0) * V)
        elif p["comp"] != 1.0:
            V = V ** p["comp"]
        if p.get("mode", "flux") == "flux":
            act = self.flux_nnls(V, fc)
            return self.envelopes(act), act
        if p.get("online", True):
            act = self.online_nmf(V, fc)
            return self.envelopes(act), act
        W = templates(fc)
        if not p["absorbers"]:
            W = W[:, :3]
        K = W.shape[1]
        # KL-NMF with W fixed: multiplicative updates of the activations, all frames at once (no warm start, so
        # every frame is independent and the C++ can do the same per block)
        Hh = np.full((K, V.shape[0]), 1.0) * (V.sum(axis=1)[None, :] / K + 1e-9)
        Vt = V.T + 1e-12
        Wsum = W.sum(axis=0)[:, None]
        for _ in range(p["iters"]):
            R = Vt / (W @ Hh + 1e-12)
            Hh *= (W.T @ R) / Wsum
        act = Hh[:3].T.astype(np.float32)          # (n, 3)
        return self.envelopes(act), act

    def flux_nnls(self, V, fc):
        """The onset spectrum (the positive rise of every band over the previous block) decomposed onto fixed
        templates by KL multiplicative updates (NMF with fixed bases).  Sustained energy never enters it, so a held
        bass cannot sit in the kick's activation; what a bass note's or a tone's onset adds is taken by the
        absorbers (low + harmonics, no highs; a mid bump)."""
        p = self.p
        lag = p.get("flag", "ref")
        if lag == "ref":
            # the rise over the band's recent PEAK (the old ODF's reference, ~0.65-s release): a wobbling or
            # beating bass stays under its own recent maximum, only new energy rises above it
            prev = np.zeros_like(V)
            r = np.zeros(V.shape[1])
            rr = np.where(fc < p.get("dsplit", 250.0), p.get("drel", 0.95), p.get("drel_hi", 0.0))
            for t in range(V.shape[0]):
                prev[t] = r
                r = np.maximum(V[t], r * rr)
        else:
            Vp = np.concatenate([np.repeat(V[:1] * 0, lag, axis=0), V], axis=0)
            prev = Vp[:-lag] if lag == 1 else np.max(np.stack([Vp[lag - j - 1:len(Vp) - j - 1] for j in range(lag)]), axis=0)
        D = np.maximum(V - prev[:len(V)], 0.0)
        if p.get("white", 0.0) > 0:
            # adaptive whitening (Stowell & Plumbley 2007): every band's rise against the band's own peak-hold
            # level, floored at a share of the loudest band's -- the snare's noise in 1-8 kHz then counts as much
            # as the kick in 60 Hz, instead of a few per cent of a decomposition the low bands dominate
            pk = np.zeros(V.shape[1])
            P = np.zeros_like(V)
            for t in range(V.shape[0]):
                pk = np.maximum(V[t], pk * p.get("wrel", 0.997))
                P[t] = np.maximum(pk, p["white"] * pk.max() + 1e-9)
            D = D / P
        self.level = V.sum(axis=1)
        hl = sh = None
        if p.get("bw", False):
            # the production's bandwidth: the highest band within 40 dB of the loudest (long-term mean); a
            # lo-fi break rolls off at 5 kHz and its hats sit at 2-3 kHz, a full-band mix keeps 6.5 kHz
            lt = V.mean(axis=0)
            top = fc[np.nonzero(lt > lt.max() * 10 ** (-p.get("bw_db", 40.0) / 20.0))[0].max()]
            hl = float(np.clip(top / p.get("bw_div", 2.5), 2000.0, HAT_LO))
            sh = float(np.clip(top * 0.6, 3000.0, SNARE_HI)) if p.get("bw_snare", True) else SNARE_HI
            self.bw = (top, hl, sh)
        W = templates(fc, p.get("bass_roots", "ratio"), hl, sh)
        # each drum's region: the bands where its template is at least a tenth of its peak; the region's level is
        # the sum of the bands' peak-hold references (the old detector's ref_g, on the drum's own bands)
        msk = (W[:, :3] >= 0.1 * W[:, :3].max(axis=0, keepdims=True)).astype(np.float64)
        if p.get("norm", "band") == "band":
            # each drum's characteristic band (kick body, snare noise, hat noise); the activation's share in it
            nb = NORM_BANDS if hl is None else (NORM_BANDS[0], (1000.0, max(sh, 3000.0)), (hl * 0.92, 17000.0))
            msk = np.stack([((fc >= lo) & (fc < hi)).astype(np.float64) for lo, hi in nb], axis=1)
        self.frac = (W[:, :3] * msk).sum(axis=0)
        self.neff = W[:, :3].sum(axis=0) ** 2 / (W[:, :3] ** 2).sum(axis=0)
        ref = np.zeros(V.shape[1])
        reg = np.zeros((V.shape[0], 3))
        after = p.get("reg_after", True)
        for t in range(V.shape[0]):
            if not after:
                reg[t] = ref @ msk
            ref = np.maximum(V[t], ref * p["rel"])
            if after:
                # the level INCLUDING this block: a hit out of silence reads ~1, not rise / 1e-6 (which flooded
                # the running average and deafened the detector for seconds -- the old ODF does that too)
                reg[t] = ref @ msk
        self.region = reg
        if not p["absorbers"]:
            W = W[:, :3]
        K = W.shape[1]
        Hh = np.full((K, D.shape[0]), 1.0) * (D.sum(axis=1)[None, :] / K + 1e-12)
        Dt = D.T + 1e-12
        Wsum = W.sum(axis=0)[:, None].copy()
        # a sparsity penalty on the drums' activations (L1, Virtanen 2007): where an absorber alone explains the
        # rise, it takes it -- the low plateau is shared, so without it the split of a bass onset is arbitrary
        Wsum[:3, 0] += np.asarray(p.get("l1", (0.0, 0.0, 0.0)))
        if p.get("adapt", 0.0) > 0:
            # semi-adaptive drum templates (Dittmar & Gaertner 2014): after each block's activations, one
            # multiplicative step of the drums' columns on that block, blended in at rate adapt and pulled back
            # to the prior at rate pull -- the templates learn this track's kit, the prior keeps them drums
            W0 = W.copy()
            Wc = W.copy()
            thr = p.get("adapt_min", 0.3)
            for t in range(D.shape[0]):
                d = Dt[:, t]
                h = Hh[:, t]
                for _ in range(p["iters"]):
                    h *= (Wc.T @ (d / (Wc @ h + 1e-12))) / Wc.sum(axis=0)
                Hh[:, t] = h
                tot = d.sum()
                if tot > 1e-9:
                    R = d / (Wc @ h + 1e-12)
                    for k in range(3):
                        share = h[k] * Wc[:, k].sum() / (tot + 1e-12)
                        if share > thr:
                            upd = Wc[:, k] * R
                            upd /= upd.sum()
                            Wc[:, k] = (1 - p["adapt"]) * Wc[:, k] + p["adapt"] * upd
                for k in range(3):
                    Wc[:, k] = (1 - p.get("pull", 0.001)) * Wc[:, k] + p.get("pull", 0.001) * W0[:, k]
                    Wc[:, k] /= Wc[:, k].sum()
            self.Wc = Wc
        else:
            for _ in range(p["iters"]):
                Hh *= (W.T @ (Dt / (W @ Hh + 1e-12))) / Wsum
        self.H = Hh
        act = Hh[:3].T.astype(np.float32)
        if SNARE_SPLIT:
            # a snare is shell AND noise: twice their geometric mean (their sum when equal, nothing without either)
            act[:, 1] = (2.0 * np.sqrt(Hh[1] * Hh[-1])).astype(np.float32)
        sl, sh = p.get("share", (0.0, 0.0))
        if sh > sl:
            # classify the onset: the kick's share of what kick and bass absorber took; a bass note's onset gives
            # the kick a third of it, a kick (alone or over a bass) more than half
            share = Hh[0] / (Hh[0] + Hh[3] + 1e-12)
            act[:, 0] *= np.clip((share - sl) / (sh - sl), 0.0, 1.0).astype(np.float32)
        return act

    def online_nmf(self, V, fc):
        """Per block: KL-NMF activations (warm start) for three fixed drum templates and a few absorbers that adapt
        to the music (partially fixed NMF, Wu & Lerch 2015, made online: one multiplicative step on the absorbers
        per block, blended with rate eta).  An absorber must keep a share of its mass in 250-2500 Hz: something
        with harmonics, so a kick-only track cannot teach an absorber to be the kick."""
        p = self.p
        lf = np.log2(fc)
        W0 = templates(fc)
        Wd = W0[:, :3].copy()
        roots = p.get("abs_roots", (55.0, 110.0))
        cols = []
        sig = lambda f, s: 1.0 / (1.0 + np.exp(-(lf - np.log2(f)) * s))
        for r in roots:
            cols.append(sig(r * 0.85, 8.0) * (np.maximum(fc, r) / r) ** -0.7 * (1.0 - sig(2500.0, 3.0)))
        cols.append(np.exp(-0.5 * ((lf - np.log2(1200.0)) / 1.0) ** 2))
        Wa = np.stack(cols, axis=1) + 1e-4
        Wa /= Wa.sum(axis=0, keepdims=True)
        mid = (fc >= 250.0) & (fc <= 2500.0)
        n, B = V.shape
        K = 3 + Wa.shape[1]
        h = np.full(K, 1e-6)
        act = np.zeros((n, 3), np.float32)
        eta = p.get("eta", 0.02)
        min_mid = p.get("min_mid", 0.3)
        iters = p.get("iters", 10)
        for t in range(n):
            v = V[t] + 1e-12
            W = np.concatenate([Wd, Wa], axis=1)
            ws = W.sum(axis=0)
            h = h * 0.5 + v.sum() / K * 0.5 * 0.2 + 1e-9 if p.get("warm", True) else np.full(K, v.sum() / K + 1e-9)
            for _ in range(iters):
                h *= (W.T @ (v / (W @ h + 1e-12))) / ws
            act[t] = h[:3]
            if eta > 0 and v.sum() > 1e-7:
                # one step on the absorbers with the drums' part held: W_a <- W_a * (R h_a^T) / (1 h_a^T)
                R = v / (W @ h + 1e-12)
                ha = h[3:]
                upd = Wa * (R[:, None] * ha[None, :]) / (ha[None, :] + 1e-12)
                Wn = (1 - eta) * Wa + eta * upd
                Wn /= Wn.sum(axis=0, keepdims=True)
                m = Wn[mid].sum(axis=0)
                low = m < min_mid
                if low.any():
                    Wn[mid][:, low]  # no-op for clarity
                    Wn[np.ix_(mid, low)] *= (min_mid / np.maximum(m[low], 1e-9))
                    Wn[np.ix_(~mid, low)] *= ((1 - min_mid) / np.maximum(1 - m[low], 1e-9))
                Wa = Wn
        self.Wa = Wa
        return act

    def envelopes(self, act):
        p = self.p
        n = act.shape[0]
        ref = np.zeros(3, np.float64)
        avg = np.zeros(3)
        cool = np.zeros(3, int)
        env = np.zeros(3)
        out = np.zeros((n, 3), np.float32)
        trig = np.zeros((n, 3), bool)
        odfs = np.zeros((n, 3), np.float32)
        eps = 1e-6
        flux = p.get("mode", "flux") == "flux"
        thk = p["thr_k"] if isinstance(p["thr_k"], (tuple, list)) else (p["thr_k"],) * 3
        lvl = 0.0
        selfpk = np.zeros(3)
        for t in range(n):
            a = act[t]
            if flux and p.get("norm", "band") == "white":
                # already relative: the activation over the template's effective number of bands is the drum's
                # mean relative rise in its bands
                odf = a / self.neff
            elif flux and p.get("norm", "band") == "self":
                # against the drum's own recent peak (another voice's level cannot move it), floored by a share
                # of its band's level (a crumb in music without the drum stays a crumb)
                x = a * self.frac
                selfpk = np.maximum(x, selfpk * p.get("self_rel", 0.998))
                odf = x / (np.maximum(selfpk, p.get("self_c", 0.3) * self.region[t]) + 1e-6)
            elif flux and p.get("norm", "band") == "band":
                odf = a * self.frac / (self.region[t] + 1e-6)
            elif flux and p.get("norm", "band") == "region":
                # the drum's share of the rise against its own bands' level (the old ODF pos_g / ref_g with
                # pos_g replaced by the drum's activation)
                odf = a / (self.region[t] + 1e-6)
            elif flux:
                # the activation is already an onset strength; read it against the music's level (a peak-hold
                # of the summed bands with a ~0.7-s release), so the envelope does not depend on the volume
                lvl = max(self.level[t], lvl * p["rel"])
                odf = a / (lvl * p.get("lvl_k", 0.05) + 1e-7)
            else:
                odf = np.maximum(a - ref, 0.0) / (ref + eps + 0.02 * ref.max())
                ref = np.maximum(a, ref * p["rel"])
            odfs[t] = odf
            for g in range(3):
                if cool[g] > 0:
                    cool[g] -= 1
                elif flux and odf[g] > max(avg[g], p["avg_floor"]) * thk[g] + p["floor"]:
                    # the old rule, but its average floored: a crumb of activation in a mix without that drum
                    # stays a crumb instead of a full-strength hit against a near-zero average
                    s = min(odf[g] / (max(avg[g], p["avg_floor"]) * thk[g] + 1e-4) - 1.0, 1.0)
                    env[g] = max(env[g], s)
                    cool[g] = 12
                    trig[t, g] = True
                elif not flux and odf[g] > avg[g] * p["thr_k"] + p["floor"]:
                    s = min(odf[g] / (avg[g] * p["thr_k"] + 1e-4) - 1.0, 1.0)
                    env[g] = max(env[g], s)
                    cool[g] = 12
                    trig[t, g] = True
                avg[g] = 0.95 * avg[g] + 0.05 * odf[g]
                env[g] *= 0.93
            out[t] = env
        return out, trig, odfs


# ------------------------------------------------------------ truth sets ----
def screen_set(secs=64.0):
    """The screening music's seven mixes and the drums' onset times (loud halves only, where the drums play)."""
    import reactivity
    import make_structure_wav as M
    st, sr = reactivity.voice_stems(secs)
    full = sum(st.values())
    gain = 0.85 / (np.max(np.abs(full)) + 1e-9)
    mixes = {"full": full}
    for v in ("kick", "snare", "hat", "lead", "bass"):
        mixes["no_" + v] = full - st[v]
    q = lambda y: (np.clip(y * gain, -1, 1) * 32767).astype(np.int16).astype(np.float32) / 32768.0
    mixes = {k: q(v) for k, v in mixes.items()}
    cycle, half = 8.0, 4.0
    loud = lambda t: (np.mod(t, cycle) > 0.35) & (np.mod(t, cycle) < half - 0.35)
    on = {"kick": [], "snare": [], "hat": [], "bass": [], "lead": []}
    for b in range(int(secs / M.BAR) + 1):
        bt = b * M.BAR
        for qd in range(4):
            on["kick"].append(bt + qd * M.SPB)
            if qd in (1, 3):
                on["snare"].append(bt + qd * M.SPB)
        for h in range(8):
            on["hat"].append(bt + h * M.SPB / 2)
            on["bass"].append(bt + h * M.SPB / 2)
        for k in range(16):
            on["lead"].append(bt + k * M.SPB / 4)
    on = {k: np.array([t for t in v if t < secs - 0.5 and (loud(t) or k == "lead")]) for k, v in on.items()}
    return mixes, sr, on, {"kick": "no_kick", "snare": "no_snare", "hat": "no_hat"}


def read_midi_onsets(path, tracks):
    """Note-on times in seconds of the named tracks (type-1 MIDI, tempo map honoured)."""
    d = open(path, "rb").read()
    _, ntr, div = struct.unpack(">HHH", d[8:14])
    p = 14

    def vlq(q):
        v = 0
        while True:
            b = d[q]
            q += 1
            v = (v << 7) | (b & 127)
            if b < 128:
                return v, q
    trs = []
    tempos = []
    for _ in range(ntr):
        ln = struct.unpack(">I", d[p + 4:p + 8])[0]
        q, end = p + 8, p + 8 + ln
        p = end
        t, rs, name, notes = 0, 0, b"", []
        while q < end:
            dt, q = vlq(q)
            t += dt
            s = d[q]
            if s == 0xFF:
                ty = d[q + 1]
                ln2, q2 = vlq(q + 2)
                if ty == 3:
                    name = d[q2:q2 + ln2]
                if ty == 0x51:
                    tempos.append((t, int.from_bytes(d[q2:q2 + 3], "big")))
                q = q2 + ln2
                continue
            if s in (0xF0, 0xF7):
                ln2, q2 = vlq(q + 1)
                q = q2 + ln2
                continue
            if s & 0x80:
                rs = s
                q += 1
            hi = rs & 0xF0
            if hi in (0xC0, 0xD0):
                q += 1
                continue
            a, b = d[q], d[q + 1]
            q += 2
            if hi == 0x90 and b > 0:
                notes.append(t)
        trs.append((name.decode("latin-1"), notes))
    tempos = sorted(tempos) or [(0, 500000)]

    def sec(tick):
        s, last_t, last_us = 0.0, 0, 500000
        for tt, us in tempos:
            if tt > tick:
                break
            s += (tt - last_t) * last_us / 1e6 / div
            last_t, last_us = tt, us
        return s + (tick - last_t) * last_us / 1e6 / div
    return {name: np.array(sorted(set(sec(t) for t in notes))) for name, notes in trs if name in tracks}


def break_set():
    """The BreakbeatGenerator's track x: the mix of its stems, the mix without drums / without bass, the MIDI."""
    cache = os.path.join(WORK, "break.npz")
    if os.path.exists(cache):
        z = np.load(cache, allow_pickle=True)
        mixes = {k[4:]: z[k] for k in z.files if k.startswith("mix_")}
        on = {k[3:]: z[k] for k in z.files if k.startswith("on_")}
        return mixes, int(z["sr"]), on, {"kick": "no_drums", "snare": "no_drums", "hat": "no_drums"}
    st = {}
    sr = 48000
    for k in ("drums", "bass", "hooks", "keys", "riffs"):
        st[k], sr = read_wav(os.path.join(BREAK, "x_stems", k + ".wav"))
    full = sum(st.values())
    g = 0.89 / (np.max(np.abs(full)) + 1e-9)
    mixes = {"full": full * g, "no_drums": (full - st["drums"]) * g, "no_bass": (full - st["bass"]) * g,
             "no_riffs": (full - st["riffs"]) * g, "no_keys": (full - st["keys"]) * g}
    mixes = {k: (np.clip(v, -1, 1) * 32767).astype(np.int16).astype(np.float32) / 32768.0 for k, v in mixes.items()}
    on = read_midi_onsets(os.path.join(BREAK, "x.mid"), ("kick", "snare", "break", "bass"))
    os.makedirs(WORK, exist_ok=True)
    np.savez(cache, sr=sr, **{"mix_" + k: v for k, v in mixes.items()}, **{"on_" + k: v for k, v in on.items()})
    return mixes, sr, on, {"kick": "no_drums", "snare": "no_drums", "hat": "no_drums"}


# --------------------------------------------------------------- measures ----
LAT = 0.0     # filled per method: the median lag of matched triggers


def trig_times(trig, sr):
    return [np.nonzero(trig[:, g])[0] * BLOCK / sr + BLOCK / sr for g in range(3)]


def fmeasure(times, truth, tol=0.030, lag=None):
    """F-measure of trigger times against true onsets, after removing the median lag (searched in 0..60 ms)."""
    if len(truth) == 0:
        return float("nan"), float("nan"), float("nan"), 0.0
    if lag is None:
        best = (-1, 0)
        for lg in np.arange(0.0, 0.061, 0.002):
            f = fmeasure(times, truth, tol, lg)[0]
            if f > best[0]:
                best = (f, lg)
        lag = best[1]
    t = np.sort(np.asarray(times) - lag)
    used = np.zeros(len(t), bool)
    hit = 0
    for o in truth:
        i = np.searchsorted(t, o - tol)
        while i < len(t) and t[i] <= o + tol:
            if not used[i]:
                used[i] = True
                hit += 1
                break
            i += 1
    prec = hit / max(1, len(t))
    rec = hit / max(1, len(truth))
    f = 2 * prec * rec / max(1e-9, prec + rec)
    return f, prec, rec, lag


COND = ((0.24, 7.0), (0.20, 7.0), (0.14, 8.0))   # AudioConditioner: peak-hold release (s), slew (1/s)


def condition(env, sr):
    """What the shaders see of a raw envelope (AudioConditioner's drum part without the music and drum gates,
    which multiply every variant alike): a peak hold with the instrument's release, then the slew limit."""
    dt = BLOCK / sr
    out = np.zeros_like(env)
    for g in range(env.shape[1]):
        tau, rate = COND[g]
        k = np.exp(-dt / tau)
        step = rate * dt
        e = sm = 0.0
        for t in range(env.shape[0]):
            e = max(e * k, float(env[t, g]))
            sm = min(e, sm + step) if e > sm else max(e, sm - step)
            out[t, g] = sm
    return out


def locked(env, truth, sr, win=0.12):
    """Mean over the true onsets of the envelope's maximum 0..win s after the onset."""
    b = BLOCK / sr
    vals = []
    for o in truth:
        i0 = int(o / b)
        i1 = int((o + win) / b) + 1
        if i1 <= len(env):
            vals.append(env[i0:i1].max())
    return float(np.mean(vals)) if vals else 0.0


def score(name, run, mixes, sr, on, mute_of):
    """Old or new on one truth set: per drum F, leak, crosstalk.  run(mags, sr) -> (env, trig)."""
    envs, trigs = {}, {}
    for k, x in mixes.items():
        e, t = run(spectra(x), sr)
        envs[k], trigs[k] = condition(e, sr), t
    rows = {}
    tt = trig_times(trigs["full"], sr)
    for g, d in enumerate(DRUMS):
        if d not in on:
            continue
        f, pr, rc, lag = fmeasure(tt[g], on[d])
        full_l = locked(envs["full"][:, g], on[d], sr)
        mute_l = locked(envs[mute_of[d]][:, g], on[d], sr) if mute_of.get(d) in envs else float("nan")
        xt = {}
        for k in envs:
            if k in ("full", mute_of.get(d)):
                continue
            a, b = envs["full"][:, g], envs[k][:, g]
            xt[k[3:]] = float(np.abs(a - b).sum() / max(1e-9, a.sum()))
        # the hit-locked crosstalk: at the other voice's own hits (60 ms or more from any of this drum's), how much
        # of this drum's envelope goes away when that voice is muted -- against the envelope at its own hits
        xl = {}
        for v, tv in on.items():
            if v == d or "no_" + v not in envs:
                continue
            far = np.array([o for o in tv if np.min(np.abs(on[d] - o)) >= 0.06]) if len(on[d]) else np.asarray(tv)
            if len(far) == 0:
                continue
            drop = locked(envs["full"][:, g], far, sr) - locked(envs["no_" + v][:, g], far, sr)
            xl[v] = float(max(0.0, drop) / max(1e-9, full_l))
        rows[d] = dict(F=f, P=pr, R=rc, lag=lag, locked=full_l, leak=mute_l / max(1e-9, full_l), xtalk=xt, xlock=xl,
                       mean=float(envs["full"][:, g].mean()), rate=float(trigs["full"][:, g].sum() / (len(trigs["full"]) * BLOCK / sr)))
    return rows


def run_old(mags, sr):
    e, t, _ = Old().run(mags, sr)
    return e, t


def make_run_groups(grp, **kw):
    m = New(**kw)

    def pre(mags, sr):
        m.sr = sr
        return m.percussive(mags)
    o = Old(grp=grp, pre=pre)

    def r(mags, sr):
        e, t, _ = o.run(mags, sr)
        return e, t
    return r


def make_run_new(**kw):
    m = New(**kw)

    def r(mags, sr):
        (e, t, _), _a = m.run(mags, sr)
        return e, t
    return r


def table(set_name, res_by_method):
    print("\n== %s ==" % set_name)
    print("%-6s %-8s %6s %6s %6s %6s %7s %7s  %s" % ("drum", "method", "F", "P", "R", "lag", "leak", "rate/s", "crosstalk (voice muted: change)"))
    for d in DRUMS:
        for mname, rows in res_by_method.items():
            if d not in rows:
                continue
            r = rows[d]
            xt = " ".join("%s %.2f" % (k, v) for k, v in r["xtalk"].items())
            xl = " ".join("%s %.2f" % (k, v) for k, v in r.get("xlock", {}).items())
            print("%-6s %-8s %6.3f %6.3f %6.3f %6.0f %7.3f %7.2f  %s  | at their hits: %s" % (
                d, mname, r["F"], r["P"], r["R"], r["lag"] * 1000, r["leak"], r["rate"], xt, xl))


def real_tracks():
    """The user's tracks (main checkout's .screen/music, 44.1 kHz mono; read in place, never copied)."""
    return sorted(glob.glob(os.path.join(MAIN, ".screen", "music", "*.wav")))


def cue_demos():
    """(wav, beat times) of the generator demos' PCM copies in .screen/cuebench with their /phos/beat cues."""
    out = []
    lst = [l.strip() for l in open(os.path.join(ROOT, "Tools", "analyser_cue_set.txt")) if l.strip()]
    for cue in lst:
        key = "%s_%s" % (cue.split("/")[3], os.path.basename(cue).replace(".cues.tsv", ""))
        wav = os.path.join(MAIN, ".screen", "cuebench", key + ".wav")
        if not os.path.exists(wav):
            continue
        beats = []
        for line in open(cue, encoding="utf-8", errors="replace"):
            f = line.split("\t")
            if len(f) >= 2 and f[1] == "/phos/beat":
                beats.append(float(f[0]))
        out.append((wav, np.array(beats)))
    return out


def stats_one(path, beats=None, runs=None):
    """Per drum and method: hits per second, mean envelope, the hits' strengths (median, p90), kick hits on beats."""
    x, sr = read_wav(path)
    mags = spectra(x)
    res = {}
    for mname, run in runs.items():
        e, t = run(mags, sr)
        dur = len(e) * BLOCK / sr
        row = []
        for g in range(3):
            idx = np.nonzero(t[:, g])[0]
            st = e[idx, g] / 0.93 if len(idx) else np.zeros(1)
            onb = float("nan")
            if beats is not None and len(beats) and g == 0 and len(idx):
                tt = idx * BLOCK / sr
                d = np.abs(tt[:, None] - beats[None, :] - 0.03).min(axis=1)
                onb = float((d < 0.05).mean())
            row.append((len(idx) / dur, float(e[:, g].mean()), float(np.median(st)), float(np.percentile(st, 90)), onb))
        res[mname] = row
    _SPEC.clear()
    return res


def stats(runs, which):
    items = []
    if "real" in which:
        items += [(p, None) for p in real_tracks()]
    if "cues" in which:
        items += cue_demos()
    agg = {m: [] for m in runs}
    for p, beats in items:
        r = stats_one(p, beats, runs)
        line = os.path.basename(p)[:28]
        for m in runs:
            agg[m].append(r[m])
            line += "  %s " % m + " ".join("%s r%.2f m%.3f s%.2f/%.2f" % (d[0], *r[m][g][:4]) for g, d in enumerate(DRUMS))
        print(line, flush=True)
    print("\nmean over %d files: rate/s, mean envelope, hit strength median / p90, kick hits on the beat grid" % len(items))
    for m in runs:
        a = np.array(agg[m])          # files x drums x 5
        print("%-4s" % m, "  ".join("%s r%.2f m%.3f s%.2f/%.2f b%.2f" % (d, *np.nanmean(a[:, g, :], axis=0)) for g, d in enumerate(DRUMS)))


def write_wavs():
    """The truth sets' mixes as 16-bit WAVs in .screen/drumlab (for PresetEditor --features and the traces)."""
    os.makedirs(WORK, exist_ok=True)
    out = []
    for name, (mixes, sr) in (("screen", screen_set()[:2]), ("break", break_set()[:2])):
        for k, x in mixes.items():
            p = os.path.join(WORK, "%s_%s.wav" % (name, k))
            if not os.path.exists(p):
                w = wave.open(p, "wb")
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(sr)
                w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
                w.close()
            out.append(p)
    print("\n".join(out))
    return out


DRUM_COLS = ("kick_c", "snare_c", "hat_c")


def same_features(exe_a, exe_b, files, env_b=None):
    """Every feature column but the three drums' must be identical between two editors (the analyser's other
    readers keep their inputs bit for bit); the drum columns' means are printed.  Heavy: run it through the lock.

    @return
      The number of files whose other columns differ.
    """
    import subprocess
    work = os.path.join(WORK, "same")
    os.makedirs(work, exist_ok=True)
    qt = r"C:\Qt\6.11.1\msvc2022_64\bin"
    bad = 0
    for f in files:
        rows = []
        for tag, exe, extra in (("a", exe_a, None), ("b", exe_b, env_b)):
            out = os.path.join(work, "%s_%s.csv" % (os.path.splitext(os.path.basename(f))[0], tag))
            env = dict(os.environ, PATH=qt + os.pathsep + os.environ.get("PATH", ""))
            env.pop("KALEIDO_OLD_DRUMS", None)
            if extra:
                env.update(extra)
            subprocess.run([exe, "--features", f, out, "--every", "1"], cwd=os.path.dirname(exe), env=env,
                           capture_output=True, check=True, creationflags=0x00004000 if os.name == "nt" else 0)
            lines = open(out).read().splitlines()
            rows.append((lines[0].split(","), lines[1:]))
        (ha, la), (hb, lb) = rows
        idx = [i for i, c in enumerate(ha) if c not in DRUM_COLS]
        diff = sum(1 for x, y in zip(la, lb) if [x.split(",")[i] for i in idx] != [y.split(",")[i] for i in idx])
        diff += abs(len(la) - len(lb))
        means = []
        for c in DRUM_COLS:
            i = ha.index(c)
            means.append("%s %.3f->%.3f" % (c, np.mean([float(r.split(",")[i]) for r in la]),
                                             np.mean([float(r.split(",")[i]) for r in lb])))
        bad += diff > 0
        print("%-48s other columns: %s  %s" % (os.path.basename(f)[:48], "identical" if diff == 0 else "%d rows DIFFER" % diff,
                                             "  ".join(means)), flush=True)
    print("files with other columns changed: %d of %d" % (bad, len(files)))
    return bad


def check_trace(trace, wav, **kw):
    """The port against the C++: PresetEditor --features WAV x.csv --drum-trace TRACE, the same WAV here."""
    rec = np.fromfile(trace, "<f4").reshape(-1, 16)
    x, sr = read_wav(wav)
    mags = spectra(x)
    e_old, t_old, _ = Old().run(mags, sr)
    m = New(**kw)
    (e_new, t_new, odf), act = m.run(mags, sr)
    n = min(len(rec), len(e_new))
    for g, d in enumerate(DRUMS):
        co = np.abs(rec[:n, 1 + g] - e_old[:n, g])
        cn = np.abs(rec[:n, 4 + g] - e_new[:n, g])
        ho = (rec[:n, 13 + g] > 0.5)
        print("%-5s old env max|diff| %.4f   new env max|diff| %.4f  mean %.5f   hits C++ %d lab %d both %d   act rel.diff p99 %.4f"
              % (d, co.max(), cn.max(), cn.mean(), ho.sum(), t_new[:n, g].sum(), (ho & t_new[:n, g]).sum(),
                 np.percentile(np.abs(rec[:n, 10 + g] - act[:n, g]) / (np.abs(act[:n, g]) + 1e-6), 99)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", default="screen,break")
    ap.add_argument("--stats", default="", help="real,cues: level statistics instead of the truth sets")
    ap.add_argument("--same", default="", metavar="OLD_EXE", help="the other feature columns of an older editor "
                    "(file name in PresetEditor/build/Release) against the current one, on every WAV of the lab")
    ap.add_argument("--write", action="store_true", help="write the truth sets' mixes as WAVs into .screen/drumlab")
    ap.add_argument("--check", nargs=2, metavar=("TRACE", "WAV"), help="the port against a C++ drum trace")
    ap.add_argument("--groups", default="", help="python list of 32 group ids (-1 unused) on the percussive spectrum")
    ap.add_argument("--param", action="append", default=[], help="NAME=VALUE for the new method")
    a = ap.parse_args()
    kw = {}
    for s in a.param:
        k, v = s.split("=")
        kw[k] = eval(v)
    if a.write:
        write_wavs()
        return
    if a.same:
        ed = os.path.join(ROOT, "PresetEditor", "build", "Release")
        files = write_wavs() + real_tracks() + [w for w, _ in cue_demos()]
        sys.exit(1 if same_features(os.path.join(ed, a.same), os.path.join(ed, "PresetEditor.exe"), files) else 0)
    if a.check:
        check_trace(*a.check, **kw)
        return
    methods = {"old": run_old}
    if a.stats:
        methods["new"] = make_run_new(**kw)
        stats(methods, a.stats)
        return
    if a.groups:
        methods["groups"] = make_run_groups(eval(a.groups), **kw)
    else:
        methods["new"] = make_run_new(**kw)
    for s in a.set.split(","):
        if s == "screen":
            mixes, sr, on, mute = screen_set()
        elif s == "break":
            mixes, sr, on, mute = break_set()
            on = {"kick": on["kick"], "snare": on["snare"], "bass": on["bass"]}
        else:
            continue
        table(s, {m: score(m, r, mixes, sr, on, mute) for m, r in methods.items()})


if __name__ == "__main__":
    main()
