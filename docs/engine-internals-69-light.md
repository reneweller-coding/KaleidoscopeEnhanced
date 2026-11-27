## 26.11.2026 (69, light): glow from real brightness -- where the light sits at the limit, and 16-bit intermediates

Block L of docs/PLAN_2026-11-26.md.  Every intermediate picture of the engine was 8 bit (`m_texInternalFormat`
GL_RGBA8: the scene, FX and transition targets, the final frame, the trails, the bloom, the stereo targets, the MSAA
colour), and the bloom takes what lies above 0.70 (Engine/BloomBlur.frag, `max( c - 0.70, 0 ) * 1.6`): at 8 bit a
white wall and a lamp give the same glow.  But most scenes cut their own output at 1 (`fragColor = vec4( clamp( col,
0.0, 1.0 ), 1.0 )` in 1,999 of 2,149 2D scenes -- 1,529 of them through the generator's house finish -- and 153 of
327 3D scenes), so wider targets alone change little where a scene clamps.  L0 measures first where it would not.

### L0 -- measuring where the light sits at the limit

- *The hook* (`KALEIDO_LIGHT_STATS=<decode factor>`, `PresentPass::logLightStats`).  After the present pass has drawn,
  the frame it took as its source -- the scene after overlay and trails, before the bloom -- is read back (a sync;
  for measuring runs only) and one `[light]` line per frame goes to stderr: the share of pixels whose brightest
  channel reaches 0.995 (`clip`, at the limit), 1.05 (`over`) and 2 (`over2`), whose darkest channel reaches 0.995
  (`white`), the mean luma above 1 (`exc`), and the bloom's bright pass as luma twice -- with the colour clamped to 1
  as an 8-bit target holds it (`b8`) and with the light kept (`bh`).  `glow_gain = bh / b8` says how much more glow
  the same frame would give if its light survived.
- *Seeing above 1 through an 8-bit target* (`Tools/light_stats.py`, default mode).  The run walks the scenes over
  measurement COPIES (`.screen/light/src`): each copy's `fragColor` becomes a plain variable, a wrapper main() writes
  a quarter of it, and the final clamp keeps only its lower bound (`clamp( X, 0.0, 1.0 )` -> `max( X, 0.0 )`) -- so
  the RGBA8 target holds 0..4 in steps of 1/64, and the hook decodes with 4.  Additive 3D geometry (`points`,
  `ribbon`: GL_ONE, GL_ONE) sums a quarter as well.  A state pass (`//@state`) is left unscaled, a scene that
  samples the previous frame (`texPrevFrame`, 7 scenes) has those samples scaled back up, the chain labs run as
  their uber shader (`KALEIDO_NO_CHAINPASS`: the pass files are not copied); 7 scenes without a plain `out vec4
  fragColor` (the OIT glass scenes and Bubble) are skipped.  The rewrite lifted a final clamp in 1,999 2D and 153 3D
  scenes; the others show their own values.
- *The walk* is the screening's (`Tools/screen.py`): the video export on the frame clock, `KALEIDO_SCENE_SWEEP` 8 s
  a scene over the screening music (chord bed, lead, bass and drums at 128 BPM, loud and quiet halves), one photo
  (the snapshot baseline's), fixed rolls; 960 x 540 at 15 fps, the first 2.2 s and the last 0.3 s of each window
  dropped, frames counted only while `[shown]` names the scene (83 frames a scene).
- *Control.*  The same 20 scenes once plain (`--plain`, the scenes as they are, decode 1) and once over the copies:
  `clip`, mean luma and `b8` agree to the copies' 1/64 steps (e.g. ParticleTunnelFlight clip 0.1414 / 0.1415,
  CherenkovCascadeShower 0.0353 / 0.0354); what differs is only where a copy sees above 1 (vmax 1.00 plain, up to
  4.0 over the copies).
