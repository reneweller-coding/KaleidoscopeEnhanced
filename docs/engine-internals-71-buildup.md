### The build-up signal against the score cues, and a second one (27.11.2026)

Agent "buildup", branch `wt-buildup` from phos-cues 8bc0a0cd.  Agent p2 found (docs/engine-internals-71-p2.md) that
the analyser's build-up (`AudioFeatures::buildUp` -> `audioBuildUp`) reads 0.11 inside the build of the "uplifting"
cue demo and higher in goa's groove (0.59) than in its first build (0.40).  The depth arc (P2), the final pass's held
breath, the scheduler's drop cut and the drop detector's arming all hang on it.  This package measures it against the
generators' score cues, and builds a second signal from what the literature names as the marks of a build-up.

| step | what | result |
|---|---|---|
| measure | Tools/buildup_lab.py: the signal against the Build sections that run into a drop, 41 demos | the old signal: AUC builds vs grooves 0.53 (chance), it FALLS inside the builds (corr. with time -0.09), 10 of 17 drops armed |
| new signal | the groove's bass gone x the top rising (Source/AudioAnalyzer.cpp), port in the lab | EDM builds: AUC 0.53 -> 0.92, rise -0.09 -> 0.50, armed 10 -> 16 of 17, groove time above 0.45 6.3 % -> 0.8 % |
| default | new one only if better on every demo | not on every demo (Cinematic/Ritual crescendos, two breakdowns): **shipped off**, `KALEIDO_OLD_BUILDUP=0` turns it on |

#### What was there

The build-up (AudioAnalyzer.cpp, "Build-up / drop detection") adds four "rises", each a fast average (tau ~1.5 s)
over a slow one (~10 s): onset rate (x0.45 per onset/s), the smoothed spectral centroid (x3), the level ratio
(x0.5, capped), and a leaky snare-roll density (the snare band group's onset envelope, x0.6); times the music gate,
then smoothed (0.5 s up, 1.2 s down).  A value above 0.45 arms the drop detector's vacuum path for 8 s, and the
scheduler cuts on its rising edge past 0.45.

Why it misses: every term is a *change* -- a fast average pulling above a slow one.  It fires where something new
enters (a groove's new layer as much as a build's first snare) and decays while a build goes on, because after a few
seconds the slow average has caught up.  A build-up is not a change but a *state* that ramps: the groove's foundation
taken away while the top climbs toward the drop.

#### The measure (Tools/buildup_lab.py)

The 43 demos of the frozen cue set (Tools/analyser_cue_set.txt; their 16-bit copies and feature files in
.screen/cuebench, as Tools/analyser_vs_cues.py makes them; seconds, not blocks).  From the cues:

- *builds*: the Build section that runs into a drop (a `/phos/drop` cue or a Drop section; a short Break of < 10 s
  between them allowed, the cinematic "vacuum"), from its start (>= 12 s) to the drop.  At most 80 s: the EDM kind
  (Breakbeat block/nuskool/riot/skank/stomp, Psytrance goa, Techno ostgut, Trance uplifting, Berlin School cosmic:
  17 builds in 9 demos).  Longer ones (the Cinematic crescendos of 130-170 s, the Ritual intros of 90-260 s; 11) are
  listed apart as "long".
- *grooves*: the Groove sections (from 12 s on), 35 demos, 8,787 s.

Per demo: `inB`/`inG` the mean in builds / grooves; `auc` P(random build block > random groove block); `aucX` the same
against all time outside the builds (breaks, intros, outros and drops count against it); `rise` the correlation of the
signal with time inside each build (does it climb toward the drop?); `pre` its mean over the last 4 s before the
drop; `arm` drops whose last 8 s see it above 0.45; `falseG` / `falseX` the share of groove time / of all non-build
time above 0.45.

#### The old signal, measured (C++ feature files, every 50 ms)

| demo | inB | inG | auc | aucX | rise | pre | arm | falseG |
|---|---|---|---|---|---|---|---|---|
| BerlinSchool cosmic | 0.27 | 0.62 | 0.05 | 0.30 | -0.30 | 0.21 | 0/1 | 0.825 |
| Breakbeat block | 0.27 | 0.34 | 0.29 | 0.36 | -0.44 | 0.20 | 1/2 | 0.110 |
| Breakbeat nuskool | 0.22 | 0.25 | 0.37 | 0.31 | -0.39 | 0.15 | 0/2 | 0.003 |
| Breakbeat riot | 0.36 | 0.34 | 0.61 | 0.64 | -0.20 | 0.32 | 2/3 | 0.172 |
| Breakbeat skank | 0.67 | 0.30 | 0.88 | 0.89 | 0.92 | 0.95 | 2/2 | 0.083 |
| Breakbeat stomp | 0.48 | 0.36 | 0.74 | 0.77 | 0.94 | 0.66 | 2/2 | 0.099 |
| Psytrance goa | 0.47 | 0.59 | 0.27 | 0.78 | 0.45 | 0.60 | 2/2 | 0.836 |
| Techno ostgut | 0.49 | 0.25 | 1.00 | 0.95 | -0.97 | 0.36 | 1/1 | 0.000 |
| Trance uplifting | 0.26 | 0.28 | 0.53 | 0.50 | -0.84 | 0.22 | 0/2 | 0.000 |
| **mean, EDM builds** | 0.39 | 0.37 | **0.53** | 0.61 | **-0.09** | 0.41 | **10/17** | |
| mean, long builds (11) | 0.23 | 0.18 | 0.54 | 0.63 | -0.06 | 0.21 | 1/11 | |

Outside the builds 5.7 % of the time above 0.45 (mean over 41 demos), 6.3 % of all groove time.  In words: between
builds and grooves the signal is at chance; in six of nine demos it falls while the build runs; it arms the drop
detector for 10 of 17 drops; in cosmic and goa it sits above 0.45 for 83 % of the groove.

#### Candidate inputs (`--features`)

Each causal, per 10-ms block, on the analyser's own 32 log bands (the 2048-point Hann FFT per 480-sample block that
Tools/drum_lab.py computes exactly as the C++), separation on the 9 EDM demos (mean AUC builds vs grooves / mean
correlation with time inside the builds):

