## 27.11.2026 (71, fixes): the breath at the drop, QuantumQubitArray's light cap, the photo slots in 3D

Agent "fixes" (branch `wt-fixes` from phos-cues 8bc0a0cd).  Three small fixes the user decided on 27.11.2026, each its
own commit.

| fix | what | result |
|---|---|---|
| 1 | the held breath (final pass) is let go at the drop with the depth arc's envelope | 2c952f2a: where the breath is held at the hit (forced drops; 4 of the cue bench's drops) half-way 0.25-0.33 s after it instead of 0.6-3.6 s or never; the three demo drops unchanged (no breath at their hits); no flash count higher |
| 2 | QuantumQubitArray's 16-bit light cap 1.2 -> 1.0 | 758e355e: 1.0 flashes/s -> 0.5, mean luminance 0.115 -> 0.097 -- both the 8-bit values |
| 3 | ChromeForm's `photo()` and the tex0-only reflections of BloomSculpt, Detonation, MetaSculpt, Ocean mix both photo slots like img() | 52b922f6: compiles (shadercheck clean); the expected cross-fade difference did NOT show in the exports (the four byte-identical before/after, ChromeForm ~0.002) -- open |

### 1 -- the held breath lets go at the drop

#### What was there

- The breath (`breath`, Engine/Present.frag: desaturate 0.38, dim 0.13, a vignette 0.5 over the whole frame) gets its
  value from Source/AudioConditioner.cpp: target clamp( ( buildUp - 0.5 ) x 2.2, 0, 1 ) x gate, slewed at 2.5/s.  It
  follows the build-up only, so it lets go as the build-up falls -- the analyser's build-up has a ~1.2 s fall, and in
  goa it stays near 0.45 for seconds after the drop.  Agent p2's depth arc (docs/engine-internals-71-p2.md, `arcP`)
  clears 0.25-0.5 s after the hit; the breath then still held the frame (p2's "for the user").
- The CinemaScope letterbox (the bars in the build-up) slews toward the same build-up target, at 12/s while the drop
  pulse is above 0.4 -- so it, too, only opens as far as the build-up has fallen by 0.66 s after the hit.  Not
  changed (see "for the user").

#### The change

The breath's target takes the arc's clearing envelope (tensionArc() in the five FX/FxDepth*-family files), computed in
the conditioner from the same conditioned drop pulse the shaders get as `audioDrop` (max( drop pulse, DJ-stop slam )
x gate; the score-cue pulse where cues are live; a forced drop):

    clear  = ( 1 - smoothstep( 0.45, 0.8, dropPulse ) ) x smoothstep( 0.0005, 0.03, dropPulse )
    target = clamp( ( buildUp - 0.5 ) x 2.2, 0, 1 ) x gate x ( 1 - clear )      -- slewed at 2.5/s as before

- *A continuous envelope, never a jump.*  The pulse jumps from 0 to 1 at the hit; the envelope maps both to 0, so the
  hit itself changes nothing.  Then the envelope rises as the pulse decays through 0.8..0.45 (tau 0.72 s: 10 % at
  0.23 s, 50 % at 0.34 s, 90 % at 0.47 s), holds to pulse 0.03 (2.7 s) and is gone at 0.0005 (5.5 s): the breath
  returns only if the build-up is still above 0.5 by then -- exactly when the arc tightens again.
- *The slew stays.*  2.5/s was already the fastest the breath could let go (a build-up that fell at once); the
  release is not faster than before, it starts earlier.  Simulated for a full breath (1.0) at 120 Hz: it starts to
  fall 0.17 s after the hit, is half-way at 0.39 s (the arc: 0.34 s) and gone at 0.58 s; half a breath (0.5) is
  half-way at 0.34 s, with the arc.  Score cues (tau 0.66): 0.38 / 0.57 s; a forced drop (tau 0.5): 0.33 / 0.53 s.
- `KALEIDO_BREATH_DROP=0` keeps the old breath (for comparisons; README).  The app's KALEIDO_FEATURE_LOG got two
  columns at its end (`dropFx` the conditioned pulse, `breath`), and `PresetEditor --features` two (`drop_c`,
  `breath`) -- appended, so readers by name or by position keep working; Tools/analyzer_regress.py skips columns
  its baseline does not have.

#### Measured

*The tool.*  `Tools/breath_drop.py` renders the stretches of p2's three cue demos (Tools/depth_arc.py: goa 15-90 s,
uplifting 140-205 s, ostgut 120-192 s of the demo; PillarHall with FxDepthFog at arcP 1 -- the arc and the breath
together; 960 x 540, 60 fps, KALEIDO_SEED 7, the snapshot photo, the user's settings in a private copy) once with
`KALEIDO_BREATH_DROP=0` and once with 1, and reads per frame the breath the app computed and the conditioned drop
pulse (KALEIDO_FEATURE_LOG), the frame's mean linear luminance and Tools/flash_count.py's count.  Because the three
real drops turned out to have no breath at the hit (below), two more pairs force a drop (KALEIDO_FORCE_DROP, pulse
tau 0.5 s) where the build-up is highest in the stretch: goa at 19.5 s, ostgut at 43 s.  Each export took 6-14 s.

*The breath around each hit* (old -> new; "half-way" and "gone" in seconds after the hit):

| drop | build-up at the hit | breath at the hit | 0.3 s after | 1 s after | half-way | gone |
|---|---|---|---|---|---|---|
| goa 64.50 s (real) | 0.48 | 0.000 | 0 -> 0 | 0 -> 0 | -- | -- |
| uplifting 54.80 s (real) | 0.06 | 0.000 | 0 -> 0 | 0 -> 0 | -- | -- |
| ostgut 61.45 s (real) | 0.34 | 0.000 | 0 -> 0 | 0 -> 0 | -- | -- |
| goa 19.50 s (forced) | 0.85 | 0.766 | 0.741 -> 0.281 | 0.654 -> 0 | never (in 4 s) -> 0.27 | never -> 0.42 |
| ostgut 43.00 s (forced) | 0.77 | 0.591 | 0.590 -> 0.136 | 0.501 -> 0 | never -> 0.25 | never -> 0.37 |

- *At the three real drops nothing changes.*  The build-up the analyser gives is below 0.5 at each hit, so the breath's
  target is 0 there and the breath had already let go (goa: 0.25 at -1.5 s, 0 from -0.5 s).  The two feature logs are
  the same, frame for frame (uplifting: four frames 4.5 s after the hit differ by 0.0001, where the build-up crosses
  0.5 while the envelope's tail is still above 0).  p2's "lingers about a second" is what the code does when the
  build-up is high at the hit -- which on these three demos it is not.
- *Where the breath is held at the hit it now goes with the arc.*  The forced drops: the old breath follows the
  build-up, which stays at 0.8 (goa) and 0.7 (ostgut) -- one second later it still holds 85 % of itself, and 3 s later
  70 %.  The new one falls at the slew's 2.5/s from 0.17 s after the hit (the forced pulse's envelope is faster than a
  real drop's: 10 % at 0.16 s, 90 % at 0.33 s) and is gone at 0.42 / 0.37 s.  As the clearing ends (from 2 s; gone at
  ~3.8 s with tau 0.5) the breath returns where the build-up is still above 0.5 (goa: 0.22 at +2 s, 0.54 at +3 s,
  the old 0.55): the same as the arc, which tightens again then.  A forced drop in the middle of a build is the
  extreme case; at a real drop the build-up has fallen by then.
- *A wider look without rendering* -- the cue bench's feature files (main checkout, .screen/cuebench, 20 rows/s, an
  older analyser state), the conditioner's arithmetic replayed offline: 24 analyser drops in 11 of the tracks; the
  breath is 0 at 20 of them and above 0.05 at 4 (BreakbeatGenerator skank 0.78 and 0.39, stomp 0.23 and 0.49).  At
  those four the old breath took 0.6-3.6 s to get half-way (two not at zero after 4 s); the new 0.31-0.37 s, gone at
  0.54-0.55 s.  The same through the real analyser and conditioner of this build (`Tools/breath_drop.py features`,
  PresetEditor --features, 10-ms rows, the switch at 0 and 1; whole tracks): goa 2 drops, uplifting 2, ostgut 1 --
  breath 0 at every hit (build-up 0.00-0.48); BreakbeatGenerator skank 153.67 s (build-up 0.86, breath 0.79): half-way
  old 1.19 / new 0.31 s, zero 2.03 / 0.49 s; skank 291.90 s (0.68 / 0.39): 0.60 / 0.28, 1.04 / 0.46; stomp 163.14 s
  (0.60 / 0.23): 2.32 / 0.33, never / 0.47; stomp 296.57 s (0.72 / 0.50): 3.62 / 0.30, never / 0.48.