- *Timing* (measured before the run, 20 scenes): 3.4 s a scene over the copies (cold compiles), 1.7 s plain; once
  the driver's cache was warm 1.0..1.9 s.  First a sample (933 scenes: 400 drawn at random, seed 26, plus every lab,
  every additive 3D scene, every scene with a field or a simulation of its own and every scene whose name speaks of
  light), then, since it was cheap, the rest of the catalogue in four holds of the lock of at most 12 minutes: 2,468
  of 2,475 entries measured (the 7 without a plain `out vec4 fragColor` skipped), the app's default settings
  throughout.  A scene counts as *strong* where in a typical frame at least 1 % of the pixels lie above 1 and the glow
  would be half again as strong (`over_med >= 0.01`, `glow_gain >= 1.5`), as *some* where light passes 1 at times or
  over a small area (`over_max >= 0.01`, or `over_med >= 0.001` with `glow_gain >= 1.2`).

  | family | scenes | strong | some | none |
  |---|---|---|---|---|
  | 3D additive (points, ribbon) | 84 | 66 | 16 | 2 |
  | 3D solid (mesh, indirect, cubes, grid ...) | 237 | 47 | 83 | 107 |
  | 2D generated (gen.py, house finish) | 1,463 | 36 | 200 | 1,227 |
  | 2D hand-written, final clamp | 469 | 42 | 142 | 285 |
  | 2D hand-written, no final clamp | 148 | 34 | 43 | 71 |
  | the labs | 24 | 0 | 2 | 22 |
  | generated chain scenes | 43 | 0 | 2 | 41 |

- *Where the light above 1 comes from.*  216 scenes show it without any rewrite -- their output is not clamped:
  additive 3D geometry (65; each particle or ribbon is bounded, their SUM is not -- ParticleTunnelFlight 14 % of the
  frame above 1, FireflyField 16 %, VolumetricFire 22 %), 3D scenes without a final clamp (74) and 2D scenes without
  one (77: FractalBloom, PrismaticLaserVault, NeonTubes, LightningStorm ...).  These change with L1 alone.  497 more
  have light behind their final clamp, the 2D ones mostly behind the house finish `t / (1 + 0.35 max)`, which passes
  1 where the scene's colour passes 1.54: lasers, sparks, lamp cores, star points.  In 64 of them more than 6 % of a
  typical frame lies above 1 (BioLuminescentTendrilTunnel 56 %, RelativisticKerrPlasmaDisk 28 %,
  HyperbolicTilingPolyhedralFlight 23 %) -- surfaces, not lights; L2 leaves those alone.
- *Where the families add light* (read in the code, held against the numbers).  Additive 3D: `geom="points"` and
  `"ribbon"` draw with GL_ONE, GL_ONE and no depth test (Scene3DShader::draw); every sprite carries its own soft knee
  (`cat_tone / (1 + 0.35 max)`, at most 2.86), the sum of the sprites is open.  Solid 3D without a final clamp:
  specular and emissive terms of the scenes' own lighting.  Generated 2D: the lights are `famLight()` -- a family
  colour lifted toward warm white -- added into the colour and lifted by `famExpose()`; of the measured generated
  scenes of the sample that call famLight 85 of 186 pass 1, of those that do not 41 of 365.  Simulations (state fields, GPU sims):
  the glow of the field itself (Physarum 10 % of the frame above 1) -- a surface more than a light.
- *Verdict:* the list is not short.  Some 210 scenes (the 84 additive, 74 solid 3D, 77 open 2D, with light above 1 at
  least at times) would gain from wider targets alone, and 93 more if the clamp let their lights through (L2).  The labs never pass 1 -- the
  house finish and their own exposure keep them below -- so no lab is touched.

### L1 -- 16-bit intermediates behind a switch

