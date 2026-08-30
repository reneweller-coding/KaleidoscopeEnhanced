# Measuring the mood axes (valence / arousal)

`AudioAnalyzer` publishes `arousal` and `valence` — the two axes of Russell's
circumplex ("Thayer model"). They drive the scene scheduler's mood bias
(`SceneScheduler::moodAccept`), the busyness target, the timing scale, and are
exposed to every shader as uniforms. The scene tags map onto the model's four
quadrants exactly as the DMER literature defines them:

| quadrant | valence | arousal | acoustic correlates (lit.) | scene tag |
|---|---|---|---|---|
| Q1 euphoria | high | high | fast tempo, major, consonant, bright | `bright` |
| Q2 aggression | low | high | loud, dissonant, distorted, percussive | `aggressive` |
| Q3 melancholy | low | low | slow, minor, low flux, muted | `dark` |
| Q4 calm | high | low | slow-moderate, consonant, legato | `calm` |

All 529 scenes, all 29 FX and 82 of 83 transitions carry tags (the untagged one
is Crossfade, the neutral default).

## Why this had to be measured

The axes existed for a long time and looked complete in source form. Measured
over 80 real tracks, valence spanned **0.281 vs 0.277** between happy pop and
funeral doom — a difference of 0.004, i.e. a constant. Because the scheduler
computes `(valence − 0.5)` and valence never exceeded 0.44, the "mood bias" was
in truth a **permanent bonus for dark-tagged scenes**, never a discriminator.
Three of its five ingredients were saturated constants:

* **SFM 0.994 on every track** — computed on the dB-normalised 0..1 bands,
  where every audible signal produces six similar numbers. The
  "ratios-after-dB-compression" trap, third occurrence in this file.
* **Roughness 0.995 on every track** — the scale factor (`ratio * 4`, clamped
  at 1) was so far off that the clamp WAS the output.
* **Mode 0.489..0.490 on every track** — the Krumhansl profile match used a raw
  dot product; the profiles' large means dominate it and the major/minor ratio
  collapses to the constant 41.8/(41.8+44.5).

## Ground truth without labels

No per-track mood annotations exist, so the check uses only tracks whose
character is beyond argument, picked by name before looking at any numbers:

* arousal-high: death metal, thrash, big beat, punk, trance (16 tracks)
* arousal-low: Eluvium, Sigur Rós, Satie, "Ohne dich", "Changes" (6)
* valence-high: "Shiny Happy People", Las Ketchup, Chumbawamba, … (12)
* valence-low: "Ohne dich", "Farewell", Type O Negative, GWAR, … (13)

AUC between those groups is the score. This measures *separation on obvious
cases*, which is the honest claim a handcrafted real-time model can make.

## Results

|  | before | after |
|---|---|---|
| arousal AUC | 0.818 | **0.906** |
| arousal range (track medians) | 0.36..0.65 | 0.08..0.90 |
| valence AUC | 0.744 | **0.821** |
| valence range (track medians) | 0.28..0.44 | 0.19..0.89 |

Extremes after the rebuild, none of them tuned for: lowest arousal = Sigur Rós,
Eluvium, Astral Projection's ambient intro, Schnauss, Satie; highest = Die
Ärzte (live), Apollo 440, P!nk. Lowest valence = Sentenced, The Prodigy,
Pungent Stench; highest = Kalkbrenner, Satie, trance. The Prodigy sitting at
high-arousal/low-valence is Q2 "aggression" — exactly where the literature
puts it.

## The formulas

Per-ingredient AUC decided membership; per-track-median p10/p90 over the corpus
are the normalisation anchors (`nrm(x, p10, p90)`):

    arousal = 0.30·nrm(flux, .019, .086) + 0.30·rhythm
            + 0.22·nrm(bpm, .313, .578)  + 0.18·nrm(sharpness, .279, .326)

    valence = 0.38·nrm(keyClarity, .652, .805) + 0.38·(1 − roughness)
            + 0.24·mode

