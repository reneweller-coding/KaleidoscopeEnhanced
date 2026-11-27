## 26.11.2026 (69, depth): the photo's depth -- loaded with the photo, passed on by 2D scenes, read by the effects

Plan T1-T4, M2, M3 (docs/PLAN_2026-11-26.md).  Until now the app knew of a photo only its mean brightness and
colourfulness; five depth effects, the 2.5D parallax and the stereo worked with the 327 3D scenes only.  This section is
the agent "depth"'s part; the depth maps themselves come from `Tools/depth_maps.py` (agent "maps", T0/M1).  The user
chose the model on 27.11.: Depth Anything 3 Mono Large without its sky head (`da3ml_nosky`: 418 of the 977 photos get a
map, the rest are flat; 53 have a centre the maps are sure of).  The acceptance runs before that used the test default
`dav2s`; the final sheets (`*_da3ml.jpg`) and the T2 perf comparison use da3ml_nosky.

### T1 -- the depth in the app

- *Where the depth travels.*  In the ALPHA channel of the photo textures (tex0, tex1, the second photo).  Then the depth
  shares everything the colour has: the coordinate, the mirroring, the mipmaps, the cross-fade between two photos, the
  copy into the second photo (`takePhotoB()` blits all four channels).  The loader (`Source/PhotoDepth.h`, header-only
  so that the app, the editor and the self test run the same code) reads `<photo folder>\.depth\<name>.png` (or
  `KALEIDO_DEPTH_DIR\<name>.png` first) in the loader thread, mirrors it vertically and stretches it with
  `Qt::SmoothTransformation` to the prepared photo's size -- the colour's own geometry in `prepareImage()` -- and writes
  it into the alpha byte.  Without a map, for a photo `photo_info.tsv` marks flat, with `KALEIDO_NO_DEPTH=1`, and for
  the live inputs (Spout, video) alpha stays 255 and the slot's `photoDepthAmt` is 0.
- *Per slot, swapped with the textures.*  `RenderPipeline::m_actDepth/m_nextDepth` (a `PhotoDepth::Info`: map yes/no,
  the subject centre in texture coordinates -- image y runs down, the upload mirrors, so v = 1 - fy -- threshold,
  confidence) follow `m_actTex/m_nextTex` through every swap; `updateImageState()` hands them to every shader as
  `photoDepthAmt` (vec2), `photoFocus` (vec4: xy tex0, zw tex1) and `photoSubject` (vec4: threshold, confidence).  A
  shader mixes them with `interpolation` like the colour.
- *Who read the alpha before.*  A scan over every shader that samples tex0/tex1/texPhotoB0/1 (or the compute FX's
  texSrc/texPhoto): each sampling call is followed out through its enclosing groups and component-wise calls (mix, max,
  clamp ...) until a swizzle; a swizzle without a/w is safe, anything else is listed.  2,424 files, 7,920 calls; listed:
  24 sites in 10 files.  Real readers: six 2D scenes that passed the photo's alpha on into their own output
  (`Kaleidoscope`, `Tunnel`, `TunnelPlain`, `TunnelAcceleration`, `TunnelReverse`, `DarkAmbientTunnel`: `vec4 col =
  interpolation * texture( tex0, uv ) + ...; fragColor = col`).  They now build that vec4 from `.rgb` and an alpha of
  exactly 1 -- what an opaque JPG gave them (the 977 photos are all JPGs; the fallback image is opaque).  False alarms:
  `HarmonicRings` (a vec4 helper whose callers take `.rgb`), `Engine/OverlayBlend.frag` (tex0/tex1 are the two overlay
  outputs there, not photos), the ChainLab3D/ChainSlice3D final passes (a local vec3 named tex0).  The FX and
  transitions see the finished scene frames as tex0/tex1, not the photos.
- *The photo walk.*  `RenderPipeline::traverse()` takes every PNG it finds as a photo; it skipped `.depth` only because
  `QFileInfo::baseName(".depth")` is empty.  It now skips the folder by name (`PhotoDepth::isDepthFolder()`).
