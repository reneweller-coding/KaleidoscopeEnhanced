## 26.11.2026 (69, guard): the picture guard (W1) and the latency with a sign (Z1)

Two operating packages of docs/PLAN_2026-11-26.md.  The plan asked to ask the user before both; the user had called
both ideas convincing and said "implement the plan" on 26.11.  Both are switches; with them off nothing changes.

### W1 -- a guard for a dark or frozen picture

*What was there.* The present pass read the picture's mean colour from the top mip (PresentPass.cpp, 6th frame, two
pixel-pack buffers, mapped 12 frames later) for the OSC output only (`/color/mean`).

*What it does now* (`Source/PictureGuard.h`, `RenderPipeline::updateGuard()`, `PresentPass::guardSample()`).

- *The sample.*  The mip whose long side is at most 16 texels -- 15 x 8 at 1080p, 10 x 5 at 720p -- read the same
  way as the mean colour, with its own two buffers and counter (the OSC mean stays exactly as it was): every 6th frame
  a `glGetTexImage` into a pixel-pack buffer, mapped 12 frames later, so nothing waits.  The level's size is asked of
  the texture (`glGetTexLevelParameteriv`, a state query), not assumed.  It is the scene as rendered, with its FX and
  trails, before the exposure, the grade and the blackout.
- *Dark:* the mean luminance (Rec. 601 on the stored values, as `Tools/screen.py` measures) below `darkMean` and no
  texel above `darkPeak`.  *Frozen:* no texel channel further than `stillStep` (3/255) from the sample the stillness
  began with -- an anchor, not the previous sample, so a slow drift adds up and ends the stillness while a picture that
  stands keeps it for good; the mips are 8 bit, a standing picture reads exactly 0.
