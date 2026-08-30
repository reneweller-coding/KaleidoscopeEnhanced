# -*- coding: utf-8 -*-
r"""Synthesise the review bench's audio: bright, energetic, deterministic.

    python Tools/make_test_song.py            # -> Tools/review128.wav

TestAlle analyses a fixed WAV instead of listening (AudioFile= in the preset),
because a review has to show the same scene the same way twice and live audio
cannot do that. Which WAV is not a detail: nearly every scene in the catalogue
reads the music and dims itself for quiet, calm, ambient material. The first
bench track was a 120 BPM broadband drone, and the engine classified it
val 0.63 / arousal 0.05-0.46 -- the CALM quadrant, with spectral flux around
0.01. Scenes answered exactly as they should have, and half the catalogue was
judged at a mean frame luminance of 0.01-0.15. Reviewing shaders in the dark
is not reviewing them.

So this track is built to land in the BRIGHT quadrant (valence and arousal
both high) and to stay there:

  * 128 BPM, four-to-the-floor, with off-beat hats and a backbeat snare, so
    beat detection and tempo lock have something unambiguous to hold on to.
  * A major-key chord bed that MOVES (I - V - vi - IV, one bar each). Chord
    changes are what spectral flux measures; the old drone had none, which is
    why its flux read as zero and its arousal stayed low.
  * A bright lead an octave up, and hats with real high-frequency content, to
    raise the spectral centroid -- the engine's brightness/sharpness features
    are centroid-driven.
  * Level held around -12 dBFS RMS with peaks near -1, so the AGC settles
    quickly and the level-driven scenes are not left waiting.

Deterministic on purpose: a fixed seed, no randomness that varies per run, so
two renders of the same shader can be compared frame by frame.
"""
import math, os, struct, wave
import numpy as np

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SR   = 48000
BPM  = 128.0
BARS = 16                      # 16 bars at 128 BPM = 30.0 s
SPB  = 60.0 / BPM              # seconds per beat
N    = int(round(BARS * 4 * SPB * SR))
rng  = np.random.default_rng(20260830)   # fixed: the bench must be repeatable

t    = np.arange(N) / SR
out  = np.zeros(N, dtype=np.float64)

def add(sig, start, gain=1.0):
    """Mix sig in at sample offset start, clipped to the buffer."""
    i = int(start)
    if i >= N:
        return
    n = min(len(sig), N - i)
    out[i:i+n] += gain * sig[:n]

def env(n, attack, decay):
    """Percussive envelope: short linear attack, exponential decay."""
    a = max(1, int(attack * SR))
    e = np.exp(-np.arange(n) / (decay * SR))
    e[:a] *= np.linspace(0.0, 1.0, a)
    return e

def kick(dur=0.28):
    n = int(dur * SR)
    # Pitch sweep 110 -> 45 Hz: the click is what onset detection latches on to.
    f = 45.0 + 65.0 * np.exp(-np.arange(n) / (0.035 * SR))
    ph = np.cumsum(2 * math.pi * f / SR)
    return np.sin(ph) * env(n, 0.001, 0.09)

def snare(dur=0.22):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # A touch of 190 Hz body so it reads as a drum, not just noise.
    body = np.sin(2 * math.pi * 190.0 * np.arange(n) / SR)
    return (0.75 * noise + 0.35 * body) * env(n, 0.001, 0.055)

def hat(dur=0.06):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # One-pole high-pass, twice: keeps the energy up where the centroid lives.
    for _ in range(2):
        noise = np.diff(np.concatenate(([0.0], noise)))
    return noise * env(n, 0.0005, 0.012)

# --- Harmony -------------------------------------------------------------
# C major: I - V - vi - IV. Real chord CHANGES, which is what flux measures.
A4 = 440.0
def note(semis_from_a4):
    return A4 * (2.0 ** (semis_from_a4 / 12.0))
CHORDS = [                      # semitone offsets from A4
    [-9, -5,  -2],              # C  E  G
    [-2,  2,   5],              # G  B  D
    [ 0,  3,   7],              # A  C  E
    [-4, -1,   3],              # F  A  C
]

bar_len = 4 * SPB
for b in range(BARS):
    chord = CHORDS[b % 4]
    n = int(bar_len * SR)
    seg = np.zeros(n)
    for k, semi in enumerate(chord):
        f = note(semi)
        # Two octaves: the upper one carries the centroid.
        for octave, g in ((1.0, 0.55), (2.0, 0.30), (4.0, 0.12)):
            seg += g * np.sin(2 * math.pi * f * octave * np.arange(n) / SR)
    # Soft bar-length swell so the level is not perfectly static.
    seg *= 0.28 * (0.80 + 0.20 * np.sin(math.pi * np.arange(n) / n))
    add(seg, b * bar_len * SR)

# --- Lead: an eighth-note arpeggio, an octave up -------------------------
for b in range(BARS):
    chord = CHORDS[b % 4]
    for e8 in range(8):
        semi = chord[e8 % 3] + 12
        dur  = SPB * 0.5
        n    = int(dur * SR)
        f    = note(semi)
        sig  = (np.sin(2 * math.pi * f * np.arange(n) / SR)
                + 0.35 * np.sin(2 * math.pi * 2 * f * np.arange(n) / SR))
        add(sig * env(n, 0.004, 0.10) * 0.22,
            (b * bar_len + e8 * SPB * 0.5) * SR)

# --- Drums ---------------------------------------------------------------
for b in range(BARS):
    for beat in range(4):
        pos = (b * bar_len + beat * SPB) * SR
        add(kick(), pos, 0.95)                     # four to the floor
        if beat % 2 == 1:
            add(snare(), pos, 0.42)                # backbeat on 2 and 4
        add(hat(), pos + 0.5 * SPB * SR, 0.30)     # off-beat hats
        add(hat(), pos, 0.14)

# --- Level ---------------------------------------------------------------
# Peak first, then check RMS: the engine's AGC settles faster on a track that
# is already near broadcast level than on one it has to lift.
# Peak-normalising a percussive mix leaves the RMS ~20 dB down (high crest
# factor) -- and RMS is what the engine's level, AGC and arousal see, not peak.
# So set the RMS first and let a soft limiter hold the transients: tanh rounds
# the kick tops instead of clipping them, which also lifts the centroid a
# little, and the centroid is what the brightness features read.
out /= max(1e-9, np.max(np.abs(out)))
target_rms = 10 ** (-12.0 / 20.0)
cur = math.sqrt(float(np.mean(out ** 2)))
out *= target_rms / max(cur, 1e-9)
drive = 1.6
out = np.tanh(out * drive) / math.tanh(drive)
out *= 10 ** (-1.0 / 20.0) / max(1e-9, np.max(np.abs(out)))   # ceiling -1 dBFS
rms = math.sqrt(float(np.mean(out ** 2)))
print("peak %.3f  RMS %.3f (%.1f dBFS)  %.1f s"
      % (np.max(np.abs(out)), rms, 20 * math.log10(rms), N / SR))

pcm = np.clip(out, -1.0, 1.0)
pcm = (pcm * 32767.0).astype("<i2")
path = "Tools/review128.wav"
w = wave.open(path, "wb")
w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
w.writeframes(pcm.tobytes()); w.close()
print("wrote", path, os.path.getsize(path), "bytes")
