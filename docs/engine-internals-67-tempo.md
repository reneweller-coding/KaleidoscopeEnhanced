### Block A -- tempo and beat (A0-A3)

The plan (docs/PLAN_2026-11-20.md) began with the tempo: right within 4 % in 49 % of the rhythmic time of the 43
annotated demos, and the beat phase never measured at all.

- *A lab first* (`Tools/tempo_lab.py`).  `PresetEditor --features ... --tempo-trace FILE` writes, for every 10-ms block,
  what the tempo sees and what it published (`AudioAnalyzer::M_TempoTrace`, 14 float32: the SuperFlux samples, the
  kick and its interval, track change, the autocorrelation's tempo and confidence, the published tempo and phase, the
  kick tempo and its explained share), and three new feature columns `beat_phase`, `beat_phase_c` (the conditioner's
  PLL, what the shaders see) and `beats`.  The lab replays a method in Python on those inputs and scores it exactly
  like `tempo_vs_cues.py`: 37 s per method (10 s with four workers) instead of a build and minutes of analysis.  The
  port of the method of 10.11. matched the C++ in every demo (no demo with more than 1 % of its blocks off by
  0.5 BPM) and reproduced the table to the percent.  `--real` scores seven real tracks against `Tools/tempo_truth.tsv`
  (the values come from the analyser's medians and a whole-track autocorrelation where both agree, Ironic's 114 from
  the documentation; *the user has still to confirm them*), `--calm` the confidence on nine calm tracks (three
  Noctuary renders, five additive-synth demos, the chord test track).
- *A0, the move.*  The autocorrelation and the fusion with the kicks went into `Source/TempoTracker.{h,cpp}` unchanged:
  the feature files and traces of the 41 beat demos and the seven real tracks (82 files) were byte-identical before
  and after, analyzer_regress as the baseline, self test 127 of 127.  All inputs are known before the old
  autocorrelation section, and nothing between it and the fusion read the tempo, so one `update()` per block keeps
  the order.
- *A1, a yardstick for the phase* (`Tools/beat_vs_cues.py`).  F-measure (+-70 ms), CMLt and AMLt after Davies, Degara &
  Plumley 2009 (the definitions of mir_eval), for the kicks, the analyser's phase and the PLL, plus "hold": annotated
  beats inside stretches of 8 s or more without a kick, phase within an eighth of a beat.  Baseline over 25,034 beats:
  the PLL F 27.5 %, CMLt 20.7 %, AMLt 28.0 %, hold 26 % -- chance is 25 %.
- *A2, the tempo by pulse trains* (`TempoTracker::choose()`).  Candidates: the strongest five peaks of the
  autocorrelation over the last 12 s and their x2, /2, x3/2, x2/3; each scored by a pulse train laid over the onset
  envelope at its best phase -- how far the envelope at the pulses stands above its mean over all phases (Percival &
  Tzanetakis 2014) -- plus 0.3 x the trains at twice and half the period, times the old prior around 120 BPM.  The
  gate (peak, prominence, kurtosis of the 4-s window) is untouched.  Tried in the lab: the plain pulse train (64 %
  right but Astrix 97 -> 88 %, Ironic 28 -> 0: they switched to their 3:4 and dotted readings), half-beat pulses,
  an 8-s window, only binary relatives, no prior, a wider prior, without the kicks' 3:2 (identical on the demos),
  margins 1.15/1.25/1.35, multi-level weights 0.3/0.5.  Kept: multi-level 0.3, and a reading outside the 4-s pick's
  octave family must score 1.25 times as high.  Measured (tempo_vs_cues.py): right 49 -> 66 %, 90..135 BPM 81 -> 87 %,
  over 135 78 -> 80 %, under 90 25 -> 51 % (on the beat grid 60 -> 69 %, A4: the fold stays), folded 55 -> 74 %.
  Real tracks: Astrix 97 -> 98, Daft Punk 100, DMT 92, Kadafi 80 -> 93, Prodigy 97 -> 100, Thunderstruck 100.
  *Worse: Ironic 28 -> 14 %* (the plan asked for 48).  Every source reads its ternary grid -- the autocorrelation,
  the pulse trains and the kick intervals all say 171 or 86 -- so either the music's pulse really is ternary or its
  truth of 114 is wrong; the user can tell by ear.  Calm material: the confidence exactly as before (the gate is the
  same).  Features run 4.6 s (4.8 before).  self test 127/127, check_schedule 20 plans without a violation.
- *A3, the beat phase by beat tracking* (`TempoTracker::beatStep()`).  The phase restarted at every kick and ran at the
  tempo in between: a syncopated kick moved it off the beat, a break let it drift.  Now BTrack's cumulative score and
  predicted beat (Stark, Davies & Plumley 2009) on the SuperFlux envelope and the published tempo, with the paper's
  constants (alpha 0.9, tightness 5); tap tempo and the external clock still win.  A second lab
  (`Tools/beat_lab.py`) replays phase methods and the conditioner's PLL in Python (the PLL model matches the C++ column
  in all but 0.07 % of the blocks; the C++ build reproduces the lab to the digit).  Through the PLL: F 27.9 -> 48.5 %,
  CMLt 25.8 -> 43.8 %, AMLt 32.9 -> 61.1 %; hold 25 -> 39 % -- better than chance, but not "held", which the plan asked
  for.  Tightness 2 and 3 measured within two points.  No pulse on calm material (the conditioner's beat pulse equal or
  lower on all nine calm tracks).  One baseline change accepted: broadband120's conditioned beat pulse p90 0.718 ->
  0.645 (the PLL's pulse now falls on the kicks instead of between them).
  *A slip on the way:* the first lab version predicted the next beat right after a beat instead of half a beat later;
  it looked as if a lead of 80 ms helped (F 40.8 %).  With BTrack's scheduling no lead is needed (48.6 %), and the
  same lead on the old kick phase made it worse (27.9 -> 22.7 %) -- the gain was the tracker's, the "lead" only
  repaired the slip.
- *A5, section boundaries on the bar grid -- tried and dropped.*  The idea: with a trustworthy phase, a novelty
  peak near a phrase boundary counts more.  Re-simulated from the per-block novelty and the conditioner's 8-bar
  phrase position on the 43 demos (scored like `analyser_vs_cues.py`): a lower threshold near the phrase boundary
  and a higher one elsewhere found more boundaries (best: 48 -> 53 %, Groove 37 -> 42 %) but always invented more as
  well (58 -> 58..74 %), and the plan forbade more false alarms.  The re-simulation itself over-triggers against the
  real detector (it lacks the absolute-novelty floor: 136 found, 180 invented, against the analyser's 125 and 132),
  so not even its gain is certain.  The detector stays as it is (sections 44 % found, 52 % invented, Groove 31 %).
  Timing was never the bottleneck: a boundary counts as found 2 s before to 6 s after it, and the detector fires
  within about two seconds; what it misses, it misses because the novelty stays below its threshold.
