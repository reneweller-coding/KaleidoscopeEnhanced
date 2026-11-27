### (70) The drums the shaders see -- kick, snare and hi-hat separated

27.11.2026, agent "analyzer", branch `wt-analyzer` (from b0017f84).  The user, on reading I1's finding (section (69)):
"build that in".

**Shipped:** the hat from the separator; the kick and the snare keep the band groups by default (they won on the
synthetic music but not on every measure of the real kit -- see "The decision").  The numbers below compare the
band groups with the separator for all three.

| what | band groups -> separator |
|---|---|
| screening music, onset F-measure of the envelope's hits (+-30 ms) | kick 0.85 -> 0.88, snare 0.39 -> 0.68, hat 0.14 -> 0.86 |
| screening music, leak (envelope at the instrument's hits with it muted / with it) | kick 1.00 -> 1.00, snare 1.00 -> 0.33, hat 0.99 -> 0.38 |
| a sampled breakbeat kit with MIDI truth, F / leak (drums muted) | kick 0.53 / 0.83 -> 0.59 / 0.57; snare 0.47 / 0.55 -> 0.34 / 0.44 |
| 41 files (the user's 7 tracks, 34 generator demos): hits per second | kick 1.53 -> 1.42, snare 1.60 -> 1.79, hat 2.10 -> 1.71 |
| kick hits on the demos' beat grid | 43 % -> 46 % |
| everything else the analyser computes (tempo, beat, bar, drops, build-up, sections, scheduler) | bit for bit (52 WAVs, all other feature columns; three scene plans byte-identical) |
| cost per 10-ms block | see "Cost" |

`KALEIDO_OLD_DRUMS` chooses per drum which keeps the band group: unset = `kick,snare` (the default), `1` all three
(the separator is then skipped), `0` none (all three from the separator), or any of kick/snare/hat by name.

#### The finding

The shaders' `audioKick`, `audioSnare`, `audioHat` (AudioFeatures::onsetKick/Snare/Hat) were onsets of three band
groups of the analyser's 32 log bands (40-180 Hz, 180-1690 Hz, above 1690 Hz): per group the rise of every band over
its peak-hold reference, summed and divided by the group's reference, a spike test against the group's running average
(x 2.2 + 0.06), the strength `odf / (2.2 avg) - 1` clipped to 1, a 120-ms cooldown, a decay of 0.93 per block.  I1
(section (69)) measured on the screening music that none follows its instrument: the bass line drives the kick group,
the lead's sixteenths the snare and hat groups (with the snare muted `snare_c` read 0.304 against 0.303).  The lab
below confirms it on the analyser's own spectra and adds two properties of the design:

- *It hears whatever rises in its band.*  On the screening music the old hat's envelope at its hits keeps 99 % with the
  hat muted; at the lead's notes it reads 84 % of its own hits' level.  The old snare keeps 100 % with the snare muted.
- *Its strength is relative to its own average.*  The hits saturate: on the user's tracks and the demos the median
  strength of a hit is 1.00 for all three groups (p90 1.00).  A group with nothing of its instrument in it still fires
  at full strength on whatever is left -- on an ambient demo without any drum the old hat fires 2.5 times a second.
- *And it is deaf after silence.*  The reference is read before the block it divides: a hit out of silence reads its
  rise over 1e-6, the running average jumps to 10^4 and decays by 0.95 a block -- the detector misses the next
  seconds.  On a test signal of clean kicks every 0.5 s the old kick group found 53 % of them.

#### Who reads the three envelopes

| reader | gets | why |
|---|---|---|
| shaders: `audioKick`/`audioSnare`/`audioHat` (EffectShader.cpp, Scene3DShader.cpp, the chain patch `Tools/patch_chain3d.py`), the formula variables `kick`/`snare`/`hat` (ExprVars) -- 1,469 files read `audioKick`, 100 `audioSnare`, 91 `audioHat` (grep over Scene2D, Scene3D, FX, Engine) | the published envelope (by default: hat new, kick and snare old) | what the task is about |
| AudioConditioner (peak hold, slew, music and drum gate) and through it everything that reads `audio_fx.onsetKick/Snare/Hat`: ComputeFX (particle strikes, ring waves), GpuSims, RenderPipeline's calibration readout, the conditioner's own kick shake amplitude and the kick shockwave ring (`m_kickSmooth`) | the published envelope | all are pictures reacting to a drum hit |
| PresetEditor: `--features` columns kick_c/snare_c/hat_c, the preview's timeline | the published envelope | they show what the shaders get |
| the section detector's frame (`m_secOnsAcc`, only into `M_SectionTrace`) and the build-up's snare roll (`m_bldSnareRoll` -> buildUp -> drops, scheduler) | old (the band groups, `m_onsetEnvGrp`, unchanged) | the brief: tempo, beat, bar, drops, build-up, sections and the scheduler keep their inputs bit for bit |
| TempoTracker, the beat tracker, the drop detector | neither (they never read them: SuperFlux, the bass beat detector, the bass power) | -- |
| CueSelfTest's determinism check (`x.onsetKick == y.onsetKick`) | the published envelope | compares two runs of the same code |

The band groups are therefore still computed every block and the separator runs beside them; `KALEIDO_OLD_DRUMS=1`
skips it.

#### The method (Source/DrumSeparator.{h,cpp}, Tools/drum_lab.py)

Per 10-ms block, on the magnitudes of the analyser's own 2048-point Hann FFT of the mono mix (no FFT of its own, no
look-ahead, nothing but this block and the past):

1. *A percussive spectrum: the median across frequency.*  Above 250 Hz every bin is replaced by the median of the 17
   bins around it -- the percussion-enhancing half of harmonic/percussive separation by median filtering (FitzGerald
   2010; the separation factor of Driedger, Mueller & Disch 2014 is the same comparison made binary).  A tone's
   partial is a peak a few bins wide and falls out; the noise of a snare or a hat is broad and stays.  The other half,
   the median across time, needs future frames to call a note harmonic -- causally a new note has no past and is
   called percussive; measured, the causal time median changed the lead's onset rise by +8 % (it did nothing).  Below
   250 Hz a 21.5-Hz bin cannot tell a partial from a noise band (a 55-Hz sawtooth's harmonics are 2.6 bins apart);
   there the templates decide.
2. *The onset spectrum.*  34 log bands (four per octave, 30 Hz-16 kHz, the bottom ones merged where they share bins),
   RMS of their bins in amplitude units; per band the rise -- positive spectral flux (Bello et al. 2005).  Above 250
   Hz the rise over the previous block; below it the rise over the band's recent peak (release 0.95 a block, ~0.2 s):
   the reference of the old kick group and of SuperFlux's maximum filter (Boeck & Widmer 2013), here across time --
   a wobbling or beating bass stays under its own recent maximum, a kick rises above it.  Sustained energy never
   enters this spectrum, so a held bass cannot sit in the kick's activation (in a decomposition of the magnitude
   spectrum it did: the kick's activation followed the bass gate at 400 against 35 between notes).
3. *Its decomposition onto fixed templates* by the KL multiplicative updates of NMF with the bases held (Lee & Seung
   2001; fixed-template drum NMF as in Dittmar & Gaertner 2014), 30 iterations from a flat start, every block on its
   own.  Five templates over the bands: kick (a plateau 35-200 Hz and a faint 3-kHz click), snare (a shell around
   200 Hz and noise 0.9-9 kHz), hat (noise above 6.5 kHz), and two absorbers for what is no drum -- the free components
   of partially fixed NMF (Wu & Lerch 2015), held fixed here: a bass note's onset (the same low plateau plus
   harmonics 250 Hz-3 kHz falling as 1/f, half the low part's mass) and a tonal mid bump (around 1.2 kHz).  Parametric
   shapes from the instruments' acoustics, not learned from a data set (no downloads; the only drum recordings on
   this machine with a truth are the test sets below).
4. *Per drum an onset function and the old peak picking.*  The drum's activation times its template's mass in its
   own band (kick 35-200 Hz, snare 1-8 kHz, hat 6-17 kHz), divided by that band's level (the bands' peak-hold, 0.985
   a block, INCLUDING this block -- the old reference read before the block made a hit out of silence infinite).
   Then the old rule: a hit when the ODF exceeds `max(average, 0.03) * k + 0.06` (k 2.2 for kick and hat, 3.0 for the
   snare), strength `odf / (max(average, 0.03) k) - 1` clipped to 1, cooldown 12 blocks, decay 0.93 a block.  The
   floor of 0.03 under the running average is the one change in the rule: without it a crumb of activation in music
   that lacks the drum is compared with a near-zero average and fires at full strength.