- *Two stages.*  20 armed seconds dark or still: the next photo fades in -- on the next downbeat, in at most 4 s
  (a preset's photo fades take 20-80 s; the picture is black meanwhile).  A photo already fading in is waited for.
  15 armed seconds still dark or still after that: `SceneScheduler::requestGuardChange()` ends the scene as if its
  solo time had run out -- so it waits for the phrase where a drop anchored the grid (its fade starts four beats
  before the 8-bar boundary), else for the downbeat, and fades with the preset's own fade; a walking lab ends too
  (its walk answers the music's cues, not this one).  No photos to change (a live picture, a single photo): the scene
  change at once.  A change that does not come is asked for again after 45 s.  After the photo, 30 s of a good
  picture and the guard starts over.  A new scene starts everything over.
- *Armed* only while the show is meant to be seen and the music plays: a scene stands alone (no fade, 3 s settled),
  music is detected (musicPresence > 0.5, the conditioner's gate > 0.5) and audible (rawLevel > 0.1, about -54 dB),
  no blackout, rest dimming or sleep dimming, no DJ stop (`breakHold`, the slewed hold), no freeze, no pin, the song
  is not fading out (`fadeOut` < 0.3), no live picture replaces the photos, no bench (review walk, rating walk).
  Outside that the clocks pause (they do not start over: a DJ stop in the middle of a black scene does not save it).
- *Counted*, per scene and per photo, in `kaleidoscope_guard.tsv` beside the settings file (`kind name dark frozen
  photo scene last`); the taste (`M_Taste`) is not touched.  Every action is one log line,
  `GUARD <photo|scene> <dark|frozen> scene=... photo=... mean=... peak=... step=... at=...`, and
  `KALEIDO_GUARD_LOG=1` adds a sample line a second.  `Tools/guard_report.py` lists both (and, for an export, cuts a
  thumbnail per action); `Tools/guard_run.py` runs the guard over hours of music as video exports, one chunk per
  track and preset, each through the lock.
- *Switches:* ini `pictureGuard` (default: see below), the menu (Picture & overlays), the remote (Display),
  `KALEIDO_GUARD=0|1|log` (1 also in scripted runs and exports, log only says what it would do).  Off in every
  scripted run otherwise: the snapshots, the sweeps and the exports are untouched.

*Tried and dropped on paper (before the first build):*

- *Reading the 8 x 8 for the OSC mean too*, one readback for both: the OSC `/color/mean` would have become the mean
  of the small mip instead of the top mip -- a better mean, but a change nobody asked for.  Two readbacks of a few
  hundred bytes cost nothing; the OSC one stays as it was.
- *Comparing each sample with the previous one* for "frozen": a slow scene moves less than 1/255 a block in 0.1 s and
  read as frozen; the anchor (the stillness's first sample) lets the change add up.
- *Pausing the guard during every photo fade*: the presets fade photos over 20-80 s and hold them 10-40 s, so a black
  scene was paused most of the time and the second stage came minutes late.  A photo fading in now counts like any
  picture -- if it is the cure, the dark streak ends by itself -- and only the first stage waits for it.
- *Resetting the clocks on every natural photo change*: a broken scene would never have been caught while the
  slideshow kept changing photos every 15 s.

*The thresholds, from the catalogue.*

- *The screening* (`.screen/metrics.json` of 23.10., 2,475 scenes, 1-3 seeds each, the screening groove, 160 x 90
  after the exposure): the frame means' minimum per window is below 0.012 in 0.5 % of the windows and below 0.016 in
  1 %; the darkest scenes by design are BlackHole, OrbitalShells, VectorscopeBloom, PlanetRings, TronCycles (their
  brightest frame 0.022-0.037), the stillest FusorStarMode, MeshSeismograph, OrbitalShells, AccretionDiskToroidVortex
  (32 x 18 blocks moving 0.0009-0.0016 in 0.2 s).  Those are the control scenes: the 20 darkest and the 20 stillest.
- *What the guard itself reads of them* (`Tools/screen.py --scenes ... --hold 45` with `KALEIDO_GUARD=log
  KALEIDO_GUARD_LOG=1`, 45 s each, 2 min of lock per 20 scenes; `Tools/guard_report.py`): the darkest mean of all 40,
  OrbitalShells, is 0.0154 -- 3.4 times `darkMean` (0.0045); every one of them has a texel at 0.23 or more at some
  point (`darkPeak` 0.03); the longest stillness of the 20 stillest is 2.0 s (CompassNeedleField), a tenth of
  `frozenSecs`.  **0 actions in 40 control scenes.**  (The screening groove switches loud and quiet every 4 s, and its
  quiet half reads as a DJ stop: the guard was armed 45 % of the time there, 92 % on real music.)
- `darkMean` 0.0045 is about 1/255 after the exposure's largest gain (1.8) -- a picture that is black to the eye --
  and `stillStep` 3/255 lets the 8-bit mips' rounding and a scene's grain pass.  20 s is longer than any breakdown's
  dark moment the 2-h run met (none got past 0 s dark) and than any stillness of a scene that moves (7.6 s).

*The long run* (`Tools/guard_run.py`, the guard acting, `KALEIDO_GUARD=1`): the seven real tracks of
`.screen/music`, `structure128.wav` and the screening groove, once with Allround and once with Club -- 2 h of music,
as video exports at 1280 x 720, 15 fps: 11.2 min of lock (about 20 times real time; the labs walk with the music
there, so 85 scenes in all, 62 % of the time in the four labs).  **0 actions.**  Nearest misses: MandelbrotDeepZoom
stood still for 16.0 s -- and its frame was flat, mean = peak = 0.6235 in every texel: the zoom inside the set, one
colour, nothing to see; at 20 s the guard would have been right to act.  The next longest stillness was 7.6 s
(LightPillarsCity), the longest dark streak 0 s.  [Calm presets: see below.]

*The app test* (two test shaders, black and frozen, in a hidden preset `Presets/ZZGuardTest.xml` -- gitignored, the
shaders in `.screen/guardtest`; the screening groove, 910 s): 35 actions; each test scene was ended 26-28 s after it
came (3 s settling, 20 s, then the downbeat or the phrase), with a photo first when one was ready and the scene change
at once when a photo had been fading in for 8 s.  Sheet: `sheets/guard/guard_apptest_black_frozen_910s.jpg`.

*Tried and dropped after the first app test:* the first stage waited for every photo fade to end -- the frozen test
scene got its photo after 81 s, not after 20.  A photo fading in for 8 s without curing the picture is now taken as
proof that the photo is not the cause.

### Z1 -- the picture and the sound you hear

*What was there.* `latencyLead` (0..0.25 s, default 0.05) leads the conditioner's beat PHASE
(AudioConditioner.cpp: `phase_lead = PLL + lead * rate`, the bar phase the same).  Bluetooth headphones (150-250 ms)
and televisions (50-150 ms) play the sound after the loopback tap: the picture was early, and nothing could hold it
back.

*What it does now* (`Source/FeatureDelay.h`; `AudioAnalyzer::setFeatureDelay()`).

- *One setting with a sign.*  The same key, `latencyLead`, now -0.5..+0.25 s: above zero the lead as before, below
  zero a delay of every feature.  An older version reads a negative value as 0 (its clamp).  Keys `;` and `'` go
  through zero into the delay; the menu's slider and the remote's (-500..+250 ms) cover the range; the MIDI knob keeps
  its 0..0.25 (a learned knob at its bottom must not become half a second of delay).  `KALEIDO_LATENCY` for one run.
- *The ring.*  The analyzer publishes a snapshot per block (480 frames, 10 ms at 48 kHz, 10.9 ms at 44.1 kHz).  With
  a delay set, every published snapshot goes into a ring on the AUDIO clock (512 slots; a block shorter than 2 ms
  replaces its slot's snapshot -- WASAPI hands over 1-ms packets at times), and `getFeatures()` hands out the newest
  one at least the delay older than the newest.  Without a delay the ring keeps nothing and `getFeatures()` returns
  the newest snapshot as before.  Everything downstream reads the delayed snapshot: the conditioner (the beat PLL, the
  envelopes, the integrated phases), the scheduler (sections, drops, the phrase grid, the drop prediction), the rest
  mode, the song boundaries, the OSC output -- one timeline, delayed as a whole.
- *A change of the delay* moves the effective delay at 0.5 s per second of audio: the delayed timeline then runs at
  half or one and a half times speed for a moment, never backwards.  Jumped, a counter (beats, onsets, track changes,
  sections, drops) would step back, and `AudioEventLatch` and the scheduler read any change of a counter as an event:
  a beat, a track change, a cut out of nowhere.  Set before the first block (the ini at start), it holds from the
  start and the first 0.3 s are silence.
- *Score cues* (CueReceiver.h) arrive with the audio's timing -- before the ear hears it -- and now wait as long as
  the analysis does (`ScoreCues::setDelay()`, released in `drain()`; a cue file's clock is shifted the same,
  `ScoreCueFile::setDelay()`).  A beat cue still reaches the analysis' external clock on arrival: the analysis is
  delayed as a whole afterwards, the beat with it.  A tap (`t`, the remote) is taken as a beat the delay earlier on
  the analysis' clock -- the tapper hears the music late.
- *Never delayed:* a video export and the scene plan (`--schedule`) analyse a file on their own clock
  (`RenderPipeline::featureDelay()` is 0 there; the export's analyzer is its own instance anyway, and `beginExport()`
  still sets the latency to 0).  The PresetEditor's analysis (`--features`, `analyzer_regress.py`) never had one.
- *A recording* takes its sound from the loopback while the picture shows the delayed features: the mux shifts the
  WAV by the delay (`-itsoffset`, also in `make_video.bat`), the instant replay takes its audio that much earlier.
  A stream through Spout/OBS has its own audio path: there the latency belongs at 0 or in OBS's own audio offset.
- *The calibration ring* (`GLwidget::drawCalibration()`, the remote's Live tab, `/api/toggle?k=calib`, never a key):
  an arc that runs round once a beat on the beat phase the scenes get (PLL, lead, delay) and closes on the beat, a
  short flash of the whole ring when it closes, and a dot that lights with the kick the scenes get.  Painted over the
  picture like the other overlays, so it is in neither a recording nor the Spout output.
- *Tap-along* (the remote, `/api/beat`): the page puts the loopback's own beat grid (the newest analysed block, before
  any delay) on the phone's clock from the shortest of five round trips, every 2 s; each tap's distance to the nearest
  grid beat is the lag of the music at the ear.  People tap ahead of the beat they hear -- the negative mean
  asynchrony, "some tens of milliseconds" (Repp 2005, Psychonomic Bulletin & Review 12(6), 969-992; smaller in
  musicians, Aschersleben 2002; not universal across cultures, Lagarde 2021) -- so 30 ms are added back: a middle value,
  small on purpose, since tapping to music rather than clicks narrows it.  I could not reach the full text of Repp
  2005 to quote its range; the sources checked agree on "tens of milliseconds" and on the direction.  The phone's
  touch screen adds 20-70 ms of its own the other way, and the grid is the newest analysed block (10-20 ms after the
  sound passed the tap), so the value is a start, not the answer: the suggestion = 0.05 s (the default lead, which
  fits speakers on a cable) minus the measured lag, applied only when the user presses "Apply".

*Checks.*

- `Kaleidoscope.exe -q`: 167 passed, 0 failed.  New: the ring alone (a delay of 0.30 s set before the music hands out
  block k-30 at block k, exactly, and silence before; a change of the delay never runs a counter backwards, and after
  the slew it is the new delay exactly -- block 654 at block 699 for 0.45 s; switched off it lets go, switched on
  again mid-show it slews in without a silent snapshot; 1-ms blocks still reach 0.5 s back); the analyzer end to end
  (a 128-BPM kick track through two analyzers, one with 0.30 s: 1170 of 1170 blocks are those of 30 blocks before --
  levels, counters, beat phase, tempo, the 32 bands and the waveform compared exactly -- 25 beats); the setting (-0.2
  s is a delay of 0.2, +0.05 none, -0.9 held at -0.5; never in an export or the scene plan); the cues (80 ms of delay:
  the drop lands 80 ms after it arrived, a beat reaches the external clock at once; a cue file shifts by its delay).
  And the guard: a black and a frozen scene (photo at 20.0 s, scene at 35.0 s), a slow drift and a dark scene by
  design that never trigger, the pauses, a new scene, a photo that cures it, a live picture, a photo fading in, the
  retry after 45 s, and the scheduler's side: `requestGuardChange()` at 10 s fades at 16.0 s, 2.0 s before the 8-bar
  boundary, and a pin holds it.
- *At zero, byte for byte:* `PresetEditor --features` on chords.wav (5.7 MB), structure128.wav (4.3 MB) and
  broadband120.wav (0.9 MB) -- this build against the main checkout's editor, built before this work: identical, every byte (the editor's
  analysis has no delay; `Tools/analyzer_regress.py` reads these files).
- `Tools/check_schedule.py`: 20 plans, 0 violations (the scene plan never sets the guard's change).
- Snapshots (`scene_snapshots.py`, 12 entries): identical to `2026-11-26-base` -- once rendered with the user's
  settings file; without it (a worktree has none, the base was rendered with the main checkout's) 6 of 12 differed
  by 2.4-5.6, the settings, not the code: two renders of this build without it are identical too.
- `temporal_budget.py` 0 errors, `shake_scan.py` 0 new, `cgvr_format.py --check` 3,512 same, `check_strings.py`,
  `check_build_lists.py` (the .pro lists the two new headers), `check_enum_tables.py`, `doc_shaders.py --check` 0.
- *Not verified:* the calibration ring and the tap-along on a real phone and real headphones (the user's); the
  delay against a real Bluetooth device; the Linux build (CI); the setting's MIDI knob is unchanged (0..0.25, the lead
  only).

*Not delayed, on purpose:* the media session's title and its lyrics and song cues (they follow the player's
position, not the loopback; a few hundred ms there do not read as a sync error), the OSC output follows the picture
(delayed) -- a lighting desk in the same room as the headphones' wearer sees what the picture shows.