*Flashes and light* (Tools/flash_count.py on each 60-fps export, old -> new): goa 0.5 -> 0.5, uplifting 0.5 -> 0.5,
ostgut 0.5 -> 0.5, goa forced 0.5 -> 0.5, ostgut forced 1.0 -> 1.0 -- no count higher.  The mean luminance of the
exports moves by at most +0.0001 (forced drops); in the release the frame is up to +0.008 brighter than the old one
for the 1.5 s the old breath still held it.  The largest frame-to-frame rise of the mean luminance in the 2 s after
each hit is the same in both (goa forced 0.0214, ostgut forced 0.0161): the drop's own hit is brighter than the
breath's release.  The three real-drop exports: goa and ostgut byte-identical frame for frame, uplifting 348 frames
with small differences around 59 s (the 0.0001 above).  The fastest fall of the breath in the feature logs: 2.5/s
(the slew), old 0.32/s.

Sheet: `C:\Users\Rene\Desktop\kaleido-wt\sheets\fixes\f1_breath_curves.jpg` (per hit, 10 s before to 6 s after: the
breath old grey / new gold, the build-up, the drop pulse, the mean luminance new - old).

### 2 -- QuantumQubitArray's light cap 1.2 -> 1.0

*What there was.*  docs/engine-internals-70-defaults.md, B: QuantumQubitArray (a solid 3D scene with open light)
flashed 2.5 times a second with 16-bit intermediates against 0.5 with 8 bit; agent "defaults" capped its frame at 1.2
(`// @hdrcap 1.2`, RenderPipeline::capSceneLight(), GL_MIN over the finished frame, 16 bit only) and measured 1.5
then.