The output keeps the old envelope's form (a hit sets the strength, 0.93 a block after it), so the conditioner and
every scene see the same kind of signal.

#### The lab and the C++

`Tools/drum_lab.py` computes the analyser's spectra exactly as the C++ does (ring of the newest 2048 samples per
480-sample block, Hann with N-1, k = 0..1024), ports the old detector line by line and runs the new one; `PresetEditor
--features in.wav out.csv --drum-trace FILE` writes per block 16 float32 (time, the old envelopes, the new envelopes,
ODFs, activations, hits).  `python Tools/drum_lab.py --check FILE in.wav` compares: on the screening music the old
port and the C++ agree to 0.0000, the new to 0.0002, with every one of the 72 kick, 38 snare and 105 hat hits in the
same block (the activations within 0.2 % at p99).  [C++ check of the final constants: see "Checks".]

`--set screen,break` scores old against new on the truth sets, `--stats real,cues` gives the level statistics,
`--same OLD_EXE` runs two editors over every WAV of the lab and compares every feature column but the three drums,
`--write` writes the sets' mixes as WAVs.  The method's knobs are parameters of `New` (the dropped variants stay
reachable there for re-measuring, see "Tried and dropped").

#### Ground truth

- *screen*: the screening music (Tools/screen.py) rebuilt from its stems by `reactivity.voice_stems()` -- kick on
  the quarters, snare on 2 and 4, hat on the eighths, a sawtooth bass gated in eighths, the lead in sixteenths, a
  chord bed -- 64 s, seven mixes (full, each voice muted).  The drums' onset times come from the synthesis (only in
  the loud halves, where the drums play).
