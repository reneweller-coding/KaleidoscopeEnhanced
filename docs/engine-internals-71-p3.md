### (71) P3 -- frequency by depth: the bass in the near layer, the highs in the far one

27.11.2026, agent "p3", branch `wt-p3` (from phos-cues b37183e4: the defaults of the morning and the drum separation
of (70) -- audioHat follows the hi-hat).  Plan P3 of docs/PLAN_2026-11-27.md.

**Shipped:** a sixth depth look in ChainLab2D (`depthLook` 6, variants by `depthVar`), the same light in TimeChainLab
and MirrorBilliardLab (`depthLook` 6 there: the subject anchor plus frequency by depth, variant 0), and look 6 as one
outcome of ChainLab2D's rolled `depthLook` in the presets.  Looks 0..5 are untouched, bit for bit (shown below).
The acceptance of the plan (kick in the near half, hat in the far half) is met in direction, but weakly: on the dark
screening picture the look's light is small against the lab's own drift (see "Acceptance").

| what | look 0 -> look 6 (ChainLab2D, screening music, kristallhoehle photo) |
|---|---|
| what look 6 adds, near third / far third (of 255) | 0 -> +2.1 / +0.4 |
| its correlation with the kick, near / far third | -> 0.29 / 0.27 (bass 0.39 / 0.28) |
| its correlation with the hat, near / far third | -> 0.12 / 0.21 |
| per voice, difference of differences, sync near / far | kick 0.14 / 0.06, hat 0.03 / 0.10, bass 0.29 / 0.17 |
| chain_regress --every 6, look 6 pinned | 12 of 12 at 0.000 (6 after a rerun with --wait 40, see below) |
| looks 0, 3, 5 (ChainLab2D), 0 (TimeChainLab), 4 (MirrorBilliardLab), old shaders against new | 5 of 5 bit for bit |
| GPU median ChainLab2D | 0.83 -> 0.85 ms, 120 fps |
| presets | ChainLab2D depthLook -1.17..5.49 -> -1.51..6.49 (look 0 25 %, each look 12.5 %) |

#### The look

The photo's depth (the alpha of tex0/tex1, section (69) T1) splits the picture softly into three layers, and each band
of the music lights one of them -- light and colour only, on the photo's own colours (the chain labs stay "only the
photo", chain_classes.PHOTO_ONLY); the frame, the zoom and the turn never follow the music.

- *Near: the bass.*  `audioKick` (0.7) and `audioBass` (0.3) brighten the near layer by 16..32 % (variant) at full
  strength, and lift it by a quarter of that in the photo's own colour there brought up to full brightness (so a dark
  photo answers too).  And a slight size: the photo is sampled pulled toward its subject (photoFocus where the maps are sure of
  it, else the centre) by 0.8..2.5 % at most, and where that enlarged sample is near it covers what lies behind, so the
  near layer swells over the middle one.  The size follows the slow swell (0.8) and a fifth of the bass (0.2): the rule
  for spatial scales (memory "audio-reactive phase constraint", (3): the swell, at most 0.2 of a slew-limited band
  level); the kick never moves anything.  At rest (silence) the size is 0 and the sample is the chain's own colour.
- *Middle: the mids.*  `audioMid` raises the middle layer's chroma around its luma by up to 50..110 % (variant): its
  own colours grow richer, no colour of its own comes in.
- *Far: the highs.*  `audioHat` (0.8) and `audioHigh` (0.2) set fine round glints into the far layer: jittered
  points in cells of 1/110 .. 1/170 of the height (variant), 20..34 % of the cells lit, each point round with a size of
  its own (rule V8e; the jitter +-0.2 and the radius <= 0.24 keep it inside its cell), a slow twinkle and a drift on
  sceneAdvance; a glint multiplies the colour by up to 2.2..3.2 and adds half of the photo's own colour there (its
  mip 5, brought up to full brightness), so it shows in the dark far parts too.
- *The layers.*  Around the photo's mean depth (fdLayers(): the depth map's 1 x 1 mip, cross-faded like the colour):
  far below mean - h, near above mean + h, h = 0.10..0.18 (variant), soft edges 0.05..0.10.  See "Tried and dropped"
  for why not fixed thirds.