Dropped after measuring at chance level: AGC-normalised level for arousal
(AUC 0.557 — the AGC exists to remove exactly what that term claimed to
measure), spectral centroid (0.484) and 6-band SFM (0.452) for valence.

This split matches the field's own findings (PVAN and others): arousal lives in
rhythm/flux/tempo and is the easy axis; valence lives in harmony/consonance and
is the hard one for *every* system — deep models included, where valence CCC
routinely lands at half the arousal score or worse.

## The mode term, honestly

Major/minor is the most-cited valence cue in the literature, and it is the one
that resisted three implementations:

1. dot product against Krumhansl profiles → constant 0.49 (profile means
   dominate)
2. proper Pearson correlation → still ~0.53 constant, because **C major and
   A minor contain the same pitches**: the best match over all transpositions
   is always a relative pair
3. tonic-third comparison (chroma weight on the major vs minor third above the
   detected tonic) → standalone AUC 0.458 on this corpus

It stays in at weight 0.24 because the combined valence measures *better* with
it (0.821 vs 0.808), it cannot hurt (measured), and it is the only ingredient
that can respond to cleanly tonal material — solo piano, classical — which a
corpus of produced pop/rock/metal underrepresents. If you touch it, measure
against tracks like the Satie and "Changes" first.

## The colour grade: mood → pixels (mapping canon)

Extraction is only half the pipeline; the STAR literature's second half is the
mapping, and it has one empirically dominant finding (Palmer et al. 2013,
PNAS; Valdez & Mehrabian 1994): music-colour associations are almost entirely
**emotion-mediated** (r ≈ 0.99, cross-cultural), and the canon that follows is

* valence ↑ → warmer/yellower colour, brighter; valence ↓ → bluish, darker, muted
* arousal ↑ → saturation (and movement density, which timingScale already does)
* dissonance → edge sharpness (kiki/bouba, robust across 25 languages)

`Engine/Present.frag`'s global mood grade had the first two **swapped**
(centroid drove temperature, valence drove saturation) — invisible for as long
as valence was a constant. It now follows the canon: valence carries colour
temperature (timbre keeps a 35 % minority say) plus a deliberately small ±8 %
brightness term, arousal carries saturation, and the gated roughness adds up to
+0.15 CAS sharpen on dissonant material. Everything scales with the existing
Mood knob and collapses to a no-op at knob 0 or in non-music mode (gated
inputs sit at their neutral values).

Verified with `KALEIDO_FORCE_MOOD="v,a"` (a dev hook that pins both axes):
four 20 s renders of the same clip through the review preset (ordered scene
order), measured over 40 frames each:

* valence 0.95 vs 0.05: warmth (mean R−B) **+8.8 vs −16.1** — the canon
  direction, strongly visible
* arousal 0.95 vs 0.05 at knob 2.5: mean saturation **0.443 vs 0.060** — the
  low run is near-greyscale; at knob 1.0 the same delta is a subtle +0.03
* the brightness term is intentionally swallowed by the auto-exposure
  (histogram percentiles, ±35 % range) — brightness is owned by the
  photosensitivity chain, and the grade must not fight it

Side effect worth knowing: the auto-config mood buckets (`arousal < 0.33` /
`> 0.66`) were nearly unreachable with the old compressed arousal (0.36..0.65),
so auto-preset effectively sat on Allround. With the rebuilt axis the
Ambient/Galerie/Club buckets actually trigger.

## Re-running

```
KALEIDO_MOOD_DEBUG=1 KALEIDO_OFFLINE_FAST=1 Kaleidoscope.exe -c Komplett -w clip.wav
```

prints one line per second with both axes and every ingredient. The sweep and
evaluation live in the session scratchpad pattern described in
`Tools/speech_gate_corpus.md` — same corpus, same rules: log ingredients, not
verdicts; hold out tracks you never tune against; and treat a saturated
ingredient as a bug in the domain, not a bad weight.