- *break*: the BreakbeatGenerator's track "x" (`G:\Tools\VRAudio\BreakbeatGenerator\work\x_stems`: drums, bass,
  hooks, keys, riffs; 188 s; float WAVs mixed here) and its MIDI file: 209 kick and 259 snare onsets.  Sampled drums,
  a real kit.  But the drums stem also holds a sliced break (91 slice notes, no labels): its kicks and snares are true
  hits the truth does not list, so precision on this set is a lower bound.  The leak (drums stem muted) is clean.
- The 43 cue demos carry no drum truth (their cues are bars, beats, sections, drops, keys; checked); they give the
  share of kick hits on the `/phos/beat` grid (+-50 ms) and the level statistics, with the user's seven tracks
  (`.screen/music` of the main checkout, read in place).

Measures per instrument: F = onset F-measure of the envelope's hits against the true onsets (+-30 ms, after the best
constant lag in 0..60 ms, which is reported); leak = the envelope's maximum 0..120 ms after each true onset, with the
instrument muted over with it; crosstalk = sum |e_full - e_muted| / sum e_full with another voice muted, and its
hit-locked form (at the other voice's own hits, 60 ms or more from any of this drum's, how much of the drum's
envelope goes away when that voice is muted, against the envelope at its own hits).  Leak and crosstalk are measured
on what the shaders see: the conditioner's drum stage ported (peak hold 0.24/0.20/0.14 s, slew 7/7/8 per second;
the music and drum gates multiply every variant alike and are left out).

#### Before and after

*The screening music* (64 s; rate = hits per second over the whole file, the drums play in half of it):

| drum | | F | P | R | lag ms | leak | rate | crosstalk (change) | crosstalk at their hits |
|---|---|---|---|---|---|---|---|---|---|
| kick | old | 0.846 | 0.78 | 0.93 | 38 | 0.997 | 1.05 | bass 0.12 | bass 0.06 |
| | new | 0.875 | 0.78 | 1.00 | 24 | 0.999 | 1.12 | bass 0.08 | bass 0.01 |
| snare | old | 0.385 | 0.25 | 0.89 | 10 | 1.000 | 1.59 | lead 0.29, bass 0.10 | lead 0.13 |
| | new | 0.675 | 0.52 | 0.96 | 0 | 0.325 | 0.81 | kick 0.60, bass 0.45, hat 0.29 | kick 0.26, bass 0.26, hat 0.22 |
| hat | old | 0.137 | 0.15 | 0.13 | 0 | 0.986 | 1.44 | lead 0.75, snare 0.39 | lead 0.84 |
| | new | 0.855 | 0.80 | 0.92 | 0 | 0.377 | 2.02 | snare 0.22, bass 0.13 | lead 0.02 |