- *The switch* `KALEIDO_HDR_BUFFERS=1` (`RenderPipeline::hdrBuffers()`, read once): `m_texInternalFormat` becomes
  GL_RGBA16F (`m_texType` GL_FLOAT), and with it everything that follows it -- the scene targets (Effect1/2), the
  FX targets (Fx1/2), the transition target, the final frame and the two trail buffers (mipmapped), the two bloom
  buffers, the rig scratch targets, the MSAA colour (a multisample resolve needs equal formats on both sides; both
  follow the switch) and the full-stereo eye-packed target.  The log says `Intermediate pictures: RGBA16F`.  Not
  switched, on purpose: the photos and the second photo (RGBA8 images; the photo-B FBOs only blit photo to photo),
  the lyrics/artist/title overlays (images), the history ring (RGBA8, a third of the resolution, 96 layers: 88 MB at
  1080p, twice that at 16 bit; the rewind's VHS look and the echo show light above 1 as white), the export's own
  RGBA16F accumulation (already float), the OIT accumulation (already float).
- *Present.frag* (`uniform float hdrBuffers`, 1 with the switch).  (1) A 16-bit frame keeps what an 8-bit one never
  held: a scene's stray NaN or infinity (a normalize of zero, a division by it) and light far above white -- after
  the sharpening the colour is bounded to 0..64 and a NaN becomes black; the halation's coarse mip is cleaned the
  same way (one NaN pixel reaches every mip above it).  (2) After the exposure a soft shoulder on the brightest
  channel: the identity up to 0.95, above it a Reinhard tail `0.95 + x / (1 + 20 x)` that reaches 1 only at
  infinity, so light rolls off instead of breaking off at the final clamp and its hue holds.  (3) The
  photosensitivity limit comes AFTER the shoulder with the switch (before the exposure without it, unchanged): a
  light far above 1 dimmed before the shoulder would hardly darken on screen.  (4) The time echo's screen blend
  `1 - (1 - c)(1 - g)` would dim light above 1; with the switch it is `c + g (1 - min( c, 1 ))`.  The existing knee
  after the bloom (`c / (1 + max( c - 0.8, 0 ))`) already compresses a source above 1 into 0.8..1, so nothing else
  in the grade had to change.
- *BloomBlur.frag*: the tap bounds the colour to 64 and drops NaN (an identity for an 8-bit frame) -- the blur would
  spread a NaN over a patch.
- *The limiter (SafetyLimit.comp) and the exposure (CfxHistogram.comp).*  The histogram bins each pixel with
  `clamp( sqrt( l ), 0, 0.999 )`: light above 1 falls into the top bin as white does, so its percentiles and the
  highlight guard (`p98 * want <= 1`) work unchanged; only a NaN needed a guard (it would pick no defined bin).
  The limiter reads mips: `frameAt()` takes each texel at most 1 per channel and a NaN as black (one NaN would make
  its scale NaN for good).  That was not enough -- see the measure copy below.
- *The readbacks* (every `glReadPixels`/`glGetTexImage`/`glCopyTexSubImage2D` in Source/, checked one by one):
  the screenshot, the freeze shot and the web remote's preview (glwidget.cpp) read the default framebuffer, the
  recorder (Recorder.cpp) and Spout read the presented picture, the video export (VideoExport.cpp) its own NV12
  conversion of the presented picture -- all after Present.frag's final clamp, unchanged.  The mean colour
  (PresentPass, the top mip, GL_FLOAT) is clamped to 0..1 on the CPU (with a NaN the clamp gives 0).  The CPU
  limiter fallback (no compute) reads its mip as float: its texels are now clamped at 1 like the compute pass's.
  The light-stats hook reads bytes or floats by the source's format.

- *The limiter needed a frame of its own* (Engine/LightMeasure.frag, `PresentPass::measureTexture()`).  The first
  flash test (below) showed the limiter acting far more with the switch than without: over ParticleTunnelFlight the
  flash hazard came on in 48 of 400 logged frames and the scale went down to 0.35 (mean 0.88), against none and 0.98
  at 8 bit -- while the presented video flashed 1.5 times a second, under the limit.  A mip averages linear light: a
  cell of dense particles at 3.0 reads 1.5, clamped 1.0, where an 8-bit pipeline (each pixel clamped first, then
  averaged) read 0.5 and the screen shows about 0.47.  An RGBA8 copy (each pixel clamped, then mipmapped) made the
  limiter what it was -- and blind to the one way light above 1 does reach the screen: as glow, which grows with
  it and pulses with the beat (ParticleTunnelFlight then flashed 2.5 times a second, 1.0 without, the limiter never
  moved).  So with the switch the limiter reads a measure frame drawn each frame at render resolution (RGBA16F,
  mipmapped): each pixel at most 1, plus the glow its light above 1 adds beyond what the 8-bit frame gave --
  `( max( c - 0.7, 0 ) - max( min( c, 1 ) - 0.7, 0 ) ) * 1.6`, BloomBlur's bright pass, weighted as Present.frag
  adds bloom and streaks back (0.12 + 0.05 beat + 0.10 swell, and 0.225 x (0.10 + 0.30 swell + 0.80 drop)).  A frame
  without light above 1 is measured exactly as an 8-bit one.  One pass and one mipmap generation a frame, only with the
  switch.  The exposure histogram reads level 0 pixel by pixel and needs none of it.

- *Settings.*  Until 00:50 the worktrees had no settings file, so every app run of this block before then used the
  app's defaults (an empty private copy); from then on the user's file.  Sets are only compared within one
  condition; L0 kept the defaults throughout (`light_stats.py --default-settings` for its last part).
- *GPU time* (`Tools/perf_labs.py`, 18 s a scene live at the panel's resolution, median of the per-second GPU times,
  switch off -> on): ChainLab2D 0.75 -> 0.84 ms, ParticleTunnelFlight 0.69 -> 0.77, VolumetricFire 1.72 -> 2.12,
  CherenkovCascadeShower 0.68 -> 0.91, AdditiveSpotlightVenn 0.64 -> 0.70, Spaceship 0.77 -> 0.88 -- 0.06 to 0.40 ms
  more, the bandwidth of twice the bytes in every intermediate; 120 fps throughout (before the measure copy).

- *Switch off: the picture bit for bit* (`Tools/scene_snapshots.py`, 45 entries -- additive and solid 3D, labs,
  generated and hand-written 2D, a feedback scene; frozen, silent, defaults).  41 of 45 frames byte-identical to the
  set rendered before the change; 4 differ by at most 0.34 of 255 on average (BeeWaggleDance, CherenkovCascadeShower,
  Spaceship__6, VolumetricFire).  The noise floor, rendered twice with the same build and settings: BeeWaggleDance
  (0.030, max 26), CherenkovCascadeShower (max 6) and Spaceship__6 (0.47, max 14) differ between two identical runs
  as well (a compute simulation, additive points, a model upload); VolumetricFire's difference is one 8 x 8 JPEG block
  (19 pixels, at most 2 of 255) in an additive-blend scene of the same kind.  The common baseline 2026-11-26-base
  had none of these scenes when this ran, so the comparison is against my own set.
- *Switch on, scenes that never pass 1:* 31 of 37 within the snapshot tolerance (mean absolute difference 1/255); 6
  between 1.07 and 1.95 (ChainLab2D 1.95, TunnelPlain 1.53, TwinPhotoLab 1.34, ChainWaveDrosteHex 1.27, FoldLab 1.10,
  DiffractionLab 1.07) with no brightness shift (signed mean -0.2..+0.04 of 255, median absolute difference 1 of 255):
  the scene's output and the trails are no longer rounded to 1/255 before the grade -- the precision the switch is
  for.  The rest sits in the brightest 0.06..0.4 % of the pixels: they were cut at white after the exposure and are now
  rolled off and dimmed by the limiter like everything else (the knee at 0.9 first took 16 of 255 off the whites of
  ChainLab2D; at 0.95, 12 on 0.36 % of its pixels).
- *Switch on, scenes with light above 1* (sheets `sheets/light/L1_on_vs_off_changed.jpg`,
  `L1_open_scenes_off_on.jpg`): ParticleTunnelFlight 19.3 of 255, LargeHadronCollision 9.6, VolumetricFire 7.9,
  CosmicBoidsVortex 5.7, StrangeAttractor 3.6, NeuroSynapseNetwork 3.0 -- the particle sums glow instead of standing
  flat at white, the fire's core keeps its colour; of the open scenes ChladniAcousticPlate 21.9 (mean 70 -> 91 of
  255, its centre a white bloom -- the strongest change), PlasmaVortexGrid 15.1, LightningStorm 14.5,
  LaserSpireArray 13.8, FireflyField 11.0, FractalBloom 3.1 (its small central light now glows).