- *The editor* (`PreviewWidget::makeTexture()`) writes the map into its own RGBA8888 photo at the photo's own size (it
  never stretched to 1024) and sets the same three uniforms (`setDepthUniforms()`).
- *Self test* (`Kaleidoscope.exe -q`, `depthChecks()`): a photo with a map, one without, one marked flat; the colour
  bytes stay exactly prepareImage()'s; the alpha follows a red ramp through mirror and stretch (worst difference 5 of
  255 between a 32-row and a 16-row ramp); the near top lands on texture v = 1; the table's subject centre becomes
  texture coordinates; KALEIDO_DEPTH_DIR first; KALEIDO_NO_DEPTH gives the old image; the editor's format.
- *Measured.*  The self test's depth bench (`KALEIDO_DEPTH_BENCH=<photos>|<maps>`, 40 photos x 3 loads, the dav2s maps):
  12.9 ms per photo without the map, 16.2 ms with it -- 3.3 ms more in the loader thread (decoding the PNG, mirror,
  smooth stretch, the alpha loop), nothing on the render thread.  In 36 generated Chain* scenes (T2) that extra load
  time shows up: their frozen comparison frame takes one of two states depending on how fast the first photo arrives
  (max 16, mean <= 0.41 of 255 apart), with the old shaders too, and a cold shader cache flips it the same way without
  any map -- not a reader of the alpha.
- *Acceptance.*  Snapshots of 141 scenes -- the 34 labs (ChainLab2D and the nine labs that got depth among them), the
  seven scenes the alpha scan named, 100 scenes drawn from those 2026-11-26-base already had -- once from a checkout of
  b87fcc34 with its own exe, once from this tree with the dav2s maps (the snapshot photo kristallhoehle-indigo-fuchsia-2
  has a map, not flat), both on the user's settings file: 127 identical.  The 14 others are not the depth:
  SpaceElevator, BeeWaggleDance, BorromeanRingsOrbit, FerrisWheelNight, KiteFestival and TunnelAcceleration also differ
  between the old checkout and the common baseline (same build, two runs); four mesh scenes had no models in the old
  checkout; Kaleidoscope, Tunnel, TunnelPlain and TunnelReverse flip between the same two frames from run to run -- with
  the new exe, the OLD shaders and no maps too (three are KaleidoscopeBase scenes, whose power and rotation ramps run on
  wall-clock timers; why TunnelPlain flips was not looked into).  Self test 150 passed, 0 failed.
- *Traps on the way.*  The worktrees had no settings file, the baseline was rendered on the user's: every compare
  against the baseline differed until both sides had the same file (found by the agent "guard").  The first version of
  the six alpha scenes rewrote the colour expression; it now stays word for word and only `col.a = 1.0` follows.

### T2 -- the 2D scenes pass the depth on

- *How a scene says it.*  A line `// @depth` in the fragment source (EffectShader::writesDepth(), read from the file the
  program was built from -- the chain runner's final pass for a chain lab -- and cached per program, so a hot reload is
  seen).  In the scene generator a source says `//@depth`; gen.py then declares `photoDepthAmt` and `photoDepthWin` and
  appends DEPTH_LIB: `photoDepthLod(uv, lod)` (the alpha of tex0/tex1 at the colour's coordinate and mip level, each
  photo weighted with the cross-fade and with whether it has a map) and `photoDepthOut(d)` (gl_FragDepth).
  make_chainpass.py carries the line into Final_ChainLab2D.frag (it strips comments otherwise).
- *GL state.*  gl_FragDepth only lands with the depth test on: for such a scene EffectShader::draw() enables the test
  with GL_ALWAYS and the depth writes, draws, and restores what was there.  The host still clears a 2D scene's depth
  first (cheap; a scene whose draw is skipped leaves the far plane, not a stale silhouette).
- *The mapping.*  One host value, `photoDepthWin` = the window depths of two distances in the shared projection
  (EffectShader::M_PhotoDepthDist, default 8 and 80 units; `KALEIDO_DEPTH_RANGE=near,far` for calibration runs).  The
  scene writes mix(far, near, d): linear in window depth is linear in inverse distance, which is what the maps are
  (relative inverse depth, stretched per photo).  The effects linearise as they always did and learn nothing new.