*The breakbeat kit* (188 s):

| drum | | F | P | R | lag ms | leak | rate | crosstalk (change) |
|---|---|---|---|---|---|---|---|---|
| kick | old | 0.533 | 0.40 | 0.80 | 32 | 0.828 | 2.22 | bass 0.31, keys 0.11 |
| | new | 0.594 | 0.48 | 0.78 | 34 | 0.573 | 1.81 | bass 0.34, keys 0.37 |
| snare | old | 0.470 | 0.39 | 0.60 | 22 | 0.550 | 2.15 | keys 0.23 |
| | new | 0.337 | 0.25 | 0.52 | 6 | 0.436 | 2.88 | keys 0.33, riffs 0.13 |

What this says:

- *The hat* follows the hats: F 0.14 -> 0.86, the lead no longer drives it (0.84 -> 0.02 at the lead's notes).
  What stays with the hat muted (leak 0.38) is the snare's white noise above 6.5 kHz -- the synthetic snare is noise up
  to 22 kHz, as loud there as the hat.
- *The snare* follows the snares on the screening music (F 0.39 -> 0.68, leak 1.00 -> 0.33, the lead 0.13 -> 0.00), but
  its crosstalk rose: on the kick's and the bass's hits it lights at about a quarter of its own level (the bass gate's
  hard edge is a broadband click, the kick's attack too).  On the real kit it is worse in F (0.47 -> 0.34; recall
  0.60 -> 0.52, and more hits -- 2.9 a second): this kit's snare is a shell around 220 Hz with little noise above
  1 kHz (measured: its rise at 1-4 kHz is 4-11 % of the shell's), the template's noise plateau does not fit it.
- *The kick* is better in F on both sets, leaks a third less on the real kit (0.83 -> 0.57), and is faster (lag 38
  -> 24 ms on the screening music).  On the screening music it does not get rid of the bass: that bass is a sawtooth
  whose gate opens on every beat, at the kick's own moment, from 0.1 to full in one sample -- an onset in 30-200 Hz
  of half the kick's size, falling where the kick falls.  What tells them apart is the harmonics above 250 Hz (the
  bass's rise has 0.5 of its low part there, the kick's 0.08) -- causally and in the first 20 ms only that.  With the
  kick muted, the bass's onsets still light the kick (leak 1.00); with the bass muted the kick's envelope hardly
  changes (0.08).  The absorber takes about two thirds of the bass onset's activation; the rest exceeds the
  threshold.  Keys (a piano with low notes) light the new kick more than the old (0.11 -> 0.37): the old kick fired
  2.2 times a second at full strength and changed little whatever was muted.

#### The decision

The brief: keep the version that is strictly better than the old one on every measure; the lead (27.11., 12:00): a
drum that stays worse on the real kit ships on the old envelope by default.

- *Hat: the separator.*  Better on every measure of the screening music (F, leak, crosstalk -- as change and at the
  lead's hits); the kit has no hat truth; on the user's tracks its rate is +13 %.
- *Kick: the band group.*  The separator's kick is better in F on both sets, leaks a third less on the kit, is 14 ms
  faster and keeps the user's tracks' statistics exactly -- but on the kit the keys light it three times as much
  (0.11 -> 0.37) and its recall is 0.78 against 0.80.
- *Snare: the band group.*  On the kit F 0.47 -> 0.34.

Both stay one switch away (`KALEIDO_OLD_DRUMS=0`, or `=snare` for the separator's kick alone) and measured; what would
change the decision for the kick is a real-music truth set where the keys' crosstalk is weighed against the leak.

#### Level statistics

Scenes were tuned on the old envelopes.  Their hits are all-or-nothing (median strength 1.00 before and after, p90
1.00 / 0.98), the decay per block (0.93) and the conditioner after it are unchanged, so what can differ is how often
a drum fires and the mean of the envelope:

| files | | kick rate / mean | snare rate / mean | hat rate / mean | kick on beat |
|---|---|---|---|---|---|
| the user's 7 tracks | old | 2.02 / 0.270 | 2.12 / 0.277 | 2.40 / 0.303 | -- |
| | new | 2.02 / 0.270 | 1.92 / 0.238 | 2.72 / 0.324 | -- |
| 41 files (7 tracks + 34 demos) | old | 1.53 / 0.191 | 1.60 / 0.201 | 2.10 / 0.254 | 43 % |
| | new | 1.42 / 0.180 | 1.79 / 0.205 | 1.71 / 0.197 | 46 % |

On the user's seven tracks the kick's rate and mean are the old ones (2.02 / 0.270 both); per track within -13 %
(Prodigy) .. +3 %, Thunderstruck +20 %.  The hat is lower where the old one fired without hats (an ambient demo
without drums: 2.5/s -> 0) and on the lo-fi breakbeat demos, whose hats sit at 2-3 kHz under a roll-off at 5 kHz
(measured: 40-80 dB down above 7 kHz) -- there the new hat goes nearly dark (noir 1.78 -> 0.07/s, haze 2.38 ->
0.36) and the snare template takes those hats (southall snare 1.77 -> 3.95/s, haze 1.63 -> 2.73).

#### What does not change

Measured with all three drums from the separator (the widest change; the shipped default changes only the hat):

- `python Tools/drum_lab.py --same PresetEditor_b0017.exe` (the editor of b0017f84 against this one) over 52 WAVs --
  the lab's eleven mixes, the user's seven tracks, the 34 demos with PCM copies: every feature column but kick_c,
  snare_c and hat_c identical in every row ("files with other columns changed: 0 of 52"; 15 min under the lock).
- `Kaleidoscope.exe --schedule` old against new: Club and Psytrance on the structure track (2 h each), Ambient on the
  screening music (1 h): the three plans byte-identical.
- `Tools/analyzer_regress.py`: "as the baseline" -- the drum columns of its three tracks moved less than its 5 %
  tolerance, so the baseline was not updated (nothing to show in a diff).

#### The picture

`Tools/reactivity.py --voices` on eight scenes (TaikoSilhouettes, BismuthLabyrinth, Voyager, TwinHelixTunnel,
ParticleLifeClusters, LightningStorm, ChainSpiralKaleido, ProfileStill -- the kick, snare and hat leaders of
Tools/scene_voices.tsv and the photo as the floor), run `drums_old` (KALEIDO_OLD_DRUMS=1) against `drums_new` (all
three from the separator), 3 min each.  `hit` = the hit-locked part of the frame change when that voice is muted:

| scene | kick hit | bass hit | snare hit | limiter: dimmed / flash-on samples of 120 |
|---|---|---|---|---|
| TaikoSilhouettes (kick, snare) | 0.078 -> 0.126 | 0.039 -> 0.239 | 0.006 -> 0.027 | 6 / 0 -> 6 / 0 |
| BismuthLabyrinth (kick) | 0.567 -> 0.218 | 0.396 -> 0.306 | 0.013 -> 0.000 | 7 / 0 -> 39 / 5 |
| Voyager (none of the three) | 0.169 -> 0.128 | 0.025 -> 0.026 | 0.014 -> 0.014 | 0 / 0 -> 97 / 0 |
| LightningStorm (kick, snare) | 0.053 -> 0.010 | 0.022 -> 0.018 | 0.030 -> 0.069 | 0 / 0 -> 0 / 0 |
| the other four | unchanged within 0.002 | | | unchanged |

The separator's kick moved the picture the wrong way as often as the right one: TaikoSilhouettes now answers the
bass MORE (the bass's gate edge on the beat, see "Limits"), BismuthLabyrinth's kick answer halved -- and the limiter
dimmed more: BismuthLabyrinth 7 -> 39 samples with 5 flash-limited, Voyager (which reads no drum itself; the engine's
kick shockwave and shake presumably do -- not traced further) 0 -> 97.  One more reason for the default.

*The shipped default* (run `drums_def`, the same eight scenes): every scene's limiter counts identical to the old
run (6/0, 7/0, 0/0, 3/0, 0/0, 0/0, 0/0, 0/0), every voice's hit within 0.002 -- none of the eight reads `audioHat`, so
this only shows that kick and snare are the old ones.  The hat's own picture, eight scenes that read `audioHat`
(ChainSpiralKaleido, DiffractionLab, ChainSinFold, ChainLab2D, CrystalThroatTunnel, DiscoGodrays, PulsarLighthouse,
ProfileStill), runs `hat_old` against `hat_def`: six scenes identical within 0.005 in every voice (their hat term is
small or under the voiceRoles knob); DiscoGodrays hat 0.020 -> 0.025; PulsarLighthouse -- a hat-coloured light,
`0.15 + 1.2 * audioHat` -- follows the hats now (hat hit 0.010 -> 0.046, its snare answer 0.066 -> 0.042), and in
that run its limiter dimmed more: 50 -> 62 of 120 samples, flash-on 0 -> 14 (ProfileStill after it 53 -> 80, it reads
no drum: the limiter's state carries over).  `flash_count.py` on PulsarLighthouse (its own photo and seed): worst
second 0.5 flashes before and after, mean luminance 0.004 both.  [repeatability: see below]

`Tools/flash_count.py` (20 s at 60 fps, the screening music): TaikoSilhouettes 2.5, LightningStorm 2.0,
BismuthLabyrinth 0.5 flashes/s in the worst second, the same with all three drums from the separator as with the
old ones; Voyager 0.5 and BismuthLabyrinth 0.5 with the default against the old.  No second above 3 anywhere.

#### Cost

The whole analysis per 10-ms block, best of three over the self test's 8-s signal (`Kaleidoscope.exe -q`, printed as
"(info)"): 113 us without the separator, 139 us with it -- +26 us a block, 0.26 % of one core.  The first version
cost +120 us: the median across frequency sorted a copy of 17 values for each of ~1,000 bins; a window kept sorted
as it slides (one value leaves, one enters) gives the same median (the C++/lab check found every hit in the same
block before and after) at a fifth of the cost.  The decomposition (30 updates of 5 templates over 34 bands) is the
rest.  The band groups still run (sections, build-up, the default kick and snare); with `KALEIDO_OLD_DRUMS=1` the
separator is skipped.

#### Checks

- `Kaleidoscope.exe -q`: 184 passed, 0 failed.  New: the kick follows clean kicks (100 % against the band groups'
  53 %, nothing on a plucked 1.8-2.8 kHz lead or on hats), the hat the hats (100 % against 7 %; on the lead 0 %
  against 63 %), the snare stays out of the lead; the default publishes the band groups' kick and snare and the
  separator's hat (compared value by value).
- `drum_lab.py --check` on the screening music and the breakbeat kit (C++ trace of the final build): old and new
  envelopes within 0.0001, every hit in the same block (72/52/128 and 340/542/225), activations within 0.24 % at p99.
- `analyzer_regress.py`: as the baseline.  `check_build_lists.py`: in step (56 sources, 60 headers).
  `cgvr_format.py --check` on the changed C++: same.  `temporal_budget.py` 0 errors, `shake_scan.py` 0 new,
  `doc_shaders.py --check` 0, `check_strings.py` OK.
- Not run: `shadercheck.py` (no shader changed), Doxygen (not installed here; the new members are documented), the
  Linux build (DrumSeparator is plain C++17 with <algorithm>/<cmath> only; CMake and .pro list it).

#### Tried and dropped

Each in the lab, on both truth sets (and the demos where it mattered):

- *HPSS with the causal median across time* (FitzGerald's soft mask, Driedger's binary separation): the lead's onset
  rise unchanged (+8 %), the chord bed's +46 % -- a new note has no past.  Dropped for the median across frequency
  alone.
- *NMF on the magnitude spectrum* (fixed templates, also with the absorbers learned online and kept harmonic, a
  minimum 30 % of their mass in 250-2500 Hz): the sustained bass sat in the kick's activation (400 vs 35); the
  learned absorbers left the low bands to the kick template.  Dropped for the onset spectrum.
- *Nested bass absorbers* (harmonic share 0.3, 0.6, 1.2, or one per bass root): the kick plus a steeper absorber
  explains any bass onset as well as the absorber alone -- the split was arbitrary (the bass gave the kick 26-41 %).
  One absorber.
- *An L1 penalty on the drums' activations* (sparse NMF, Virtanen 2007): the absorber took the kick (a kick alone:
  absorber 15.5 against kick 1.1).
- *Log or square-root compression* of the bands, *adaptive whitening* of the rise (Stowell & Plumbley 2007): every
  band counts alike, and the kick could no longer be told from the bass (screening F 0.88 -> 0.55-0.68).
- *Classifying the onset by the kick's share of kick + absorber* (segment and classify, Gillet & Richard 2008):
  screening leak 0.96 -> 0.56, but the kit's kick lost (F 0.51 -> 0.48, leak 0.55 -> 0.64): tuned to one bass.
- *Semi-adaptive drum templates* (Dittmar & Gaertner 2014: each block a multiplicative step towards the observed
  rise, pulled back to the prior): kick and snare worse on both sets (screening kick F 0.88 -> 0.61-0.70).
- *Other snare shapes*: no shell, a larger shell (220-300 Hz), the snare split into shell AND noise (their geometric
  mean), its own band from 150 or 400 Hz: none better on both sets.
- *A lower hat (4.5-5 kHz) and the hat following the production's bandwidth* (the highest band within 40 dB):
  lo-fi hats came back only partly (haze 0.36 -> 0.63/s with the snare kept; 1.80 when the snare's band followed
  too, but then that snare fired 4.7 times a second), and a lower fixed hat collapsed the screening snare (F
  0.05-0.22).
- *A per-drum threshold for the kick* (3.0): no change.  *The rise over the band's peak in all bands* (the old
  reference everywhere): the snare's shell and the hats lost their hits (screening snare leak 0.08 -> 0.55).

#### Limits

- A bass whose notes start with a hard edge on the kick's own beat lights the kick (screening leak 1.00).  Causally,
  in the first 20 ms, only the harmonics above 250 Hz tell them apart, and at half the kick's size the absorber does
  not take all of it.  A kick drum with a sub-bass sine under it (an 808) is the same spectrum as a kick.
- The snare template fits a noisy snare (the screening music's, an electronic clap); a shell-heavy acoustic snare
  (the kit) is found less often than by the old band group.
- Lo-fi productions (a roll-off at 5 kHz) leave the hat without its band.

#### For the user

- *The default is per drum*: the hat from the separator; kick and snare as before.  If you want to see the
  separator's kick (it follows kicks better, leaks less, is 14 ms faster -- and lights on piano/keys onsets more on
  the one real kit measured, and in two of eight scenes the limiter dimmed more), `KALEIDO_OLD_DRUMS=snare`;
  all three from the separator, `KALEIDO_OLD_DRUMS=0`.  A setting in the ini instead of the environment variable
  would be a small step if one of these becomes a choice.
- *Lo-fi music*: on the BreakbeatGenerator's lo-fi demos (rolled off at 5 kHz) the new hat nearly never fires
  (noir 1.78 -> 0.07 hits/s): hat-reading scenes stay quieter there.  On your seven tracks the hat fires 13 % more.
- *More truth would decide the kick and the snare*: a second real kit with stems and MIDI (another generator
  track with separate kick/snare/hat stems) would tell whether the kit measured here is typical.

#### References

- J. P. Bello, L. Daudet, S. Abdallah, C. Duxbury, M. Davies, M. B. Sandler: A tutorial on onset detection in music
  signals. IEEE TSAP 13(5), 2005.
- S. Boeck, G. Widmer: Maximum filter vibrato suppression for onset detection. DAFx 2013.
- C. Dittmar, D. Gaertner: Real-time transcription and separation of drum recordings based on NMF decomposition.
  DAFx 2014.
- J. Driedger, M. Mueller, S. Disch: Extending harmonic-percussive separation of audio signals. ISMIR 2014.
- D. FitzGerald: Harmonic/percussive separation using median filtering. DAFx 2010.
- O. Gillet, G. Richard: Transcription and separation of drum signals from polyphonic music. IEEE TASLP 16(3), 2008.
- D. D. Lee, H. S. Seung: Algorithms for non-negative matrix factorization. NIPS 2001.
- D. Stowell, M. Plumbley: Adaptive whitening for improved real-time audio onset detection. ICMC 2007.
- T. Virtanen: Monaural sound source separation by nonnegative matrix factorization with temporal continuity and
  sparseness criteria. IEEE TASLP 15(3), 2007.
- C.-W. Wu, A. Lerch: Drum transcription using partially fixed non-negative matrix factorization. EUSIPCO 2015.
- C.-W. Wu, C. Dittmar, C. Southall, R. Vogl, G. Widmer, J. Hockman, M. Mueller, A. Lerch: A review of automatic
  drum transcription. IEEE/ACM TASLP 26(9), 2018.