*The change.*  The cap line reads 1.0.  An 8-bit frame is never capped, so the old (8-bit) picture is unchanged.

*Measured* the way "defaults" did -- `Tools/flash_count.py QuantumQubitArray` (the scene alone, 20 s of the screening
music at 60 fps, 960 x 540, KALEIDO_SEED 7, the snapshot photo; the worst second of the nine quarter windows), the
same exe and settings for all three (a dummy variable in the environment only names the files):

| run | flashes/s | seconds above 3 | mean luminance |
|---|---|---|---|
| 8-bit intermediates (`KALEIDO_HDR_BUFFERS=0`) | 0.5 | 0 % | 0.097 |
| 16 bit, cap 1.2 (before) | 1.0 | 0 % | 0.115 |
| 16 bit, cap 1.0 (after) | 0.5 | 0 % | 0.097 |

With the cap at 1.0 the count and the mean luminance are the 8-bit ones.  ("defaults" counted 1.5 at 1.2 on the build
of that morning; this build counts 1.0 -- one second's pair either way.)  Not looked at: the frames themselves.

### 3 -- the two photo slots in ChromeForm, BloomSculpt, Detonation, MetaSculpt, Ocean

#### What was there

The photo slots: tex0 is the photo on screen, tex1 the next; `interpolation` runs 1 -> 0 through a photo cross-fade,
then the slots swap and it is 1 again (RenderPipeline.cpp, the texture state machine).  img() and the photo
environment of U1 (`envPhoto()`) mix `interpolation x tex0 + ( 1 - interpolation ) x tex1`.  Section (69), U1, found
two old-look defects (envP 0) and left them for the user:

- ChromeForm's own `photo()` mixed `mix( tex1, tex0, 1 - interpolation )`: tex1 at rest -- the NEXT photo -- moving
  backward to tex0 during a fade, and a jump at both ends of each fade (and once more when the loader puts the next
  photo into tex1).
- BloomSculpt, Detonation, MetaSculpt and Ocean read tex0 alone for their reflection: through a photo fade the
  reflection kept the old photo and jumped to the new one when the slots swapped.

#### The change (old look, envP 0 path)

- ChromeForm: `mix( tex1, tex0, interpolation )` -- the one word.
- BloomSculpt, Detonation, MetaSculpt: `envPhoto( fract( env_uv ), 0.0 )` (U1's helper in the same file: both slots
  with `interpolation`, textureLod, mip 0 as before; Detonation's lookup sits in a pixel-dependent branch and keeps
  the explicit lod).  Ocean: the same mix written out with `texture()` (its implicit-derivative lookup as before).
- The equirect seam and the mip-0 shimmer of the old lookups stay: that is the envP > 0 look's job.
- At rest (`interpolation` exactly 1.0) the four reflections are tex0 exactly (1 x a + 0 x b): their picture changes
  only during a photo fade.  ChromeForm's changes at rest too: it now shows the photo on screen.

#### Measured

*The tool.*  `Tools/photo_fade.py` renders one scene alone as a video export (50 s of the screening music, 60 fps, 960
x 540, KALEIDO_SEED 7, the user's settings in a private copy) from a folder of three photos (-f; green, indigo, orange
copies in .screen/photofade/photos) with KALEIDO_PHOTO_SECS=3, and measures each frame's mean absolute change from the
frame before.  The old files ran from their own paths (swapped in for the before run; the rolls are seeded with the
path), the new ones after.  The logs: the green photo first, indigo next, the first fade 15-35 s (the program's first
photo always stays 15 s and fades 20 s), then orange.

*Result -- the expected difference did not show.*  BloomSculpt, Detonation, MetaSculpt and Ocean: the before and after
exports are byte-identical (the same MD5, 3000 frames each), so in these renders the new mix gave exactly what tex0
alone gave, through the 20-s photo fade too.  ChromeForm: before and after differ by a mean of ~0.002 (of 1) at every
sampled frame, at rest as much as in the fade; both runs show the green photo in its room at 0-30 s and indigo from
~32 s -- where the old formula should have shown the next photo at rest.  The spikes the measure finds (17.4, 31.8,
40.5 s) are the scene's own re-activations (drop cuts to the same scene, the log's SEEDED lines), the same in both.