- *Without a map.*  The look is weighted with the photos' share with a map (interpolation * photoDepthAmt.x + ...):
  a photo without a depth map keeps its colour, a cross-fade to or from one fades the look.

Code: `freqDepth()` and `fdLayers()` in Tools/scenegen/gen.py (FREQ_LIB, appended for sources that call freqDepth(,
with the audio uniforms it reads, FREQ_AUDIO); ChainLab2D's depthLookCol() look 6 adds the size at its photo lookup
and calls freqDepth(); TimeChainLab and MirrorBilliardLab call it in main after the walk's sum (`depthLook > 5.5`,
on top of the anchor that `> 3.5` already gives).  Generated: Scene2D/ChainLab2D.frag, TimeChainLab.frag,
MirrorBilliardLab.frag (gen.py: the three are free of drift), Engine/ChainPass/Final_ChainLab2D.frag (make_chainpass).

#### Tools

- `Tools/reactivity.py --voices ... --halves`: the full mix is rendered once more with `KALEIDO_SHOW_DEPTH=1` (each
  scene's depth as grey, white near); per frame the pixels above the frame's median depth are the near half, the
  rest the far half, and amp, sync and hit of every muted voice are measured in each half on its own (measure_halves();
  keys `near`/`far` in the run's json; the console prints them).
- `--against RUN` (with `--halves`, both runs with `KALEIDO_VOICES_KEEP=1`): what a knob does with each voice, per half
  (look_halves()).  In a lab every muted voice reads a few percent from the drift alone (the walk and the flow follow
  the music's advance, the muted run wanders off), and the halves' own numbers drown in it: on ChainLab2D the kick's
  hit in the near half read 0.018 with look 0 and 0.015 with look 6 -- the same within the drift.  Two runs with the
  same rolls (the same `<expr>` knobs, only the look's value differing) drift alike, so the difference of their
  differences, (full - muted) of one run minus (full - muted) of the other, keeps what the look does with the voice:
  its mean size per half (amp, % of full scale) and how well its signed mean follows the voice's hits (sync).
- `--pin NAME=VALUE` for `Tools/chain_regress.py` (pins one more knob of the entry in every combination) and
  `Tools/perf_labs.py` (an `<expr>` per entry: both runs of a comparison need the same exprs, they move the rolls).

#### Tried and dropped

- *Fixed thirds of the depth* (near above 0.58..0.70, far below 0.28..0.40; f989159d).  The maps are stretched per
  photo between the 2nd and 98th percentile, but that does not make the thirds equal: the screening photo
  (kristallhoehle-indigo-fuchsia-2, a cave that recedes) shows in the chain's view a depth of mean 0.21, 90th
  percentile 0.31 (the depth view, 18 s into the run) -- the near layer was nearly empty, and the kick's answer in the
  near half did not grow (hit 0.018 with look 0, 0.015 with look 6).  Now the layers sit around the photo's own mean
  depth (fdLayers()).
- *Light by gain alone.*  The first version multiplied the near layer by 1 + 0.24 x bass and set the glints as
  col x (1 + gl) + 0.3 gl x (the photo's broad colour).  ChainLab2D's picture on the screening photo has a mean of
  18 of 255: what look 6 added to the far third was +0.17 of 255 on average (std 0.15), and its correlation with the
  hats 0.22 -- as with the snare (0.27), which the look does not read.  The glints and the near layer's lift now carry
  the photo's own colour brought up to full brightness (the colour of a coarse mip, so there is no grain to lift)
  -- as the chain lab's glow takes its colour (17.10.2026, "only the photo").
- *Amp and hit per half alone* (measure_halves()): the walk and the flow drift as soon as one voice is muted (the
  music's advance differs), 3..12 % of full scale in the labs, and the look's answer drowns in it.  Kept, but the
  acceptance reads `--against` (see Tools).

#### Acceptance

Screening music of Tools/reactivity.py (the voices' stems, 128 BPM, loud and quiet halves), the snapshot photo
kristallhoehle-indigo-fuchsia-2 (a map, relief 0.32; dark: ChainLab2D's picture has a mean of 18 of 255 on it), seed 7,
the user's settings, `KALEIDO_VOICES_KEEP=1`.  Runs with `--expr depthLook=6,depthVar=0` against
`--expr depthLook=0,depthVar=0` (the same exprs: the same rolls, the same chain).

*Where the look answers which voice* -- what look 6 adds to the picture (its full run minus look 0's full run, the
same music), per frame in the nearest and the farthest third of the pixels by the depth view, correlated with each
voice's onsets (best Pearson over lags 0..6 frames, both high-passed; 290 frames at 30 fps):

| version | layer | mean added (of 255) | kick | bass | hat | lead | snare |
|---|---|---|---|---|---|---|---|
| 1, fixed thirds (f989159d) | near third | +0.71 | 0.24 | 0.30 | 0.08 | 0.03 | 0.15 |
| | far third | +0.17 | 0.22 | 0.18 | 0.22 | 0.14 | 0.27 |
| 2, around the mean depth, own colour (842a3683 without the last glint step) | near third | +2.11 | 0.29 | 0.39 | 0.12 | 0.03 | 0.27 |
| | far third | +0.37 | 0.25 | 0.24 | 0.13 | 0.09 | 0.23 |
| 3, glints 0.8 hat, 20..34 %, half the own colour (842a3683) | near third | +2.12 | **0.29** | **0.39** | 0.12 | 0.04 | 0.27 |
| | far third | +0.43 | 0.27 | 0.28 | **0.21** | 0.11 | 0.26 |

The near layer follows the bass and the kick (0.39, 0.29) and hardly the hat (0.12); the far layer follows the hat
better than the near one does (0.21 against 0.12) -- but it follows the kick, the bass and the snare as much (0.26..0.28):
at 160 x 90 the kaleidoscope interleaves near and far finely, the house's bloom and exposure carry the near layer's
lift into its neighbours, and the mids (bed, lead and snare are in audioMid's band) colour the middle layer, which
the thirds cut through.  The look's own light is small on this dark picture: +2.1 of 255 in the near third, +0.4 in
the far third, on average.

*Per voice, per half (`--halves --against`)* -- the difference of differences: run 3 against look 0, the median split of the depth view (amp in % of full scale, sync as above):

| voice | near amp / sync | far amp / sync | reading |
|---|---|---|---|
| kick | 0.87 / **0.14** | 0.64 / 0.06 | the look's answer to the kick is in the near half |
| bass | 0.92 / **0.29** | 0.78 / 0.17 | near, more than far |
| hat | 0.86 / 0.03 | 0.68 / **0.10** | the look's answer to the hat is in the far half |
| snare | 0.82 / 0.12 | 0.72 / 0.12 | no side (the look reads it only through audioMid) |
| lead | 3.10 / 0.03 | 3.19 / 0.01 | the mids' colour, both halves (amp), not on hits |

By the halves' own numbers (measure_halves(), each run alone) the separation does not show: the kick's hit-locked
change in the near half 0.018 with look 0, 0.018 with look 6, in the far half 0.013 -> 0.016; the hat's 0.010 ->
0.010 near, 0.014 -> 0.015 far -- the walk's drift (amp 3..7 %) is larger than the look's light.  "Without the look
not" therefore reads: the difference of differences is zero by construction for look 0, and the halves' own numbers do
not move between look 0 and look 6 beyond the drift.  **The acceptance is met in direction (kick near 2.3x the far
sync, hat far 3x the near sync), not in size** -- the sync values stay small (0.10..0.29).

*chain_regress --every 6 --pin depthLook=6 --pin depthVar=37* (the runner against the uber shader, 12 combinations):
12 of 12 at 0.000.  The first run read 6 of 12 bad (3 FAIL 6.9..20.7, 3 NO SCREENSHOT) -- all during two other
agents' builds (/m:4): the 600 fixed frames of a comparison run did not finish within the 22-s wait (one runner
frame was half drawn).  The six again with `--wait 40` on a quieter machine: 0 of 6 differ.  Note: a comparison run is
silent (glwidget.cpp: KALEIDO_FREEZE_TIME gives empty features), so this checks the look's static path; its audio
terms are the same text in the runner's final pass and the uber shader (both generated from the one source).

*Looks 0..5 untouched* -- the start state's shaders (b37183e4, put in place by a script and restored) against the new ones,
the app's chain runner, a frozen frame, lehmwurf-fruehling-zinnober-2 (a sure subject), 40-s waits: ChainLab2D looks 0,
3 and 5 (depthVar 37), TimeChainLab look 0, MirrorBilliardLab look 4 -- 5 of 5 pairs bit for bit (max difference 0).
Two pairs got no screenshot (TimeChainLab look 4 old, MirrorBilliardLab look 0 new; the machine ran two other
agents' jobs) and were not repeated.  The code says the same: looks 1..5 and look 0 are textually unchanged in the
generated frags (the diff adds the look-6 branch, three uniform declarations and FREQ_LIB), and the labs' main computes
the same expressions in the same order (`d = dsum / max(ws, 1e-3)` named once).

*Cost* -- Tools/perf_labs.py, 30 s (labs 25 s) live at 2880 x 1620, alone in the lock, the same exprs both
ways, GPU median / p90 ms: ChainLab2D look 0 -> look 6 0.83 / 0.97 -> 0.85 / 1.01; TimeChainLab look 4 -> 6 0.92 /
0.95 -> 0.94 / 0.97; MirrorBilliardLab 1.24 / 1.26 -> 3.33 / 3.49 (the machine, see below); 120 fps in every run.  Look 6 costs
ChainLab2D about 0.02 ms (one more photo read for the size, the glint cells' hashes).

*Sheets* (kaleido-wt\sheets\p3\): `p3_look6_vs_look0_kick_hat.jpg` -- the same frame of the same music, look 0 |
look 6 | difference x4, on a kick and on a hat between the kicks, in variants 0, 13, 37, 64, and the depth view;
`p3_look6_variants_kristallhoehle.jpg` -- per variant the frame where muting the kick (the hat) changes the picture
most: full | muted | difference x4 (mostly the drift of the muted run, see Tools).

*Light limiter* -- the exposure debug lines of every voices run: 0 of 120 samples dimmed, 0 flash-on, with look 0 and
with every version of look 6 (the near layer's lift on the kick stays far from a flash).

#### TimeChainLab and MirrorBilliardLab

`depthLook` 6 there is the subject anchor (> 3.5, as look 4) plus freqDepth() after the walk's sum, variant 0 (these
labs have no depthVar), without the size (their photo lookup sits inside each walk slot's look).  What look 6 adds
against look 4 (run 2 of the light, the same table as above): TimeChainLab near third kick 0.36, bass 0.49, hat 0.14 --
far third kick 0.16, bass 0.17, hat 0.11; MirrorBilliardLab near kick 0.27, bass 0.41 -- far hat 0.21, kick 0.20.  The
near layer answers the bass as in ChainLab2D; the far layer's hat does not separate.  A later pair of runs (labs6c
against labs4) drifted apart by 8..16 % in every voice -- the two runs did not show the same picture, and the reason
was not found in the time.  **Not in the presets**: their rolled range stays 2.83..5.49 (anchor 75 %, off 25 %); look
6 is there for a preset that pins it.  Cost: TimeChainLab 0.92 -> 0.94 ms; MirrorBilliardLab read 1.24 -> 3.33 ms in
one run (p90 3.49, 120 fps) -- a cost that the arithmetic does not explain (one coarse photo read and the glint
hashes); a second run, alone in the lock, read look 6 4.43, look 4 4.68, look 6 3.59 ms (120 fps): the machine's GPU load of the moment, not the look -- look 4 costs as much there.  A quiet-machine measure of the labs is open.

#### Not verified

- The look on other photos than the screening photo (one dark, receding cave) in the voices runs; the sheets show
  only that photo.  A bright photo with a clear near subject should show the near layer's pulse far more strongly.
- The labs' look 6 against its own acceptance (above), and their identity at looks 4 (TimeChainLab) and 0
  (MirrorBilliardLab) -- the screenshots of those two pairs were missing.
- The look by eye over time (a clip): the sheets are single frames.

#### For the user

- Look 6's strengths were set by measurement, not by eye: the near layer +16..32 % (and a quarter of that as a lift in
  its own colour) on the kick and the bass, the glints up to 2.2..3.2 x the colour plus half the own colour.  On a
  dark photo the look stays quiet; on a bright one it may want less.  Switchable: a preset entry with
  `<float name="depthLook" minValue="-1.17" maxValue="5.49">` takes look 6 out of the roll again.
- The near layer's "slight size" follows the slow swell and only a fifth of the bass (the rule for spatial scales);
  the kick moves nothing.  If the size should pulse with the kick, that is a decision against the no-shake rule.