| input | auc | rise | |
|---|---|---|---|
| the bass (bands 0..7) under its groove level (the drop detector's measure) | 0.92 (min 0.68) | 0.54 | the groove's foundation taken out |
| the top's share (bands 20..31 in dB of the total) | 0.92 (min 0.47) | 0.64 | |
| the centroid (power-weighted band index) | 0.88 (min 0.36) | 0.56 | |
| the centroid rising (1-s over 6-s average) | 0.69 (min 0.53) | 0.53 | filter sweep |
| the top rising (1-s over 6-s average, in dB) | 0.68 | 0.32 | riser |
| the level rising | 0.29 | -0.31 | builds get *quieter* when the bass leaves |
| the high band flux (onset density proxy) | 0.37 | -0.23 | |

The level ramp and the onset density -- two of the old signal's four terms -- point the wrong way on these demos.

#### The design (Source/AudioAnalyzer.cpp, "The build-up, new")

    gap   = clamp( ( groove - bass_fast - 6 dB ) / 24 dB )      the drop detector's own fast bass and groove level
    c     = clamp( ( centroid_1s - centroid_6s ) / 1.5 bands )  over bands 8..31 (above the bass)
    h     = clamp( ( top_1s - top_6s ) / 3 dB )                 top = bands 20..31 (2.9-16 kHz) in dB of bands 8..31
    raw   = max( gap x ( 0.2 + 0.8 x max( c, h ) ),  0.5 x min( c, h ) ) x musicPresence
    new   = raw smoothed 0.5 s up, 1.2 s down (as the old one)

- *The gap is the context, the rise the build.*  A breakdown also takes the bass out; weighted by the rise, a flat
  breakdown reads 0.2 x gap, a breakdown whose top climbs reads up to 1.  The gap uses the drop detector's state
  (m_dropBassFast, the 45-s groove level), so the build-up and the drop agree on what "the bass is gone" means.
- *Above the bass.*  With the centroid and the top's share over all 32 bands, the bass leaving *is* a brightening:
  the first seconds of every breakdown read as a rising sweep (goa's break 108-114 s: 0.91).  Over bands 8..31 only,
  falseX fell from 8.5 % to 4.1 %.
- *A build that keeps its bass* (Psytrance: goa's second build has the rolling bass up to the drop, only a riser on
  top) counts by the rise alone -- both the centroid and the top rising (min), at half weight: a hat entering a groove
  lifts the top but rarely both for seconds.  With it goa's second build arms (2/2), falseG 0.6 % -> 0.8 %.
- *The old signal still arms the drop detector* and is still computed: the drops (engine-internals (62)) do not move.
- Cost: one pass over 24 bands and four averages per block.

Literature: R. T. Solberg, "Waiting for the bass to drop": correlations between intense emotional experiences and
production techniques in build-up and drop sections of electronic dance music, Dancecult 6(1), 2014 (the build-up's
techniques: bass and kick removed, rising filter sweeps and risers, snare rolls); M. J. Butler, Unlocking the Groove,
Indiana University Press 2006 (the breakdown/build-up/drop form); K. Yadati, M. Larson, C. Liem, A. Hanjalic,
"Detecting drops in electronic dance music: content based approaches to a socially significant music event",
ISMIR 2014 (drops found from the contrast of the segments around a structural boundary -- the same contrast the gap
measures causally).

#### Results (lab port; the C++ against the port: see "Verification")

| demo | inB | inG | auc | aucX | rise | pre | arm | falseG |
|---|---|---|---|---|---|---|---|---|
| BerlinSchool cosmic | 0.03 | 0.02 | 0.71 | 0.34 | 0.21 | 0.07 | 0/1 | 0.000 |
| Breakbeat block | 0.66 | 0.02 | 1.00 | 0.97 | 0.63 | 0.70 | 2/2 | 0.000 |
| Breakbeat nuskool | 0.39 | 0.04 | 1.00 | 0.90 | 0.36 | 0.47 | 2/2 | 0.000 |
| Breakbeat riot | 0.74 | 0.04 | 1.00 | 0.97 | 0.91 | 0.99 | 3/3 | 0.000 |
| Breakbeat skank | 0.60 | 0.02 | 1.00 | 0.95 | -0.04 | 0.43 | 2/2 | 0.000 |
| Breakbeat stomp | 0.47 | 0.05 | 0.99 | 0.92 | 0.65 | 0.62 | 2/2 | 0.000 |
| Psytrance goa | 0.24 | 0.04 | 0.65 | 0.60 | 0.71 | 0.61 | 2/2 | 0.011 |
| Techno ostgut | 0.33 | 0.06 | 0.99 | 0.85 | 0.56 | 0.37 | 1/1 | 0.000 |
| Trance uplifting | 0.22 | 0.04 | 0.92 | 0.79 | 0.55 | 0.33 | 2/2 | 0.000 |
| **mean, EDM builds** | 0.41 | 0.04 | **0.92** | **0.81** | **0.50** | 0.51 | **16/17** | |
| mean, long builds (11) | 0.11 | 0.07 | 0.51 | 0.54 | 0.09 | 0.22 | 4/11 | |

Outside the builds 4.4 % of the time above 0.45 (old 5.7 %), groove time 0.8 % (old 6.3 %); the groove-only demos
(six Breakbeat, the Analemma and Ritual pieces, two ambient) at most 6.6 % (Ritual serpent; old there 0.8 %).

*Where it is worse*, demo by demo (the reason the default stays old):
- aucX of goa (0.78 -> 0.60) and ostgut (0.95 -> 0.85): their breakdowns read high now (the bass gone, the top
  rising as the break opens) -- by the old signal they read low.  Against the grooves both are better or equal.
- skank: the rise inside the build (0.92 -> -0.04) and `pre` (0.95 -> 0.43): its build is loud from its first bar
  and the riser does not climb further; the old onset term climbed with its snare roll.
- uplifting's mean inside the build (0.26 -> 0.22), though the shape is now right (rise -0.84 -> 0.55, auc 0.53 ->
  0.92, both drops armed).
- The long builds (Cinematic crescendos, Ritual intros): aucX 0.63 -> 0.54.  They keep their bass and swell in level
  over minutes -- the old level term saw that; the new signal does not look at the level.

#### Verification

(filled in below once the C++ build has run; see "Not verified" if it is missing)

#### Not done, next steps

- Tell a breakdown from a build inside the gap.  Both lose the bass; the build's top keeps climbing to the drop, the
  breakdown's settles.  The hold above (rise and pre up, falseX up) shows the gain is there once the breakdowns are
  kept out -- e.g. by the time since the gap opened (a build is the LAST 8-30 s of a gap) or by the onset density
  accelerating (the separator's snare hits per second rising: the snare roll that skank's build ends with).
- The crescendos (Cinematic, Ritual): not a level ramp (dropped above).  What the old signal sees there (aucX 0.63)
  should be taken apart term by term from a trace of its four terms before anything is built for them.
- The real tracks: the seven hand-labelled tracks of the drop round (memory note audio-analysis-answer-key) have drop
  times but no build sections; their last 8 s before each drop would give an `arm` count on real music.
- Whether the drop detector should be armed by the new signal (16/17 vs 10/17 armed builds) -- a change to the drop
  numbers of (62), to be measured with Tools/analyser_vs_cues.py.

#### For the user

- Switch the new build-up on by default?  It is far better on the EDM builds (the shape the depth arc, the breath and
  the drop cut want: low in the groove, climbing to the drop) and worse on slow crescendos and on some breakdowns.
  `KALEIDO_OLD_BUILDUP=0` shows it in the app.

#### Tried and dropped

All in the lab (`--param`; the experimental knobs stay in Tools/buildup_lab.py, default off, not in the C++):

- Centroid and top share over all 32 bands: the bass leaving reads as a sweep (falseX 7.8 % against 4.1 % above the
  bass, both with the floor 0.2; 8.5 % against 5.2 % with 0.35).
- A floor of 0.35 for the gap (a breakdown reads 0.35 without any rise): falseX 5.2 % against 4.1 %; 0.2 kept.
- The rise alone without a gap at weight 0.5 with max( c, h ): falseG 0.6 % -> 6.8 %; with min( c, h ) 0.8 %.
- Centroid scale 1.0 band instead of 1.5: rise +0.05, falseX +1.3 points; 1.5 kept.
- The old snare-roll density times the gap (`w_roll` 0.6 / 0.9, the band-group snare envelope ported from
  drum_lab.Old): EDM aucX 0.81 -> 0.81 / 0.82, rise 0.50 -> 0.50 / 0.47 -- nothing; skank's late climb is not in it.
- Holding the rise while the gap lasts (`hold` 4 / 10 s, so that a riser that has stopped climbing still counts):
  rise 0.50 -> 0.57 / 0.59, pre 0.51 -> 0.57 / 0.61, but falseX 4.4 % -> 5.6 / 6.5 % -- the breakdowns hold too.
  The most promising of the dropped ones; with a break/build distinction it may come back.
- A slow loudness ramp for the crescendos (`w_lvl` 0.5 / 0.8, 4-s over 20-s / 40-s level): long builds' aucX at best
  0.65 (old 0.63), but groove time above 0.45 9.5-28 % and EDM AUC 0.41-0.68 -- every intro and every new layer is a
  ramp.  The old signal's 0.63 on the crescendos is not a level effect alone.