So either the 3D scenes get the same photo in both slots during their draws (then tex0 alone was never wrong for them,
and U1's "jump at every photo change" does not happen in practice), or the photo fade did not reach the 3D pass in
these exports.  Not resolved in the time: the units are bound act -> 0, next -> 1 in RenderPipeline.cpp (~3315) and
Scene3DShader::setUniforms() passes `interpolation` like the 2D path; the 3D scenes write `interpolation` as their
alpha.  The change is committed because it is what img() does and is exact at rest; whether it changes any picture is
open (see "not verified").  No before/after sheet: there is nothing different to show.

### Checks

- Build (app and editor): 0 warnings.  `Tools/analyzer_regress.py`: as the baseline (chord changes 24 of 38, 4 false;
  drops 3 of 3; 127.9 / 120.0 BPM).  It does not cover the breath: its checks are the analyser's counts and the
  feature columns of `PresetEditor --features`, which had no breath column -- the new `breath` and `drop_c` columns
  are skipped until a baseline update writes them (`--update`, left to the analyser's owner).
- `Tools/check_schedule.py --quick`: 20 plans, 0 violations.
- `Tools/temporal_budget.py`: 0 errors, 4 warnings; `Tools/shake_scan.py --summary --baseline`: 0 new, 74 known (as
  on 8bc0a0cd).  `Tools/doc_shaders.py --check`: nothing to change; `Tools/cgvr_format.py --check` on the six shaders
  and four C++ files: same (AudioConditioner.cpp formatted once, one declaration's alignment);
  `Tools/check_strings.py`: OK (no new strings).
- `Tools/shadercheck.py --new 8bc0a0cd`: 6 files (the five scenes and QuantumQubitArray), compiled by the driver, 0
  errors, 0 warnings.
- The self test (`Release\Kaleidoscope.exe -q`, this build): 186 passed, 0 failed.
- No render log of the exports has an error line.

### Tried and dropped

- *The breath's output times ( 1 - clear ) instead of its target* -- the arc's timing to the frame, but the picture
  could then brighten as fast as the envelope falls (up to 3.8/s of the breath at 120 Hz, against the slew's 2.5/s,
  which bounded every release so far).  With the target the release starts at the same moment and lags the arc by
  0.05 s at half-way for a full breath, none for half a breath.
- *Photo changes in a 24-s export* (the first photo_fade runs): no photo changed.  The program's first photo stays
  15 s and fades over 20 s whatever KALEIDO_PHOTO_SECS says (RenderPipeline's constructor values; the switch sets
  the ranges rolled after the first swap), so the first swap comes at ~35 s.  The tool renders 50 s now.
- *The cue demos through `PresetEditor --features`*: the generators' demos on G: are 32-bit float WAVs, which the
  editor's WAV reader refuses (exit 1 at once); breath_drop.py takes 16-bit copies (ffmpeg, .screen/p2arc).

### For the user

- *The letterbox* (the CinemaScope bars that creep in during a build-up) still slews toward the build-up's own
  target: it opens at 12/s while the drop pulse is above 0.4, but only as far as the build-up has fallen -- where the
  build-up is held to the hit, the bars stay after the breath has let go.  The same factor ( 1 - clear ) on its target
  would open them with the breath; not done, it was not part of the decision.
- *Where the breath change shows.*  The breath only lingers where the analyser's build-up is still above 0.5 at the
  hit.  On p2's three demos it is not (the build-up falls before the drop), on the cue bench at 4 of 24 drops.  Whether
  the build-up should hold up to the hit is the analyser's question (agent "analyzer").
- *ChromeForm's old look changes at rest*: its room now carries the photo on screen, not the next one -- the intended
  correction, but it is a different picture in all of its 11 entries.
- *QuantumQubitArray*: 1.0 reaches the 8-bit count; nothing to decide unless the frames look too flat (not looked at).

### Not verified

- Fix 3's effect: not shown (above).  Worth a check of the photo slots in a 3D scene during a fade (a 3D scene that
  writes `texture( tex1, uv )` straight to the screen) before anyone builds on U1's "jump".
- Fix 1 with score cues (`-k`, tau 0.66 s) and DJ-stop slams: computed, not rendered; with real music over a show, on
  the panel and in the headset -- the user's.  The letterbox interplay (bars staying while the breath lets go where
  the build-up is held) not rendered.
- Fix 2: only the one 20-s count; no frames looked at, no other photo or music.
- GPU time: not measured (fix 1 is a few CPU flops a frame; fix 3 adds one texture read in four scenes' old path).
