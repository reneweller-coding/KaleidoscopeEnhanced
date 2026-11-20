# -*- coding: utf-8 -*-
r"""harmonix_key.py -- section boundaries of real tracks as an answer key: the Harmonix Set's annotations, aligned.

The section detector was measured on the 43 demos of our own generators only (Tools/analyser_vs_cues.py).  The
Harmonix Set (Nieto et al., ISMIR 2019; github.com/urinieto/harmonixset) annotates 912 pop, rock, dance, hip-hop and
metal tracks by hand: beats, downbeats and the sections with their kind.  Its audio is not public; whoever owns some of
the tracks can use the annotations.  This finds them in a folder of MP3s ("Artist - Title.mp3"), and writes for each
one that lines up:

    .screen/harmonix/key/<id>.wav         the track as 16-bit PCM (what PresetEditor --features reads)
    .screen/harmonix/key/<id>.cues.tsv    its sections in the format of the generators' cue files
    .screen/harmonix/set.txt              the cue files, for  python Tools/analyser_vs_cues.py @.screen/harmonix/set.txt

    python Tools/harmonix_key.py "C:\path\to\mp3 folder"

Matching: artist and title normalised (accents, case, "(...)", "feat."), the length within 8 s of Harmonix's -- a
game edit or a remix under the same name is a different arrangement.  Alignment: the annotation belongs to Harmonix's
copy of the track, ours may start a few seconds earlier or later.  The annotated beats are laid over the onset
envelope of our audio (spectral flux, 23 ms hop) at every shift within the length difference plus 2 s (the beats are
nearly periodic: a shift by whole beats fits almost as well, so the search must not reach further than the copies can
differ); among the shifts that fit nearly as well as the best, the downbeats decide (align()); the track is taken if
afterwards at least 60 % of the beats sit within 70 ms of an onset peak.
Everything stays in .screen (ignored by git): the audio is the user's, the annotations are fetched from the dataset's
repository (segments/ and beats_and_downbeats/) into .screen/harmonix.
"""
import argparse
import csv
import io
import os
import re
import subprocess
import sys
import unicodedata
import urllib.request

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, ".screen", "harmonix")
KEY = os.path.join(WORK, "key")
BASE = "https://raw.githubusercontent.com/urinieto/harmonixset/master/dataset"
SR = 22050
HOP = 512
MAX_SHIFT = 2.0
LEN_TOL = 8.0


def norm(s):
    """Artist or title reduced for matching."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)|\[.*?\]", "", s)
    s = re.sub(r"feat\..*", "", s)
    return re.sub(r"[^a-z0-9]+", "", s)


def fetch(rel, dest):
    """A dataset file into WORK (once)."""
    if not os.path.exists(dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with urllib.request.urlopen(BASE + "/" + rel, timeout=60) as r:
            io.open(dest, "wb").write(r.read())
    return dest


def decode(path):
    """Mono float samples at SR."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onset_envelope(x):
    """Spectral flux of the log magnitude, one value per HOP, mean removed and scaled to unit spread."""
    n = 1 + (len(x) - 1024) // HOP
    frames = np.lib.stride_tricks.as_strided(x, shape=(n, 1024), strides=(x.strides[0] * HOP, x.strides[0]))
    mag = np.log1p(100.0 * np.abs(np.fft.rfft(frames * np.hanning(1024), axis=1)))
    flux = np.maximum(np.diff(mag, axis=0), 0.0).sum(axis=1)
    flux = np.concatenate([[0.0], flux])
    flux -= np.convolve(flux, np.ones(43) / 43.0, mode="same")   # the local mean (1 s) away: peaks, not loudness
    return np.maximum(flux, 0.0) / (flux.std() + 1e-9)


