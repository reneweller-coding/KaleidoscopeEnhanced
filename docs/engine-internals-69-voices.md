### Block I -- more voices of the music in the picture (I1-I3)

Plan 26.11.2026, packages I1, I2, I3 (agent "voices", branch `wt-voices`).

#### I1 -- what each voice does in the picture

*The instrument.*  `Tools/reactivity.py --voices` (B1's tool, a mode of its own).  The screening music
(`Tools/screen.py`: chord bed and lead in both halves of the 8-s cycle, bass and drums in the loud half, 128 BPM) is
rebuilt from its stems -- `voice_stems()` mixes them exactly as `screen.write_wav()` does (the sum differs from the
screening WAV by 3e-5, the 16-bit step) -- and written in seven variants that differ in one voice only: the full
mix, the kick, snare, hat, lead or bass muted, and the lead panned hard left.  The pan puts the lead into the left
channel at twice its amplitude and takes it out of the right, so the mono sum the analysis hears is the full mix's
and only the stereo features move.  One gain for all variants, so every other voice is the same samples in every
file.  A chunk of scenes (24 at most) is rendered once per variant by the video export on the frame clock, 480 x 270
at 30 fps, 12 s per scene, one photo, the same seed and rolls; the windows are cut as in B1 (2 s in, 0.3 s out).
Per scene and voice, the full run against the muted one:

- `amp`: the mean absolute difference, in % of full scale -- everything the voice changes, the drift included (a
  muted kick lowers the music's advance, a scene that flies on it is elsewhere after 10 s).
- `struct`: the same after each frame is normalised to zero mean and unit spread (B1's react_struct): forms, not
  light.
- `sync`: the change the voice adds from frame to frame (|dF| - |dV|, so the drift drops out), high-passed over a
  second, against the voice's own onsets (the rise of its stem's log energy per frame), Pearson, best of lags 0..6
  frames (0..200 ms: envelope rise and slew).  (`sync0`, the same against the onsets moved by half a beat, was meant
  as the chance level; it is none: every voice repeats on the 8th grid, and the lag search reaches the next hit.)
- `hit`: sync times the spread of that high-passed change, in % of full scale per frame -- the size of the part that
  follows the hits.  Added after the first base run of the labs (see "Zero"): a correlation has no size.
- `lr` (the pan): how much brighter the left half got against the right, in %.
- `lim`: the limiter's samples (`KALEIDO_EXPOSURE_DEBUG`, every 3rd frame) with its scale under 0.995, per window.

*Why not one run.*  The rolls are per scene and activation (`KALEIDO_SEED` reseeds per shader and count), but the
analyzer's state carries over: seven variants in one export would start each scene with another history.  Seven
app starts per chunk.

*The controls* (`--set controls`, nine scenes, the full mix rendered a second time for the null pair):

| scene | null pair amp | kick amp / sync | snare | hat | lead amp / struct | bass | pan lr |
|---|---|---|---|---|---|---|---|
| ProfileStill (the photo) | 0.044 | 0.99 / 0.10 | 0.62 / 0.37 | 0.89 / 0.12 | 1.48 / 0.081 | 0.85 / 0.15 | +0.000 |
| TaikoSilhouettes | 0 | 3.51 / 0.45 | 0.19 / 0.24 | 0.22 / 0.21 | 0.65 / 0.084 | 1.06 / 0.14 | -0.000 |
| HyperWarpTunnel | 0 | 2.36 / 0.36 | 0.79 / 0.38 | 4.05 / 0.15 | 6.43 / 0.449 | 4.57 / 0.11 | -0.001 |
| LightningStorm | 0.058 | 6.72 / 0.24 | 1.24 / 0.36 | 2.58 / 0.44 | 9.50 / 0.525 | 9.12 / 0.12 | -0.012 |
| DrumLaneMipLayers | 0.118 | 8.76 / 0.09 | 2.37 / 0.12 | 0.73 / 0.09 | 4.34 / 0.401 | 8.31 / 0.10 | -0.000 |
| CyberGridCity | 0 | 2.04 / 0.17 | 1.53 / 0.48 | 4.08 / 0.18 | 3.91 / 0.179 | 3.13 / 0.08 | -0.002 |
| CounterpointBraids | 0 | 2.53 / 0.15 | 0.45 / 0.06 | 0.68 / 0.11 | 5.70 / 0.317 | 3.68 / 0.25 | -0.065 |
| StereoSearchlights | 0 | 0.46 / 0.23 | 0.24 / 0.52 | 0.85 / 0.13 | 0.52 / 0.041 | 0.62 / 0.21 | -0.175 |
| StereoSpectrum | 0 | 2.91 / 0.21 | 1.80 / 0.21 | 1.27 / 0.12 | 2.45 / 0.187 | 2.87 / 0.01 | +0.049 |

(amp in % of full scale; snare, hat and bass as amp / sync like the kick.)

- *The null pairs are not all zero.*  Six of nine read exactly 0; LightningStorm 0.058 %, DrumLaneMipLayers 0.118 %
  and ProfileStill (which follows LightningStorm in the sweep) 0.044 % -- two runs of the same music are not
  bit-identical in these scenes.  B1's nulls (silence against silence) were.  The null level is therefore 0.12 % amp
  and 0.010 struct; every voice reading of a scene is at least five times that.
- *The engine's own answer is the floor.*  The photo as a scene (ProfileStill) still answers every voice by about
  1 % (exposure, the global hue drift, the house finish), and the snare with a sync of 0.37: the engine itself lights
  on the snare's broadband hit.  "Zero" is measured against that floor, not against the null pair (amp under twice
  the floor and sync under the floor's + 0.10).
- *The known answers show.*  TaikoSilhouettes, whose drums light on the kick, reads kick 3.5 % with a sync of 0.45
  and nothing above the floor in the other voices; CounterpointBraids (melody pitch) reads the lead at 5.7 % / struct
  0.32; LightningStorm's flashes answer snare and hat.
- *The kick and the bass share the analyser's kick.*  The control "a kick scene loses it with the kick muted" holds
  only in part: the frame change of the muted run still follows the kick grid (TaikoSilhouettes 0.55 -> 0.40,
  HyperWarpTunnel 0.58 -> 0.54, CyberGridCity 0.32 -> 0.31).  The screening's bass is a sawtooth at 55-110 Hz gated
  in eighths -- in the kick detector's band (40-180 Hz) and on the same grid; muting the kick leaves the bass's
  onsets.  So the kick's column measures what the kick adds over the bass; a scene that answers `audioKick` reads in
  both columns.  Checked on the stems (numpy, the rise of the 40-180 Hz log energy per 10 ms, loud halves): at the
  kick grid 3.43 in the full mix and 3.37 with the kick muted (elsewhere 0.49 and 0.19); the bass alone 3.28.  The
  kick alone would read 26.7 -- in the mix the bass's sustained energy leaves it little relative rise.
- *A wiring found on the way.*  StereoSearchlights reads `audioStereo` -- the stereo WIDTH, 0..1 -- as a balance
  -1..1 (`float bal = clamp( audioStereo, -1.0, 1.0 )`): any width leans its beams to the right, and the lead panned
  LEFT made the right half brighter (lr -0.175).  BeeWaggleDance (3D) does the same.  Left as they are (for the
  user); `audioStereoBal` is what they meant.

*Zero, and the drift.*  The first base run of the 24 labs read every voice at 7-11 % amp (median 7.0-7.4 % per voice,
and per lab the strongest voice only 1.09 times the weakest): whichever voice is muted, the analyser's state differs,
`sceneAdvance` runs at another pace, the walk reaches its next class at another moment, and after a few seconds the
two runs show different pictures.  amp measures that drift, not the voice.  The hits are what sync can see -- and
the labs hardly follow them (sync median 0.08-0.14, p90 0.15-0.30).  But sync is a correlation without a size: the
photo alone follows the snare at 0.37.  Hence `hit` (above), and "zero" for kick, snare, hat and bass: sync under
0.15, or a hit-locked change under twice ProfileStill's; for the lead (a slow line, no hits) amp and struct under
twice the floor -- which a drifting scene never meets, so the lead's zero is only found in scenes that stand still
enough; for the pan |lr| under 0.10.  The controls and the labs were measured once more with `hit`.

*The analyser's side* (`PresetEditor --features` on the seven variants; the CSV got the columns snare_c, hat_c,
stereo_bal, bar_phase_c).  Mean of the conditioned envelopes in the loud halves, full mix -> voice muted:

| signal | full | muted | quiet halves (no drums at all) |
|---|---|---|---|
| `audioKick` (kick muted) | 0.350 | 0.356 | 0.010 |
| `audioKick` (bass muted) | 0.350 | 0.333 | 0.010 |
| `audioSnare` (snare muted) | 0.304 | 0.303 | 0.177 |
| `audioHat` (hat muted) | 0.154 | 0.144 | 0.164 |
| `audioMelodyConf` (lead muted) | 0.727 | 0.875 | 0.999 -> 1.000 |
| `audioMelodyPitch` (lead muted) | 0.388 | 0.359 | 0.506 -> 0.352 |
| `audioStereoBal` (lead panned left) | 0.000 | -0.151 | -0.148 |

The three "instrument" onsets are onsets of three band groups, and on this music none of them follows its
instrument: the kick's group (40-180 Hz) hears the bass gate, the snare's and the hat's groups hear the lead's
sixteenths -- they read as much in the quiet halves, where no drum plays, as in the loud ones.  The melody's
confidence does not need the lead (the chord bed is a held, confident pitch), but its pitch moves from the lead's
line to the bed's.  So in this music the roles of kick, snare and hat answer the bass and the lead as much as the
drums -- what the plan assumed ("the analyser has delivered these signals for long") holds for the signals, not for
their instruments.  Separating instruments in the analyser is a task of its own (for the user to decide; not done).
The balance with the lead panned left reads -0.15 in both halves; its first version swung by 0.37 within one 50-ms
step when the drums came in (an energy-weighted average follows a 20-dB jump at once) -- a second stage of ~0.6 s on
the ratio keeps every step under 0.019 (8cd3da06).

*Timing.*  Nine scenes and two sacrificial windows, eight runs: 3.7 min in all, 2.0 s per entry and run (12 s of
video at 30 fps, about 180 frames a second) plus 20 s for decoding and thumbnails.  A chunk of 24 scenes: about
7 min, inside one lock hold.  The labs and the 60 most-shown scenes (84) take four chunks, about half an hour; the
whole catalogue would take 104 chunks, about 12 hours -- not run.

#### I2 -- the voices' roles

*One function, the same roles everywhere* (`voiceRoles(col, p)`, gen.py `VOICE_LIB`, called as
`finish(voiceRoles(X, screenP()))`): every role scales the picture's own colours at a part of the screen -- no colour,
line or edge of its own, so the chain labs stay "only the photo" (the user's decision of 17.10.2026) -- and nothing
moves the camera, the zoom, a turn or the picture as a whole.

| voice | role | signal | strength at voiceP 1 |
|---|---|---|---|
| kick | the bright form pulses (highlights more than shadows) | `audioKick` | x(1 + 0.12) on luma above ~0.4 |
| snare | a ring of the picture lights up; the ring's radius wanders slowly with sceneAdvance (0.22..0.32 of the height) | `audioSnare` | x(1 + 0.55) in a ring 0.035 wide |
| hi-hat | the picture glints at fine round jittered points (cells of 1/90 of the height, 16 % of them, each with a slowly changing weight; the field drifts with sceneAdvance) | `audioHat` | x(1 + 0.9) at the points |
| melody | a soft band whose height follows the melody, high notes high, while a melody sounds | `audioMelodyPitch`, `audioMelodyConf` | x(1 + 0.16) in a band 0.09 high |
| stereo | the side the sound leans to is brighter | `audioStereoBal` (new) | x(1 +- 0.14) across the width |
| build-up | contrast up, the light closes in on the middle | `audioBuildUp` | contrast x1.35, edges x0.7 |
| bar phase | a beam wanders once round the middle per bar | `audioBarPhase` | x(1 + 0.12), only while music plays |

- *The stereo balance is new.*  `audioStereoL/R` are the three bands per channel, smoothed over ~30 ms: they follow
  every hit, and a half of the picture that leans with them flickers at the rate of the drums.  The analyser now also
  averages the channels' energy difference and sum over about a second (`AudioFeatures::stereoBalance`, uniform
  `audioStereoBal`, -1 left .. +1 right, 0 for mono).  The PresetEditor's `--features` CSV got the columns snare_c,
  hat_c, stereo_bal and bar_phase_c.
- *The strength is a knob, `voiceP`*, declared by VOICE_LIB.  No preset entry has it, so it is 0 and `voiceRoles`
  returns its argument: the old picture.  To switch it on, an entry gets `<expr name="voiceP" formula="1"/>`; the
  presets are not changed (for the user).
- *Where:* the 20 labs of 23.10. (`patch_voices.py`), the 36 Chain* and 5 Chain3D* scenes (the templates of
  `make_chains.py` / `make_chains3d.py`), and the four chain labs (ChainLab2D, ChainLab3D, ChainLabTunnel,
  ChainSlice3D: in the app their last pass is `Engine/ChainPass/Final_<lab>.frag`, written by `make_chainpass.py`
  from the lab's source).  Not FxChain: an overlay on a scene that has the roles would double them.
- *voiceP 0 against the old picture.*  The four chain labs: snapshots (the app, empty settings on both sides) before
  and after, 4 of 4 identical at tolerance 0 -- after the fix below, ChainLab3D and ChainSlice3D once more.  The 71
  other regenerated scenes (61 of I2, 10 of I3): the real compile of all 79 changed files passes; snapshots of the
  frags of b87fcc34 against those of HEAD, in one lock hold: 48 identical, 23 differ (mean absolute difference
  0.00..1.61 of 255, Chain3DMandelbox and Chain3DPolarTunnelBoxes the most).  A repeat of the HEAD set against itself:
  17 differ, by the same amounts -- these scenes vary from run to run in the app.  So the editor, which renders one
  frame at a fixed time and repeats itself exactly (old against old and new against new: identical for all seven
  scenes tried): ChainSpiralKaleido, Chain3DMandelbox, Chain3DPolarTunnelBoxes, ChainTwirlP4m, Chain3DOctaGyroid,
  StripLab, LaserProjectorLissajous identical old against new; BandLab 3, PulsarRidgelineStack 3 and FoldLab 10
  pixels of 1.17 million by one level.  That is the compiler: the extra uses of the colour in the voices' branch
  change how the driver rounds it in a handful of pixels.  Not bit for bit in those three labs, and not visible; left
  so (applying the voices after the house finish, on fragColor, might avoid it -- not tried, it would need every
  measurement again).
- *A bug the measurement found.*  The first roles run read no stereo answer in ChainLab3D and ChainSlice3D (lr +0.003
  and -0.004 where the 2D labs read +0.12..+0.40): their `Final_*.frag` end in a `finish(col)` of their own after the
  lab's last line (make_chainpass.py's write_3d appends it with the block that keeps the walk uniforms), and it
  overwrote `finish(voiceRoles(...))`.  The voices now go onto `col` itself (44264b11).  The same appended line has
  always dropped `chainAfterglow` in the app's 3D chain labs -- glowP's afterglow reaches the editor's uber shader,
  not the app.  Not changed: that is a visible change (for the user).
- *Stills first* (`PresetEditor --render` with every voice pinned on: kick, snare and hat 1, melody 0.78, balance
  -0.8): the ring brightens the picture by 22-32 grey levels, the left half 7-12 against the right's 2-4, the melody
  band 11-18 (`kaleido-wt\sheets\voices\stills\roles_stills.jpg`).  A first version added a grey lift to the ring and
  the glitter; in the photo-only labs that is a colour of its own, so every role multiplies now.

<!-- numbers -->

#### I3 -- a demonstration round in ten of the most-shown scenes

Ten scenes of the 60 most shown, in screen-time order, that have a gen.py source and had no roles yet (the chain
scenes of the top 60 got them in I2): PulsarRidgelineStack, WireframeRidgeScan, TextureTelescopeRings, VaultShaftUp,
TruchetFlowWeave, TextureIrisShutter, TextureCrystalLatticeFlight, LaserProjectorLissajous, NeonRingTunnel,
CrystalThroatTunnel -- `patch_voices.py`, `merge_regen.py`, the same `voiceRoles` and `voiceP` as I2.
ParticleLifeClusters was in the first ten; the base run read it zero in two voices only (hat, pan), so
LaserProjectorLissajous (place 18, zero in five) took its place.  By the I1 criteria nearly every one of the 60 reads
zero in three or more voices (the pan in all but the stereo scenes, snare and hat in almost all), so "the most shown"
decided.  TextureNeonTrace,
RheoscopicSwirl and TextureLanternField came first in the order; their committed frags have drifted inside the uniform
block, where the voices add their uniforms, and `git merge-file` reported a conflict -- left out rather than merged by
hand.  The hand-written scenes among the most shown (HeliosphericCurrentSheet, BismuthLabyrinth, Voyager,
StargateWormhole, ...) would need the function pasted by hand; not in this round.

<!-- numbers -->

#### Tools and traps

- `Tools/reactivity.py --voices --set controls|labs|topN|--scenes A,B --tag T [--chunk i] [--expr voiceP=1]`, then
  `--report --tag T` (Tools/scene_voices.tsv keeps the rows of every run, `run` column; sheets into
  `kaleido-wt\sheets\voices\<run>`).  `KALEIDO_SETTINGS_SRC` points the private settings copy at another ini (a
  worktree has none of its own); `KALEIDO_SCHEDULE_DIR` the scene plans topN reads.
- `<expr name="voiceP" formula="1"/>` sets a knob without drawing a random number: `addExpression` draws its three
  seeds at load time, and `resetParameters` reseeds per scene under `KALEIDO_SEED`, so the rolls of the run without
  it stay the same.  A `<float>` would add a roll of its own.
- `Tools/scenegen/merge_regen.py`: a gen.py rebuild of a 2D chain scene of 30.09. pulls in 1,067 lines of round-7
  chain classes it never calls.  The tool builds each scene twice with today's gen.py (from the committed source and
  from the changed one) and merges the difference into the committed frag (`git merge-file`): 41 chain scenes got
  exactly the voices' hunks, the 20 labs (no drift) the plain rebuild.