- *How real the depth is.*  depthValid of a 2D scene with `// @depth` is the photos' share with a map -- interpolation *
  photoDepthAmt.x + (1 - interpolation) * photoDepthAmt.y -- so it fades with a photo cross-fade between a photo with
  and one without a map; `depthPhoto` (per scene slot) says the depth is a photo's.  Without any map the scene writes
  the far plane and depthValid is 0: the effects pass it through, exactly as before.
- *The depth view.*  `KALEIDO_SHOW_DEPTH=1` (RenderPipeline::renderDepthViews(), Engine/DepthView.frag) writes each
  scene's depth buffer as grey over its colour before the combine stage: the photo's depth 0..1 for a 2D scene with
  depth, the linearised distance (log scale to 60 units) for a 3D scene, black for none.
- *Which scenes.*  ChainLab2D (and its runner pass): the depth at the chain's end point, at imgChain()'s mip level.
  Nine labs whose looks take the photo at one deformed coordinate each (DefectLab, FoldLab, GlassLab, MeterLab,
  MirrorBilliardLab, PartitionLab, SequenceLab, StripLab, TimeChainLab; `Tools/scenegen` patch_labdepth): the look keeps
  that coordinate (puv, plod) and its depth, main sums the depths with the walk's weights.  Not given depth: labs that
  paint their own forms or gather the photo from many places (Engraving, Perception, Separation, Diffraction, Band,
  Exposure, FlowPaint, Microscope, TwinPhoto, Atlas -- its globe sits on a blurred copy of the undeformed photo),
  ChainLabTunnel and the 3D labs (their depth is their geometry).  And 36 of the generated Chain* scenes: their template
  (make_chains.py) calls imgChain() in main exactly like the lab, so `//@depth` and the same two lines after imgChain()
  went into each src (patch_chaindepth).  A full gen.py run of these scenes would drag in 1,067 lines of the later
  CHAIN_LIB (generator drift, see wedge-fold note): only the depth hunks (the diff between gen.py of the old and the new
  src) were applied to the committed files.  The nine Chain* files without the template line (the 3D chains,
  ChainmailRingRipple, ChainLinkFenceShadow ...) are not touched.
- *The AudioLocCache trap.*  EffectShader caches the per-frame uniform locations in `GLint L[96]`, indexed by the AL_
  enum -- T1's three new uniforms made AL_COUNT 97 and the last location overran the array: every app start crashed in
  its first frames (0xC0000005), which the first acceptance run showed as 141 "FAIL" snapshots in 1.7 s each.  Now 128
  slots and a static_assert that AL_COUNT fits (6fd034a3).
- *Acceptance.*  Colour bit for bit with the dav2s maps: ChainLab2D and the nine labs are among the 127 identical
  snapshots of T1's 141.  chain_regress --every 6 (the runner against the uber shader, 12 combinations, synthetic maps
  on its photo): 0 differ plain, 0 with KALEIDO_SHOW_DEPTH, 0 with the depth looks on.  shadercheck: 60 files, 0 errors,
  0 warnings.  Depth views looked at: sheets/depth/t2_chainlab2d_depth.jpg (12 combinations), t2_labs_depth.jpg (nine
  labs x 3 seeds), t2_chain_scenes_depth.jpg (the 36 Chain*).  The 36 Chain* scenes without maps: bit for bit; with maps
  the old shaders give the new frames exactly (see T1, *Measured*).  perf_labs (10 scenes x 30 s, looks off, each run
  alone on the machine; the old checkout against this one with the da3ml_nosky maps), GPU median in ms: ChainLab2D 0.70
  -> 0.72, DefectLab 0.90 -> 0.92, FoldLab 0.79 -> 0.78, GlassLab 0.78 -> 0.77, MeterLab 0.80 -> 0.78, MirrorBilliardLab
  1.09 -> 1.09, PartitionLab 0.77 -> 0.78, SequenceLab 0.78 -> 0.78, StripLab 0.77 -> 0.78, TimeChainLab 0.81 -> 0.80 --
  the noise of the measure; 120 fps throughout.  (A first after-run at 02:30 read 2.0..2.9 ms for every scene: perf_labs
  sat inside a job whose label and command did not name it, so heavy.py did not run it alone; the repeat names it.)