def align(env, beats, downs, reach):
    """(shift in seconds, the shift the beats alone preferred, share of beats on an onset peak) for ours = Harmonix +
    shift.

    The search runs over +-reach seconds only: the beats are nearly periodic, so a shift by whole beats fits almost as
    well, and over +-15 s the best one fell anywhere.  The copies have the same length to a few seconds -- the shift
    cannot be larger than that difference (plus MAX_SHIFT).  Within it, every shift that fits the beats nearly as well
    as the best (85 %) is a candidate, and the downbeats decide: a bar starts on the strongest onset more often than
    any other beat does (the kick and the crash), which settles the ambiguity of one, two or three beats.
    """
    rate = SR / HOP
    peak = np.maximum(env, np.maximum(np.roll(env, 1), np.roll(env, -1)))   # +-1 frame
    bf = np.round(np.asarray(beats) * rate).astype(int)
    df = np.round(np.asarray(downs) * rate).astype(int)
    lags = np.arange(-int(reach * rate), int(reach * rate) + 1)

    def mean_at(frames, lag):
        idx = frames + lag
        ok = (idx >= 0) & (idx < len(peak))
        return peak[idx[ok]].mean() if ok.any() else 0.0

    score = np.array([mean_at(bf, lag) for lag in lags])
    best = int(np.argmax(score))
    cand = [i for i in range(len(lags))
            if score[i] >= 0.85 * score[best] and score[i] >= score[max(i - 1, 0)] and score[i] >= score[min(i + 1, len(lags) - 1)]]
    pick = max(cand, key=lambda i: mean_at(df, lags[i])) if len(df) else best
    # Hits: a beat within 70 ms of a local onset maximum above the envelope's mean.
    w = int(round(0.07 * rate))
    loc = np.array([env[max(0, k - w):k + w + 1].max() if 0 <= k < len(env) else 0.0 for k in bf + lags[pick]])
    return lags[pick] / rate, lags[best] / rate, float((loc > 1.0).mean())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("folder", help="a folder of 'Artist - Title.mp3' files")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(KEY, exist_ok=True)
    meta = {}
    for r in csv.DictReader(io.open(fetch("metadata.csv", os.path.join(WORK, "metadata.csv")), encoding="utf-8")):
        meta[(norm(r["Artist"]), norm(r["Title"]))] = r
    cues = []
    for f in sorted(os.listdir(a.folder)):
        if not f.lower().endswith(".mp3") or " - " not in f:
            continue
        artist, title = f[:-4].split(" - ", 1)
        r = meta.get((norm(artist), norm(title)))
        if not r:
            continue
        path = os.path.join(a.folder, f)
        x = decode(path)
        diff = len(x) / SR - float(r["Duration"])
        if abs(diff) > LEN_TOL:
            print("%-60s length %+6.1f s: another edit, left out" % (f[:60], diff))
            continue
        hid = r["File"]
        rows = [l.split() for l in io.open(fetch("beats_and_downbeats/%s.txt" % hid,
                                                    os.path.join(WORK, "beats", hid + ".txt"))) if l.strip()]
        beats = [float(r[0]) for r in rows]
        downs = [float(r[0]) for r in rows if len(r) > 1 and r[1] == "1"]
        segs = [l.split(None, 1) for l in io.open(fetch("segments/%s.txt" % hid,
                                                       os.path.join(WORK, "segments", hid + ".txt")))
                if l.strip()]
        shift, beat_only, hits = align(onset_envelope(x), beats, downs, abs(diff) + MAX_SHIFT)
        good = hits >= 0.6
        print("%-60s length %+5.1f s  shift %+6.2f s (beats alone %+6.2f)  beats on onsets %3.0f %%  %s"
              % (f[:60], diff, shift, beat_only, 100 * hits, "ok" if good else "NOT aligned, left out"))
        if not good:
            continue
        key = re.sub(r"[^A-Za-z0-9_]+", "", hid)
        if key in (os.path.basename(c)[:-len(".cues.tsv")] for c in cues):
            key += "_" + norm(f)[:12]              # two copies of one track (another mix of the same length)
        wav = os.path.join(KEY, key + ".wav")
        if not os.path.exists(wav):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                            wav], check=True)
        cue = os.path.join(KEY, key + ".cues.tsv")
        with io.open(cue, "w", encoding="utf-8", newline="\n") as out:
            out.write("# %s -- Harmonix Set %s (%s, %s), shifted %+.2f s onto this copy\n"
                      % (f, hid, r["Genre"], r["BPM"], shift))
            for t, label in segs:
                label = label.strip()
                if label == "end":
                    continue
                out.write("%.3f\t/harmonix/section\t%s\n" % (float(t) + shift, label))
        cues.append(cue)
    io.open(os.path.join(WORK, "set.txt"), "w", encoding="utf-8").write("".join(c + "\n" for c in cues))
    print("%d tracks in %s" % (len(cues), os.path.join(WORK, "set.txt")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
