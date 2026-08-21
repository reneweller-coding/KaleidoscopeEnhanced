# Measuring the music/speech gate

`AudioAnalyzer` publishes `musicPresence`, the master gate that decides whether
the visuals react. Every constant in that classifier comes from the measurement
described here. If you change the classifier, re-run this — the numbers below
are the acceptance criteria, not decoration.

## Why it has to be measured

The gate was broken for a long time in a way that no amount of reading could
reveal: three of its five inputs were saturated constants, so `musicPresence`
read `1.000` for speech and music alike. It looked plausible in source form.
One sweep over a real corpus made it obvious in a single line of output.

Two traps caused the original breakage, and both are easy to fall back into:

* **dB-normalised values cannot be compared as ratios.** `toNorm` maps
  −60…0 dB onto 0…1, so any audible signal already sits past 0.5. `min((subBass
  + bass) * 2, 1)` therefore returned exactly `1.000` for all 45 clips. Taking
  the ratio in the dB domain does not help either: it compresses a 4:1 energy
  difference to about 1.1:1 (measured speech 0.360 vs music 0.359). Spectral
  ratios must come from the **linear** band RMS (`m_sSubBass` …).
* **Attack/release smoothing fills in the pauses.** The release coefficients
  run up to ~1 s. A speech gap is gone before the next word starts, so any
  pause-based feature computed on the smoothed `level` measures nothing.
  `m_envHistory` therefore stores the **raw linear** per-block band sum.

## Building the corpora

Music: 40 excerpts sampled evenly across the library (every *n*-th file
alphabetically, which spreads artists and genres), 40 s from the middle of each
track — intros and fade-outs are not representative.

```bash
ffmpeg -ss <dur/2-20> -t 40 -i in.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 \
       -ac 1 -ar 48000 -c:a pcm_s16le m00.wav
```

Loudness-normalise **both** corpora to −16 LUFS. Without it, mastering
differences leak into the measurement and the classifier can appear to work
while it is really just reading playback volume.

Speech: **real recordings, and enough of them.** This is the part that is
easiest to get wrong. Tuning first ran against four TTS clips plus one real
recording, and the result looked excellent — margin +0.137, leave-one-out
clean. Then ten clips cut from an actual talk stream went through the same
sweep and the margin collapsed to +0.048, because real narration spans a far
wider range than synthesised speech does: `lowEnergy` ran from 0.42 down to
0.20 across one single seven-minute recording, while every TTS clip sat at
0.35–0.55. Synthesised speech pauses more cleanly than any human, which
flatters precisely the feature the gate leans on hardest.

Capture the stream the same way the analyzer hears it. If you must use TTS to
pad the set, mix in a noise floor (`anoisesrc=color=pink:amplitude=0.006`) so
the gaps are not digitally silent — but do not let TTS be the majority.

Hold back a second, disjoint music sample — offset the pick by half a step — and
never tune against it. With five speech clips it is very easy to fit noise, and
the held-out set is the only thing that catches it.

## Running a sweep

```bash
KALEIDO_SPEECH_DEBUG=1 KALEIDO_OFFLINE_FAST=1 Kaleidoscope.exe -c Komplett -w clip.wav
```

* `KALEIDO_SPEECH_DEBUG` prints one line per second with every classifier
  ingredient. Log the **ingredients**, not just the verdict: re-reading the
  numbers a different way then costs nothing, while a sweep costs minutes.
* `KALEIDO_OFFLINE_FAST` drops the real-time pacing and quits at end of file.
  Everything in `processBlock` is per-block, so the analysis is identical —
  only the visuals, which follow the wall clock, become meaningless. A 45-clip
  sweep takes about four minutes instead of half an hour.

Offline analysis is deterministic (verified: 0 differing lines over 3000 blocks
across two runs), which is what makes it a valid oracle. The renderer is not —
it differs from itself run to run, so never A/B the gate by looking at it.

## What the classifier uses

    speechScore = lowEnergy - beatAC - 0.5 * bassRatio + 0.25 * midRatio

| feature      | what it is                                           | speech | music |
|--------------|------------------------------------------------------|--------|-------|
| `lowEnergy`  | share of the 6 s window below half its own mean      | 0.440  | 0.020 |
| `beatAC`     | envelope autocorrelation peak over 0.25–1.5 s lags   | 0.184  | 0.282 |
| `bassRatio`  | linear energy share of the 20–150 Hz bands           | 0.356  | 0.410 |
| `midRatio`   | linear energy share of the 150 Hz–2 kHz bands        | 0.501  | 0.397 |

Every term points the way its physics says it should, which is worth insisting
on: a fitted weight with the wrong sign is a warning that the search found
noise. Signs that flipped between candidate combinations were the tell that the
five-clip speech set was too small to fit anything on.

`beatAC` is what makes the hard cases work. Sparse rap — Tone Loc's "Funky Cold
Medina" in the test set — is speech over a beat with real gaps in it, so it
defeats every spectral test and every pause test. What it has and narration
does not is a period.

`lowEnergy` alone reaches AUC 0.995 but its margin is negative: the best music
track outscores the worst speech clip. The other three terms turn that into a
clean gap.

Features that were tried and did not earn their place: 4 Hz syllable modulation
(AUC 0.66 once computed on the real, smoothed envelope, and by far the most
expensive candidate), spectral flux variance, key clarity, and the existing
`m_sRhythm` (0.679 speech vs 0.729 music — no separation at all).

## Acceptance criteria

Judge against the thresholds the CONSUMER uses, not against 0.5.
`AudioConditioner` maps `musicPresence` through a smoothstep over
**[0.32 … 0.60]**: below 0.32 the visuals stop reacting entirely, above 0.60
they react fully. A gate that clears 0.5 everywhere can still be quietly
throttling half the catalogue.

Measured on 40 tuning tracks, 40 held-out tracks and 15 speech clips:

* every music track scored ≤ −0.038, every speech clip ≥ +0.086
* on the held-out tracks the margin is **larger** (+0.169) than on the tuning
  set (+0.124) — the split generalises rather than memorises
* **0.00 %** of music-seconds fell below 0.60 in either set, so no track ever
  loses reactivity; the lowest any track reached was 0.709 (tuning) and 0.760
  (held-out)
* all 15 speech clips crossed below 0.32 — median after 6 s, slowest 23 s

Two of the real clips climb back above 0.32 afterwards. They come from the most
continuous stretch of the recording, where the speaker barely pauses and
`lowEnergy` falls to 0.20. That is the accepted cost of the bias described at
the end of this file: given a genuinely ambiguous signal, the gate errs toward
treating it as music.

The nearest music track in the held-out set is DNA feat. Suzanne Vega's "Tom's
Diner" — an a cappella vocal, i.e. literally speech-with-pitch, and the standard
hard case in this corner of audio engineering. It still clears the threshold,
but it is the track to watch after any change.

The smoothing is deliberately asymmetric: ~2.5 s toward music, ~5 s toward
speech, chosen by replaying the logged per-second scores through the EMA
offline rather than by rebuilding once per guess. Silencing a song someone is
enjoying is a far worse failure than a talk stream driving the visuals for one
more second, so the gate is quick to trust music and slow to give up on it.
