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

*The thresholds* -- MEASUREMENT PENDING

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

*Checks* -- PENDING