- *Flashes* (`Tools/flash_count.py`, 20 s at 60 fps over the screening music, worst second of the worst quarter
  window; limiter from `KALEIDO_EXPOSURE_DEBUG`), off -> on with the measure frame: ParticleTunnelFlight 1.0 -> 2.5
  flashes/s (limiter: hazard in 0 -> 11 of 400 logged frames, scale mean 1.00 -> 0.92), VolumetricFire 1.5 -> 1.5,
  ChladniAcousticPlate 2.5 -> 2.5 (hazard 15 -> 126 frames, scale mean 0.92 -> 0.77: the limiter holds the stronger
  glow), FireflyField 2.5 -> 2.5, HarmonicRings 2.0 -> 0.5.  No second above 3 anywhere.  With the limiter forced
  (`KALEIDO_LIMIT_RATE=0.1`, VolumetricFire) it acts the same with and without the switch: scale min 0.494 / 0.451,
  p10 0.783 / 0.768, mean 0.923 / 0.917.  The exposure's median gain is unchanged (0.65 / 0.62, 1.01 / 1.01).

- *GPU memory and the long run* (`Tools/soak.py --shuffle 1`, Allround shuffled, a scene every 6 s, live with the
  review music, `KALEIDO_GL_DEBUG` on).  Off 6 min against on 30 min, the same scenes at the same minutes: +330 MB of
  dedicated GPU memory with the switch at every minute (off 1,110 / 1,217 / 1,558 / 1,620 MB at minutes 1 / 3 / 5 / 6;
  on 1,439 / 1,546 / 1,888 / 1,949), and +310 MB private memory (the driver mirrors it) -- about fifteen
  frame-sized targets at twice the bytes, plus the measure frame.  The 30 minutes with the switch: 304 scene changes,
  0 GL errors, GPU memory 2,525..3,214 MB after the warm-up and falling (-924 MB an hour, private -353 MB an hour):
  nothing grows.  Only 30 minutes (one run, the lock was shared by six agents); the tool's F1 verdict "NOT met"
  is its rule of at least 600 scene changes, i.e. an hour.