### T3 -- the depth effects, the parallax and the stereo on a photo

- *How the effects reach a scene today.*  The five depth effects are ordinary combine shaders of the presets
  (FxDepthField, FxDepthFog, FxRimLight, FxAmbientOcclusion, FxSunShafts: in 6 to 8 of the 12 presets, probability
  0.004..0.006, against FxPlain's much larger share).  The scheduler draws a combine at random within the complexity
  budget and the mood (SceneScheduler.cpp, the MaxSearch loop); `isMeshCalmFx()` only lists them among the combines a
  model scene may get.  Nothing pairs them with 3D scenes: a 2D scene draws them as often, and they passed its layer
  through (depthValid 0) -- they acted only on a 3D layer.
- *On a photo.*  Each effect takes `depthPhoto` (per scene slot) and is quieter there -- a photo is no room:
  FxDepthField focuses on the photo's subject (photoSubject from confidence 0.5, else depth 0.6) with half the aperture,
  a circle of confusion of at most PhotoMaxCoc 0.4 of a room's and no rack focus on the music (the depth spans 8..80
  units, so most of a photo lies far from any focus; the sheet's mean change went from 11.4 to 9.7 of 255); FxDepthFog
  thins the air (PhotoDensity 0.7); FxAmbientOcclusion at PhotoAO 0.6; FxSunShafts lets the light through the photo's
  far third (PhotoShaft 0.6) instead of its sky (a photo has none: its far end is 80 units, the sky test starts at 77).
  FxRimLight has its own function for a photo, litPhoto(): PhotoRim 0.35 of the rim, no fill (a photo faces the camera
  almost everywhere, the fill lay on the whole picture as a veil), and a normal measured across the map's 8-bit terraces
  (central differences over PhotoStep = 2/270 of the height; lit()'s shorter side lies flat on every terrace wider than
  its step) on a flattened relief (PhotoFlat 0.15: the 8..80 units make nearly every slope of a photo steep, and the rim
  covered it, +17 of 255 on average; flattened, only the depth edges -- the subject's outline -- stay steep enough to
  catch the light) seen straight on (V = +z: from the camera, a flat photo's corners turned away like a vignette).
  depthValid between 0 and 1 (a photo cross-fade between a photo with and one without a map) fades each effect in.  For
  a 3D layer (depthValid 1, depthPhoto 0) every effect computes exactly what it did: lit() is the old function word for
  word, and the other four take the photo's values through `depthPhoto > 0.5 ? photo : room` selects.
- *The 8-bit terraces* (plan T1, Fallen).  A ramp map (synthmaps, 256 levels over the height) under ChainLab2D: the rim
  and the occlusion against the plain frame, averaged per row, then the share of fine-scale roughness (|second
  difference| / |first difference|) and the strongest period: rim 1.48 (litPhoto: 1.55 -- of a change ten times smaller,
  +0.45 instead of +4.8 of 255; |d2| 0.199 -> 0.158), occlusion 1.44 (white noise gives 1.73, a smooth profile 0),
  period 18 rows, amplitude 0.06..0.08 of a grey level (the rim's now 0.04).  At x6 the old rim's difference image
  showed the terraces as a fine hatching inside the folds; that is what PhotoStep removes.  The occlusion is left as it
  was: its difference image shows the relief's shapes and grain, no hatching (its normal comes from dFdx/dFdy per 2x2
  quad, and its samples sit 0.2..9 % of the frame away -- many levels).
- *Parallax.*  Present.frag: a second, separate term on the photo's depth -- near and far shift against each other
  around the middle depth (`(d - 0.5)`, so the frame as a whole stays where the camera drift puts it), strength
  `depthParPhoto` = 0.35 x the slewed "a scene with photo depth is up" (RenderPipeline::m_photoDepthUp, the same 2.5/s
  ramp as the 3D parallax).  Its only motion is the existing camera drift camOff -- and calmMotion (the default) zeroes
  the drift: with calmMotion on, the photo parallax does not move at all.  Measured with calmMotion off (identity chain
  on a disc map, frozen frames with and without the map, the shift per region): at 20 s, camOff = (-0.0030, -0.0029),
  the discs (depth 1) move by (-0.6, +0.2) px and the ground (0.1) by (+0.5, -0.2) px of a 640-px frame -- they part by
  0.0017 of the frame (about 5 px at 2880), as the formula says; at 26 s (camOff 0.0009) by 0.2 px.
  sheets/depth/t3_parallax_strip.jpg replays a drift period in numpy (true size and x8).
- *Stereo.*  `stereoDepthAt()` mixes the brightness guess with the real photo depth by `stereoPhoto` (the same slewed
  value): a scene without depth keeps the old guess exactly (stereoPhoto 0).  Measured on the disc map (half
  side-by-side, stereoDepth 1, regions from the depth view): the discs stand -0.0125 of the eye's width against the
  ground (crossed: in front), Present.frag's 2 x 0.007 x (1.0 - 0.1) predicts 0.0126; the brightness guess on the same
  frame gives +0.0009 -- it does not see the discs.  (A trap of the measuring tool: a DSHOT_INI line was added under
  [General] while the settings copy already had stereoMode=0 further down, and that line won -- the first run was mono.
  depthshots.py now drops the copy's line first.)
- *Acceptance.*  Before-after sheets, 12 scenes with depth (ChainLab2D in four combinations, eight labs) x the five
  effects, without and with the dav2s maps: sheets/depth/t3_depth_effects_a.jpg, _b.jpg and one sheet per effect
  (t3_Fx*.jpg).  Mean change of a frame, of 255 (on a photo | PillarHall, a 3D room, for comparison): FxDepthField 9.7 |
  3.8 (fine detail goes soft, so the photo's number is high at a small radius), FxDepthFog 2.8 | 2.5, FxRimLight 8.6,
  +7.1 brighter on average (first version 20.2 and +16.7, a veil; without the fill 21.7; the flattened relief 13.8; seen
  straight on at PhotoRim 0.35 8.6) | 9.6, FxAmbientOcclusion 2.9 | 1.1, FxSunShafts 5.2 | 14.3.  With the maps the user
  chose (da3ml_nosky; sheets t3_*_da3ml.jpg): 9.7, 2.9, 10.7 (+9.2), 2.3, 6.0.  A 3D layer bit for bit: the five effects
  on two 3D scenes (AbandonedStarGate, PillarHall) from the old checkout and from this one, 12 of 12 frames identical,
  and again after litPhoto() and the blur cap (4 of 4, then 2 of 2).  `Tools/stereo_ab.py` against the old checkout: 4
  scenes x 4 stereo modes, 16 of 16 identical (max 0).  Stereo disparity with real depth and the parallax measured
  (above).  `Tools/temporal_budget.py` (0 errors, 4 warnings) and `Tools/shake_scan.py` print exactly what they print on
  the old checkout.  doc_shaders --check and cgvr_format --check: nothing to change.  Not seen: the impression on the
  screen and in the headset -- the user's.

### T4, M2, M3 -- depth as a knob in the labs

- *ChainLab2D* gets `depthLook` (0 = off, the old look bit for bit) and `depthVar` (0..99, the variant: the look's
  constants from dv(), variant 0 = the middle of every range; the rule of the variant round of 23.10.).  Neither is in
  any preset: a show never sees a look until the user decides (a preset entry `<float name="depthLook" ...>` pins it, as
  the sheets did).  Looks: 1 parallax before the fold (the photo sampled at the chain's end point shifted by (depth -
  0.5) x a slow drift on sceneTime: near and far glide against each other in the kaleidoscope -- a motion, a still frame
  shows hardly anything); 2 depth cut (the far layer folded once more with its own mirror count, a soft edge at a depth
  threshold); 3 depth wave (brightness bands running from near to far, 0.08..0.18 Hz plus sceneAdvance -- light only,
  within the temporal budget); 4 subject anchor (M2: each photo shifted by its own subject offset, so the fold centre
  samples the subject; no map or a confidence under 0.45..0.55 -> the centre, the maps trust a centre from 0.5;
  continuous through a photo cross-fade because each photo keeps its own offset); 5 subject stays whole (M3: inside the
  soft mask depth >= threshold the photo unfolded with a slight parallax, around it the chain folding around the
  subject; the edge's width breathes with audioSwell, 0.7..1.3).  The mask is drawn only where depth >= threshold really
  outlines the subject: photoMask (the maps' IoU, photo_info.tsv's `mask`) through smoothstep(0.55, 0.65) -- with
  da3ml_nosky 155 of the 418 photos with a map reach 0.6; a receding photo's near foreground passes the threshold too,
  which the mask column catches.
- *M2 in two more labs:* TimeChainLab and MirrorBilliardLab take `depthLook` 4 at their one photo lookup.
- *M3, second stage (estimate only, not built).*  Particles behind the subject: in the lab's own pass, N layers of round
  jittered points (rule V8e) at a nearness each, a point drawn only where its nearness exceeds the photo's depth -- the
  depth fetch is already there; 3 layers x a 3x3 cell neighbourhood is about 400 ALU per pixel, an estimated 0.1..0.2 ms
  at 2880x1620 on this GPU (the lab costs about 0.7 ms).  Streams that flow around the subject need a state pass
  (`//@state`, a half-resolution RGBA16F field, ~9 MB, ~0.3 ms) the chain lab does not have yet.
- *A trap of the sheets.*  An added knob in a scene's preset entry moves the rolls of what comes after it: a frame with
  `depthLook=4` pinned is no "before" for one without the knob.  The first M2 sheet showed every photo changed by look
  4, even those without a sure subject (mean 4..18 of 255 apart); with `depthLook=0` pinned in the L0 frames those are
  bit for bit the same, and look 3 against L0 is a pure brightness change (log ratio std 0.06..0.10, 0.49 against the
  unpinned L0).  The sheets' L0 frames carry `depthLook=0` (and depthVar where the look rows have it).
- *Acceptance.*  Variant sheets (sheets/depth/t4_m3_variants_lehmwurf_da3ml.jpg, _glasschmelze_da3ml.jpg; with dav2s the
  same names without _da3ml): two photos with a sure subject (lehmwurf-fruehling-zinnober-2: confidence 0.95, mask 0.57
  -- look 5 draws a faint mask there, 0.12 of it; dav2s 0.82 and 0.53, none; glasschmelze-schwefel-2-lk: 0.60, mask 0.94
  -- the whole subject), ChainLab2D in two combinations, each look in variants 0, 13, 37, 64, 88 next to the depth
  views, and look 4 in TimeChainLab and MirrorBilliardLab in three seeds.  M2 sheets (m2_subject_anchor_1_da3ml.jpg,
  _2_da3ml.jpg; with dav2s m2_subject_anchor_1.jpg, _2.jpg): the 20 photos the maps picked by eye for a subject away
  from the centre, three labs, look 0 | look 4.  With da3ml_nosky the 16 photos without a centre the maps are sure of
  (two of them flat) keep it -- 48 of their 48 pairs bit for bit --, the four from confidence 0.50 move their fold (mean
  14..43 of 255).  With dav2s: 13 under 0.45, 38 of their 39 pairs bit for bit (one 5 of 255 apart at a few pixels),
  seven moved.  The maps' `conf` is the confidence in that centre: the anchor acts on what the maps trust -- 53 of the
  977 photos with da3ml_nosky --, which is not always what the eye calls the subject.  chain_regress --every 6 with the
  looks on: 0 of 12 differ (before the mask gate moved to 0.55..0.65 -- the same text in the runner's final pass and the
  uber shader).  perf_labs ChainLab2D with each look (30 s each, dav2s maps, alone on the machine): GPU median 0.72 ms
  without a look, 0.73 with looks 1 to 4, 0.76 with look 5 (three more photo reads), 120 fps throughout; the old
  checkout's ChainLab2D 0.70 ms.