### L2 -- scenes that may shine

- *Which.*  From the L0 measurement the scenes whose light lies behind their final clamp (`unclamped`), in a small
  area -- lights, not surfaces: at least 0.2 % and at most 6 % of a typical frame above 1, at most 15 % in any frame,
  and the glow at least 1.3 times as strong (`over_med` 0.002..0.06, `over_max` <= 0.15, `glow_gain` >= 1.3).  40 of
  the 937 measured: 29 generated (lasers, light nets, sparks, bokeh, glowing rings and braids: LaserCausticLines,
  SteelWoolSpiralSparks, BokehSphereGalaxy, MycenaGlowRings, LightCarouselRings ...) and 11 hand-written
  (MayflyStreetLamps, VolcanicLightningAshColumn, HarmonicChangeLightning, WeatherProjectSun, the tears of wine's
  pinch flashes ...).  No lab (none passes 1), no chain scene (none passes 1; and they belong to others).  The 27
  scenes with more than 6 % of the frame above 1 (BioLuminescentTendrilTunnel 56 %, RelativisticKerrPlasmaDisk 28 %
  ...) are left alone: that is a surface above white, and lifting it would make the frame glow.
- *How.*  Generated scenes get `//@light` in their source (Tools/scenegen/src); gen.py then writes the house finish
  with the clamp's upper bound at 3 instead of 1.  The finish's roll-off `t / (1 + 0.35 max)` passes 1 only where the
  scene's colour passes 1.54 -- its brightest light -- and reaches 2.86 at most, so everything the scene shows below
  that stays exactly as before.  The hand-written ones get the same upper bound in their final clamp (8 of 11 have
  the same roll-off before it; BioluminescentDeepSeaCombJelly, HyperbolicHoneycombTessellation and
  HyperspaceKaleidoscopicMatrix are cut at 3).  An 8-bit target converts every value above 1 to 1 -- also before
  blending -- so with the switch off the scene's output is the byte it was: no uniform, no second code path, and the
  editor and the catalogue (8-bit) keep the old picture too.  28 of 29 generated scenes regenerated byte for byte
  apart from the finish; TextureDelaunayLightNet's committed file had drifted from its generator (a library section
  and a uniform less), so its two lines were changed by hand and the tag is in its source for the next regeneration.

- *Switch off* (40 scenes, frozen, silent, the user's settings, against the same scenes rendered just before the
  change with the same build).  The first render after the change: 28 byte-identical, 12 different -- 6 of the 8
  scenes with a state field of their own (CounterpointBraids 3.18 of 255, RibbonGymnasticsNeon 0.85,
  VortexColumnsDust 0.64 ... -- their forms stand a little elsewhere, not brighter) and 6 others by at most 0.08.  To
  find out what did it, the 12 were rendered again, and with the OLD source put back for the length of a render: the
  old source rendered now is byte-identical with the new source rendered now in 11 of 12; the first render after the
  change differed from both (the driver's first compile of the changed source -- a repeat render agrees), and
  ExBDriftCycloids and CounterpointBraids differ between the two sessions whatever the source.  The one real
  difference: HyperspaceKaleidoscopicMatrix, reproducibly one JPEG block (mean 0.009, at most 9 of 255) -- the driver
  compiles the changed clamp constant into slightly different arithmetic; with the old source it is byte-identical
  again.  For the merge: a changed scene that differs in the full-catalogue comparison should be rendered once more
  before it is judged.
- *Switch on with the lift, against switch off* (`sheets/light/L2_off_vs_on_1.jpg`, `L2_off_vs_on_2.jpg`): 1.0..2.7
  of 255 (MarangoniConvectionTearsOfWine 2.7, WeatherProjectSun 2.3, VolcanicLightningAshColumn 2.0 ...); against
  switch on without the lift 1.1..2.7.  In a silent frozen frame the lights are dim -- much of their brightness is the
  music's -- so the frames differ little; the cores no longer stand flat.  Surfaces do not change.
- *With the music* (clips `sheets/light/clips/L2_*_off_left_on_right.mp4`, 20 s at 60 fps over the screening music,
  left off, right on; a frame at 9 s in `L2_clip_frames_9s.jpg`): the street lamps' cores keep their warm orange
  instead of clipping to white, the laser lines and the lightning gain a wider halo.  Flashes per second: LaserCaustic
  Lines 0.0 / 0.0, SteelWoolSpiralSparks 0.0 / 0.0, MayflyStreetLamps 0.0 / 0.0, VolcanicLightningAshColumn 0.5 /
  0.5; the limiter never acted (scale 1.000 throughout, no hazard), the exposure's median gain unchanged (1.05 / 1.01,
  1.51 / 1.51, 1.01 / 1.01, 1.02 / 1.01).  Mean luminance 0.023 -> 0.026, 0.023 -> 0.026, 0.027 -> 0.025, 0.066 -> 0.072.
- *GPU time* (`perf_labs`, 18 s live, median, off -> on with lift): LaserCausticLines 0.68 -> 0.85 ms,
  SteelWoolSpiralSparks 0.92 -> 1.07, MayflyStreetLamps 1.25 -> 1.38, VolcanicLightningAshColumn 0.54 -> 0.71 --
  +0.13..0.17 ms, the 16-bit targets and the measure pass (the lift itself costs nothing); 120 fps throughout.

### Tried and dropped

- *A knee at 0.9* for the shoulder: it took 16 of 255 off the whites of scenes that never pass 1 (ChainLab2D);
  0.95 takes 12 on 0.36 % of its pixels.
- *An RGBA8 copy as the limiter's measure* (a blit): exactly the 8-bit limiter again, but blind to the glow that light
  above 1 adds -- ParticleTunnelFlight's video flashed 2.5 times a second with the switch, 1.0 without, and the
  limiter never moved.  Replaced by Engine/LightMeasure.frag (the clamped pixel plus the extra glow).
- *Reading the 16-bit mips as they are* for the limiter: the hazard on a particle field that does not flash (above).
- *Measuring the catalogue at 480 x 270* (as reactivity.py does): a light of one or two pixels at 1080p averages away
  at a quarter of the size; 960 x 540 was kept (1.0..1.9 s a scene once the driver's cache is warm).
- *Lifting the clamp of scenes with large areas above 1* (27 measured, over 6 % of the frame): a surface above white,
  not a light -- left alone.

### For the user

- Whether 16-bit intermediates become the default (or a setting): the switch costs 0.06..0.4 ms of GPU time a frame
  at the panel's resolution and some 330 MB of GPU memory; it changes the 84 additive 3D scenes and some 60 open ones
  noticeably (ChladniAcousticPlate the most: its centre becomes a white bloom, and the limiter dims it more often), the
  40 L2 scenes slightly, the rest within a step of 255.  Sheets in `sheets/light/`, clips in `sheets/light/clips/`.
- The history ring (rewind, echo) stays 8 bit: in a rewind light above 1 shows as white.
