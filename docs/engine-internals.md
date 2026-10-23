# Engine internals

The main [README](../README.md) covers what the app does and how to run it.
This document is the deep dive: how the audio analysis actually works, how
individual scenes are built, and the graphics techniques (OIT, shadow maps,
compute → indirect draw, tessellation, geometry shaders) the engine offers
scene authors. It's written for contributors and the curious, not as an
onboarding document — several sections are debugging war-stories kept for
the lessons they carry, not as user-facing feature descriptions.

---

## How the audio reactivity works

Audio is captured via WASAPI loopback (`AudioAnalyzer`) and analysed in real time
(no external libraries; FFT is a hand-rolled radix-2). Features extracted include:

- **Energy / rhythm:** 6-band levels, overall loudness, beat detection,
  full-spectrum **onset** detection (snares/claps/melodic, not just kicks),
  **downbeat** accents, tempo, rhythm strength, continuous **beat phase**.
- **Spectrum / timbre:** spectral centroid, rolloff, spread, flux (+ variance),
  flatness, **sharpness**, **roughness** (Plomp-Levelt), zero-crossing rate.
- **Harmony:** chroma, musical **mode** (major/minor, Krumhansl-Kessler), **key
  clarity**, **harmonic change** (HCDF), dominant pitch, **chroma hue**.
- **Mood (Thayer):** **arousal** and **valence** derived from the above.
- **Stereo width**, **delta-pitch**, and a **music-vs-speech** classifier
  (`musicPresence`).

**Mapping highlights**
- Motion is **transient-dominated** (beats / onsets / spectral change), so the
  average speed with music ≈ without music, but it visibly pulses.
- A global **mood grade** (final present pass) colours *every* effect: centroid →
  colour temperature, valence → saturation, chroma → hue, loudness → brightness.
- **Volume independence:** automatic gain control normalises levels, so a track
  played quietly or loudly looks the same.
- **Adaptive timing:** fast music cuts scenes quickly, ambient holds for minutes
  (`timingScale` ≈ 0.10× for drones … 2.8× for fast high-arousal tracks divides
  every solo/cross-fade time); strong harmonic changes trigger musically-placed
  transitions.
- **Section detection (Strophe → Refrain → Bridge):** a real-time Foote-style
  novelty detector compares a short-term (~2.5 s) against a long-term (~18 s)
  average of the normalised 32-band spectral shape + band energy
  (bias-corrected EMAs).  When the arrangement changes — chorus enters, drums
  drop out for a bridge — the analyzer bumps `sectionCount`; the host then
  forces an **early cut with a short (0.8 s) cross-fade**, still quantised
  onto the next downbeat, so a new shader lands on the "1" of the new section
  (every second section also swaps the combine pass).  Rate-limited to one
  section per ~12 s; verified offline with a synthesized verse/chorus/verse
  WAV (triggers ~2–4 s after each boundary, zero phantom triggers).
  A trigger (section, harmonic novelty, drop) that lands while a cross-fade
  is already running does NOT queue a second change — the fade in flight
  is the change; a drop instead snaps that fade to completion within
  ~0.15 s so the cut still lands on the hit.  Trigger-driven changes also
  respect a 2 s minimum solo (a manual 'n' keeps 0.6 s); otherwise a
  trigger right after a fade cut the freshly arrived scene away again
  after 0.6 s — visible as a scene "flashing in and being replaced".
- **Song-structure MEMORY:** each section additionally gets a spectral
  fingerprint (a ~1 s shape average, cosine-matched against up to 8 stored
  prints).  A RETURNING section — chorus #2 — is recognised (`sectionId`)
  and **replays the exact shader, combine and rolled parameter values** it
  had the first time; new sections roll fresh and are remembered.  The
  visuals thereby follow the song's form: every chorus looks the same,
  every verse different.  (V-C-V-C test WAV: ids 0, 1, 0 — the returning
  chorus matched with similarity 0.995 vs 0.888 for a different section.)
  Two guards keep this from degenerating over an evening: `sectionId` is
  a RECYCLED 8-slot LRU index, so the scheduler only replays when the
  analyzer's `sectionKnown` flag says the fingerprint actually matched
  (a new section of a later song that merely inherits an old slot id
  rolls fresh), and a stored look expires after ~24 sections (~5+ min,
  i.e. within one song — never across the set).  Without both, every id
  was "known" after the first ~8 sections of a session and the whole
  night cycled through the same handful of scenes.
- **Mood-matched shader selection:** config entries can carry
  `mood="dark|bright|calm|aggressive"` tags (comma list).  The next-shader
  choice biases toward tags agreeing with the live mood (valence → dark/
  bright, arousal + ambient → aggressive/calm) on top of the existing
  complexity-vs-arousal matching — a soft probabilistic bias with a floor,
  never a hard filter.  Untagged shaders stay neutral.
- **Echo-warp trails:** the feedback pass now samples the previous frame
  slightly **zoomed + rotated** around the centre, so bright structures
  leave expanding, swirling, hue-drifting echo tunnels; the beat pumps the
  outward zoom, ambient passages get longer trails, and the rotation
  direction swings smoothly.
- **Drop-rewind & time-echo (present pass):** the last ~3.2 s of frames are
  kept in a GPU history ring (96 layers, third-resolution). On roughly 40%
  of drops the picture **rewinds** ~1.6 s and tape-catches-up over ~0.5 s,
  landing exactly on the hit — sold with VHS artifacts (line jitter, a
  chroma offset, scanlines, band noise) that read as "the tape is
  spooling" and incidentally hide the ring's lower resolution; a DJ-STOP
  scrubs backward the same way and snaps live on the slam-back. Separately,
  a faint **time-echo** — the scene from ~1.4 s ago, screen-blended and
  slightly enlarged — drifts under ambient passages and flares briefly
  after a drop. Both fall back to the plain live frame if the GPU can't
  provide the history-ring extensions (`glTexImage3D`/
  `glFramebufferTextureLayer`/`glBlitFramebuffer`).
- **Cinema-camera look:** four always-on grade/motion touches meant to read
  as "shot on film," not rendered. **Anamorphic streaks** stretch the bloom
  buffer's highlights out horizontally with a cool tint (the classic
  anamorphic-lens look), breathing with the loudness swell and flaring hard
  on drops. **Halation** adds a warm, wide-blurred glow around bright
  highlights — the soft "film emulsion" bleed real camera film has, as
  opposed to a clean digital bloom. **Film grain** is fine zero-mean pixel
  noise (no fullscreen brightness flicker, so it's photosensitivity-safe by
  construction), stronger in shadows like real emulsion and a touch more
  present while music is playing. **Gate-weave** is the tiny, discrete
  24fps-hashed jitter of a real film projector's gate, folded into the
  virtual camera's offset — the zoom always pays for whatever offset it
  produces, so it rides the same "no edge ever shows" contract as the
  camera drift/shake and needed no extra safety margin of its own.
- **Instrument-separated onsets:** the 32-band flux is split into low/mid/
  high groups with separate spike tests → `audioKick`, `audioSnare`,
  `audioHat` uniforms (peak-hold + slew like the global envelopes).
  Crossmodal mapping: kick → ring waves / ray bursts, snare → lattice
  flashes, hats → glitter shimmer (adopted by Metamorph + DiscoGodrays;
  available to every shader).
- **Beat-quantised cross-fades:** with a confident rhythm, natural scene
  transitions last exactly **4 beats** (from the estimated BPM) instead of
  the config's fixed seconds — transitions breathe in the song's tempo.
- **Key colour without jumps:** the chroma hue is slewed AROUND the colour
  circle (shortest way, ~20°/s), so the key-driven global palette glides
  through key changes instead of snapping.
- **GPU fluid (`Fluid.frag`):** the source image as INK, advected
  semi-Lagrangian along the curl of a noise potential (divergence-free →
  genuinely incompressible flow, no pressure solve needed).  Bass powers
  the swirl, onsets pour in fresh dye, and the field can fold into a
  kaleidoscopic mandala per activation (`sidesP`/`zoomP`).
- **Preset editor — real audio preview:** load a WAV (`w` / the Audio-WAV
  button); it runs through the ACTUAL analyzer offline and the resulting
  feature timeline (looped, with sound) drives the preview instead of the
  synthetic profile — tune presets against real music.
- **Robustness:** malformed configs (zero valid combine/texture entries,
  min == max time ranges) no longer crash with a silent division by zero —
  they fall back with a clear stderr warning.
- **Spout output (`-o`):** publishes the displayed frame as Spout sender
  "Kaleidoscope" for OBS / Resolume / any Spout receiver -- since 16.10.2026
  really the displayed one, sent after the present pass with the limiter,
  blackout, grade and titles (`spoutSource=clean` in the ini: the raw render) (Spout2 SDK
  vendored under `ThirdParty/SpoutGL`, BSD-2; isolated in its own
  translation unit so its GL extension loading never collides with the
  app's own `glcore` loader).
- **Latency compensation (`;` / `'`, persisted):** loopback capture +
  analysis + render + scanout lag the heard audio by ~40–80 ms; the display
  phase (tempo pulse, beat/bar phase) is led by an adjustable amount
  (default 50 ms) so pulses land ON the beat you hear.
- **Scene transitions (`Transitions/`, 83):** each scene change rolls one
  shader from the `Transitions/` folder (mood- and probability-weighted per
  preset; the plain cross-fade stays the most common).  The classic styles
  live here as individual small shaders: wipes/reveals (radial iris,
  diagonal wipe, staggered blinds, mosaic dissolve, push, sliding doors,
  clock sweep, dip-to-dark), edge-free full-frame morphs (kaleido folds,
  zoom-through, swirl, water ripple, blur-through, wax melt, heat shimmer,
  pixelation, spin-zoom, chromatic RGB stagger, luminance-ordered dissolve,
  double-exposure, jelly wobble, drain vortex, ghost multi-exposure),
  **datamosh** (row-banded glitch stutter with "stuck block" P-frame
  smear), **shatter** (the frame breaks into Voronoi shards that fly, spin
  and fall away) and **portal** (the new scene opens along the old scene's
  real depth — 3D-only, falls back to zoom-through otherwise) — plus 55
  spectacle transitions (wormholes, supernovae, nautilus sweeps, …) that
  formerly ran as combine effects.  All of them honour the same contract:
  exact scene A at the start, exact scene B at the end, every extra term
  windowed by the `sin(π·d)` envelope; `PresetEditor --transcheck` enforces
  it file-by-file.
  Applied to both the effect and the combine blends.  On a drop specifically,
  the scheduler picks shatter for about half of the cuts instead of always
  hard-cutting (see Build-up/drop below).
- **Web remote (`-t <port>`):** a phone-friendly page at
  `http://<pc>:<port>/` with a **live preview image** (~1 Hz JPEG snapshot,
  captured only while the page is open), preset buttons, next-effect,
  **blackout**, **favourite** (taste learning), **replay arm + save**, and
  sliders for reactivity / trails / mood / latency plus light-show &
  auto-preset toggles.  A **scene browser** (`/api/scenes`) lists every
  texture shader in the active preset as a two-column button grid;
  tapping one jumps straight to it (`/api/force?i=n`, instant and
  unquantised, still respecting Pin/Freeze) — a real VJ console from a
  phone, not just next/blackout.  LAN convenience only — no auth, don't expose it to
  the internet.
- **MIDI Learn (`j`):** cycles through the assignable targets (reactivity,
  trails, mood, latency, next-effect pad, **tap-tempo pad, blackout pad**);
  the next CC/note received binds to the current target; mappings persist.
  Unmapped next-effect pad = any note advances (the old behaviour); tap and
  blackout fire only on their learned notes.
- **Instant replay (`y` arms, `x` saves):** a rolling ~30 s ring of frames
  (~15 fps, encoded off-thread) plus the analyzer's rolling audio ring;
  one keypress muxes `replays/replay_*/replay.mp4` — for "that was
  great!"-moments without having recorded.
- **Auto-preset by mood (`a`):** sustained drone switches to the Ambient
  preset, calm → Galerie, normal → Allround, energetic → Club (8 s dwell,
  30 s between switches).
- **Mood-matched image choice:** the image loader probes a few random
  candidates per switch and picks the one whose brightness/colourfulness
  best fits the live mood (dark valence → darker photos, energetic →
  more colourful; tiny cached thumbnail stats, loader thread only).
- **Editor parameter sliders:** the preset editor shows live sliders for
  the previewed shaders' per-activation parameters (ranges from
  `Komplett.xml`), overriding the preview defaults in real time.  A
  **Würfeln** button rolls all sliders at once (explore looks quickly), and
  **Als Festwerte in gewählten Eintrag** writes the current slider values
  into the table-selected preset entry as `min = max` parameters — freezing
  the exact look you found so that entry always activates with it.
- **Music/speech gate:** a speechiness classifier (formant-band concentration
  vetoed by music traits: bass weight, steady beat, sustained continuity,
  clear key) yields `musicPresence`; a slewed smoothstep gate derived from it
  multiplies EVERY audio signal, so on speech / dialogue / silence the
  reactivity fades to a calm, timer-driven mode and music smoothly re-enables
  it.  The beat/drone classification is HELD (frozen) during speech and
  silence, so it survives a talk break unchanged and is instantly right when
  the music returns.
- **Automatic music-TYPE detection (drone/ambient vs. beat):** classified by
  CONTENT, following the MIR literature — an HPSS-inspired **harmonicity**
  (frame-to-frame spectral self-similarity), **onset density** (FFT spectral
  flux against a per-band peak-hold reference) and **rhythm evidence**
  (mean-removed autocorrelation with an absolute-energy gate).  The result is
  exposed to every shader as `audioAmbient` (0 = beat music, 1 = drone),
  changing over seconds so effects can cross-fade their personality.  Verified
  deterministically with the offline mode (`-w <file.wav>` feeds a WAV through
  the analyzer instead of capturing live audio): a 120 BPM kick pattern
  classifies to 0.00, a sustained drone rises to 1.00 and stays there.
- **Mode-adaptive effects** (research-informed: percussive → angular/spiky
  forms, harmonic/sustained → round/soft forms, loudness swell → looming):
  `Metamorph` cross-fades between an angular beat-lattice personality and a
  soft drone-cloud personality via `audioAmbient`; `BeatLattice` (beat-first:
  envelope-popped shards, a ring wave riding the continuous beat phase,
  per-bar highlight sweep); `DroneDepths` (ambient-first: the image as a
  breathing nebula, swell → looming glow, pitch → elevation).  Plus the first
  **audio-reactive combine passes**: `CombinePulse` (beat zoom breath +
  tempo-riding shock-wave) and `CombineDroneWarp` (slow liquid warp, engaged
  by `audioAmbient`, nearly plain on beat music).
- A **feedback / trails** pass adds phosphor-style light trails.
- **Auto-config-by-mood** (key `a`, off by default): the sustained mood selects a
  matching configuration — ambient → `darkambient`, calm → `slow`, energetic →
  `psychedelic`, otherwise `normal` — with ~8 s hysteresis and a ~30 s dwell so it
  never flips back and forth.
- **Track-change detection:** a sustained near-silence followed by the first
  onset (a new track after a gap) triggers a clean, fresh scene transition.
- **Stereo-separated spectrum:** the analyser also splits each channel into
  low/mid/high bands, so the `StereoSpectrum` effect can show the left channel on
  one side and the right on the other, with the centre seam glowing on wide mixes.
- **Beat-quantised scene changes:** a due effect/combine change is held until the
  next **downbeat**, so cuts land on the musical "1" (with a timeout so a weak
  beat never stalls the show; immediate without music).
- **Tempo-locked pulse:** with a confident rhythm, the visible beat pulse blends
  in a pulse from the continuous beat-phase PLL — it sits exactly on the tempo
  grid and keeps pulsing through occasionally missed kicks.  Tempo estimates are
  **octave-folded** into 70–180 BPM (no half/double-tempo flicker), and the
  **downbeat** is found by accent strength per bar position (the real "1", not
  every-4th-from-anywhere).
- **Swell & bar phase:** `audioSwell` (slow loudness build, THE ambient-dynamics
  signal) breathes the bloom/brightness and gently surges the motion;
  `audioBarPhase` (0..1 across the 4-beat bar) drives slow in-tempo movement
  (e.g. the stage lamps sweep once per bar).  Both are shader uniforms.
- **Stage lamps / light show (`l`, off by default):** four corner spotlight
  cones aim toward the centre like moving-head fixtures — a slow bar-synced
  sweep (one full swing per 4 beats, phase-offset per corner), mood-coloured
  with a slightly different hue each, flashing on the beat with extra punch
  on the downbeat.  Silent on speech/silence (gated the same way the beat
  pulse is).  Layered on top: a **colour chase** that moves the flash
  emphasis on by one corner per onset (gliding over ~200 ms since
  16.10.2026, it used to jump); a soft **haze** —
  a wider, dimmer glow around each beam, as if scattering in stage fog, for
  a 3-D look; a slowly rotating **mirror-ball** speckle field of twinkling
  dots (each off its grid cell and of its own size); and a rotating **gobo** wheel — a fan of light rays from screen
  centre, fading out toward the middle so it never washes the picture.
- **Real bloom:** a two-pass Gaussian bloom (quarter-res bright-pass + separable
  blur) replaces the old single-mip glow — soft halos around bright detail.
- **Recording** (`r`) now encodes JPEGs on a worker thread, so capturing no
  longer throttles the render loop; the `glReadPixels` itself goes through a
  **double-buffered PBO** (pixel-pack buffer), so grabbing a frame no longer
  stalls the GPU→CPU pipeline either — recording and the armed replay ring
  cost almost nothing.
- **Beat-quantised image changes:** like scene changes, a due kaleidoscope
  IMAGE switch is held for the next downbeat (with a ~2.5 s timeout, and
  immediate without music), so new pictures also land on the "1".
- **Batch renderer (`-x <wav>`):** unattended WAV-to-video — the WAV is fed
  through the real analyzer paced to the wall clock (deterministic), the run
  records itself (PBO path), and when the WAV ends the app muxes
  `recordings\rec_*\kaleidoscope.mp4` (video + the WAV audio) and exits on
  its own.  `Kaleidoscope.exe -x track.wav -c Club -b` renders a music video
  of a whole track without anyone at the keyboard.
- **Shader hot-reload (dev):** saving any `Scene2D\*.frag` / `FX\*.frag`
  while the app runs recompiles it live on the next frame (`HOT-RELOAD` in
  the log) — shader tuning without restarts.
- **Lazy shader compile + warm-up:** effects compile on first use (or one per
  frame in the background right after launch), so start-up shows the first
  image quickly even with the 66-shader `Komplett` preset.
- **Uniform-location cache:** the ~40 audio uniforms per pass are resolved
  once per program instead of every frame (dozens of `glGetUniformLocation`
  string lookups per frame gone).
- **CAS sharpening on upscale:** when the internal render scale is below 1.0
  (`-s` or the adaptive scale), the present pass applies a contrast-adaptive
  sharpen (AMD-CAS-style, min/max-clamped so it cannot ring) scaled to the
  upscale factor — low-scale kiosk setups look noticeably crisper.
- **REAL 3D scenes (`type="scene3d"`, `Scene3D\` folder):** actual geometry
  with a perspective camera and a depth buffer — the first effects that use
  a real VERTEX shader (the classic effects run fragment-only on the
  fixed-function quad).  Procedural geometry lives in one static VBO per
  scene (generic layout: corner + index + four seeds; kinds: `points`,
  `cubes`, `ribbon`, `grid`, `quads`), the vertex shader animates
  everything from the audio uniforms.  241 scenes ship.

  **Scene variety per activation:** every time a 3D scene comes on it rolls
  a fresh epoch — a large time offset (different camera/burst phases), a
  gentle ±20 % speed factor, a hue rotation, and a `sceneSeed` uniform some
  scenes use structurally (KaleidoDome/PhotoTunnel/MandalaGrid roll their
  mirror-sector counts, TorusKnot picks its (p,q) knot type) — so the same
  scene returns as a whole family of variations.
  **Real waveform (`audioWave[64]`):** the analyzer publishes the live
  time-domain signal (64 smoothed points, volume-normalised) — WaveRibbon
  and OscilloRings ARE now true oscilloscopes, drawing the actual wave.
  **Depth-aware trails:** while a 3D scene is up, the feedback pass fades
  bright (near) structures faster and lets dim (far) ones linger — the
  trails themselves gain depth.
  **FPS detail budget:** below ~45 fps the heavy cube scenes (CubeWave,
  CrystalCave, SpectrumArena, AsteroidBelt) drop every 2nd cube
  (checkerboard, hysteresis), restoring full detail above ~57 fps.
- **FORMULA LAYER (`<expr>` — the MilkDrop lesson):** presets can SCRIPT
  parameter mappings.  A child element like
  `<expr name="coreP" formula="clamp(0.8 + 0.5*max(bassRel-0.85,0) + 0.4*drop, 0.6, 1.7)"/>`
  is compiled once (shunting-yard → RPN) and evaluated every frame against
  the live audio features; the result is uploaded as the float uniform
  `name` (deliberately overriding a `<float>` of the same name).  New
  mappings need NO shader edits and NO rebuild.  Variables: `time bass mid
  treb bassRel midRel trebRel subBass high level kick snare hat onset beat
  beatPhase barPhase downbeat swell buildUp drop chromaHue centroid flux
  arousal valence ambient rhythm music advance phase dayPhase flatness zcr
  seed1 seed2 seed3` (the seeds re-roll per activation — formulas become
  families).
  Functions: `sin cos tan abs sqrt exp log floor fract tanh sign min max
  pow atan2 clamp mix`; operators `+ - * / ^`, parentheses.  Parse errors
  are logged (`Expr [...]`) and evaluate to 0; successful compiles log
  `Expr OK`.  All six presets ship with curated formulas: hues follow the
  musical KEY (LavaLamp wax, CityBokeh lights, InkWater plumes),
  amplitudes breathe with the bar/swell (ReactionDiffusion displacement,
  Aurora curtains, CombinePulse), sizes ride the relative bass
  (TheCore, MobiusOrbs, LavaLamp blobs), and noir darkness lifts with the
  music's energy.
- **Editable AUDIO MAPPING (per scene, no shader edits):** the same formula
  layer also REMAPS the audio uniforms themselves.  An entry like
  `<expr name="audioKick" formula="0.5*kick+0.5*snare"/>` is evaluated AFTER
  the raw upload and overrides that uniform by name — for the render stages
  and (since this feature) equally for a Scene3D compute generator, so a
  remapped scene never half-follows two different signals.  Constants work
  too (`audioSwell` = `0.8` pins a swell).  The editor's range panel shows an
  **Audio-Mapping section** for every scalar `audio*` uniform the selected
  shader's sources actually read: empty field = the engine's raw value
  (exactly the shipped default), a formula = this preset's override; the
  placeholder names the identity variable (audioKick → `kick`) as a starting
  point.  A **Formel-Mapping section** additionally gives every `<float>`
  param its own formula row, so ANY tunable uniform can be driven by ANY
  audio variable (empty = the usual random-in-range roll); formulas reach
  a Scene3D compute generator too, so both programs of a scene always see
  the same value.  `PresetEditor --render ... --expr audioKick=0.0`
  A/B-tests a mapping headlessly through the real engine path.
- **CAMERA RIG for every 3D scene (8 formula channels, no shader edits):**
  preset formulas named `rigPitch`/`rigYaw`/`rigRoll` (radians) and
  `rigDolly` (world units, >0 = closer) are evaluated CPU-side by
  `Scene3DShader` and composed into the projection matrix — plus
  `rigPitchV`/`rigYawV`/`rigRollV`/`rigDollyV` RATE channels that the host
  INTEGRATES, so an audio-varying rate is jump-free by construction (the
  anti-flicker rule holds).  All presets ship subtle defaults: bounded
  roll/yaw/pitch sway on the integrated `phase`/`advance` clocks plus a
  gentle `rigDolly = 0.5*swell` push-in; shadows stay world-anchored
  (the shadow pass renders through `lightM`).  The editor shows the eight
  rig rows for every scene3d entry.
- **IMG-PALETTE — colours from the photos, not from a formula:** the house
  standard `imgPalette(t)` replaces the generic cos-rainbow: colours are
  sampled from a rotating arc in the CURRENT slideshow image, so every
  activation inherits a fresh palette from the photos; the arc follows the
  musical key (`chromaHue`, jump-free) with a slow advance drift, and
  valence shapes saturation toward the mood.  First wave: both Ferrofluid
  scenes, PrismaticRainbowCloud, MandelbulbHyperRealm,
  NonEuclideanHyperbolicMandala, PenroseAperiodicTessellation.
- **2D CAMERA RIG for every 2D scene (8 more formula channels):** the 2D
  counterpart of the projM rig — formulas named `rig2Roll` (radians),
  `rig2Zoom` (>0 = closer), `rig2X`/`rig2Y` (pan) plus host-integrated
  `rig2…V` rates.  `RenderPipeline` runs the scene's finished frame through
  `Engine/Rig2D.frag` (rotate/zoom/pan with seamless mirror-folded edges)
  before the combine consumes it — an extra fullscreen pass ONLY while a
  formula is active, zero cost otherwise, and skipped on eye-packed stereo
  frames on principle.  All presets ship subtle defaults (roll sway on the
  integrated phase + `rig2Zoom = 0.05*swell`); the editor shows the eight
  rows for every 2D entry and the preview applies the identical transform.
- **~330 generated per-scene couplings on tunable params:** a canonical
  generator classified every registered float param by name (hue → musical
  key, glow → kick/snare, warp → flux, amp → relative bass, size → swell,
  sat → valence, fog → ambient), screened each against the anti-flicker
  rule in the shader source, and wrote
  `clamp(seedBase + audioTerm, lo, hi)` formulas built from each preset's
  OWN range — the value can never leave the curated band, so a scene can
  only get more alive, never off-model.  Motion-rate, framing and count
  params are excluded on principle.
- **All 325 scenes are audio-coupled:** the last six uncoupled legacy scenes
  (Bubble, Rorschach, TunnelAcceleration, TunnelReverse, and both parallax
  kaleidoscopes) now read the integrated `audioPhase`/`audioAdvance` phases
  (jump-free motion coupling) plus amplitude terms (`audioKick` puffs,
  `audioLevel` saturation, `audioSwell` orbit widening) — all additive, per
  the anti-flicker rule, and all remappable per preset like everything else.
- **Relative band levels (`audioBassRel/MidRel/TrebRel`):** the classic
  MilkDrop `bass/bass_att` idiom, done volume-safe on the AGC-normalised
  levels — instant ÷ slow-average (~5 s) per register, ~1.0 = "as loud as
  usual", clamped 0..2.5.  The continuous companion to the gated onsets;
  ideal for breathing motion.
- **Synesthetic roughness mapping (`audioFlatness`/`audioZCR`):** spectral
  flatness (how noise-like vs. tonal the sound is) and zero-crossing rate
  are exposed as uniforms and formula variables; presets map them onto
  visual TEXTURE DENSITY — noisy, unharmonic material makes Voronoi cells
  smaller, oil-projector cells busier, reaction-diffusion displacement
  rougher (the cross-modal-correspondence rule: rough sound → rough image).
- **Full chroma vector (`audioChroma[12]`):** the smoothed 12-bin
  pitch-class energies, so scenes can show WHICH notes sound (Planet4D,
  SpiralArray) instead of only the mean key hue.
- **Self-similarity matrix (`texSSM`, unit 10):** the host keeps ~90 s of
  feature history (chroma + spectral shape, one vector per 0.35 s) and
  maintains a 256×256 recurrence matrix — the classic MIR structure view.
  The `SelfSimilarity` effect renders it as a living ornament: a returning
  chorus paints bright diagonal stripes, a section change cuts a dark
  checkerboard edge, a loop becomes a fine grid; "now" is a beat-pulsing
  golden diagonal.  History accumulates always (CPU-cheap), the texture
  uploads only while the effect is on screen.
- **Schlieren optics (`Schlieren`):** synthetic knife-edge schlieren
  photography over the live fluid sim — the dye field's density gradients
  become dramatic light/dark streaks (edge direction slowly turning), with
  a rainbow-filter variant tinting by gradient direction and the photo
  refracted through the flow like hot air.
- **Articulation mapping:** `logAttackTime` (attack sharpness) now shapes
  the EDITING style — staccato material gets shorter trails and snappier
  cross-fades, legato keeps the full flowing dissolves.
- **Physarum slime mould (`Physarum`, the 4th GPU simulation):** 65k agents
  lay and follow pheromone trails (Jones 2010) via an agent state texture,
  a vertex-texture-fetch point-deposit pass and a diffuse/evaporate pass
  (`texPhysarum`, unit 11) — glowing vein networks grow, merge and
  constantly rebuild.  Bright material makes tight directed veins, loud
  passages speed the swarm, hard kicks scatter it (the net visibly
  explodes and re-forms).  Two species in warm/cool hues.
- **Song-end dramaturgy (`audioFadeOut` + formula var `fadeOut`):** a
  fade-out (6 s loudness average sinking well below the 20 s one while
  music is still present) triggers a cinematic outro — trails bloom long,
  the picture dims gently, and the next track starts on a fresh scene.
- **Melody history (`audioMelody[96]` + `audioMelodyHead`):** ~7.7 s of
  dominant pitch as a ring, so scenes can draw the TUNE itself
  (MelodyScript).
- **Liquid feedback (spatial warp field):** the trails pass now warps the
  previous frame with SPATIALLY VARYING displacement — a radial ripple
  that rides the beat, extra swirl toward the rim that swings direction
  slowly, and a sine flow-field that breathes with ambience/swell (the
  signature MilkDrop fluidity, applied to every effect at once).  All
  phases are integrated (no flicker), everything scales with the trails
  knob and is suppressed for eye-packed true-stereo frames.
- **Day/night cycle (`dayPhase`):** a slow wall-clock sawtooth (~4.7 min
  period, continuous through silence/speech — NOT audio-gated) exposed to
  both shaders and the formula layer.  Consumers derive
  `daylight = clamp(sin(dayPhase·2π), 0, 1)` so the wrap is never visually
  discontinuous; `VolcanoIsland` and `MonolithField` use it for a sun
  elevation / ambient-light drift.

  *Procedural worlds:*
  **`ParticleGalaxy`** (60k point sprites in a spiral galaxy — the bass
  pumps the core, each kick rolls a shock ring outward, the camera orbits),
  **`CubeWave`** (an endless depth-tested neon-city flythrough whose 70×70
  cube columns ARE the 32-band equalizer; kicks flash the street),
  **`RibbonTunnel`** (20 glowing ribbons twisting around a weaving flight
  path; kicks bulge the tunnel, the bar phase swings the twist),
  **`WarpStars`** (warp-speed star tube with real parallax — the music's
  tempo IS the throttle, a drop fires a hyperjump flash),
  **`SynthTerrain`** (a synthwave wireframe valley scrolling toward the
  camera; the ridge heights are the live spectrum, the bar phase sweeps a
  scanline down the grid),
  **`HelixTower`** (a 100-unit DNA double helix; each rung glows with its
  own spectrum band and every kick sends a light wave climbing the tower),
  **`Swarm`** (a 60k-bird murmuration swooping along a Lissajous path —
  onsets scatter the flock, calm passages pull it tight, the camera
  tracks the flock centre),
  **`PlanetRings`** (a pointillist gas giant with Kepler-orbiting particle
  rings — kicks roll a density wave outward through the rings, the swell
  pulls the orbiting camera closer),
  **`CrystalCave`** (a depth-tested flight through a cave of glowing gem
  crystals; kicks flare the passage ahead, snares sparkle a subset),
  **`PortalRush`** (racing a slalom of glowing ring gates — the gate ahead
  pulses in tempo, passing one flashes on the kick),
  **`Fireworks`** (24 procedural bursts at real 3D depths on their own
  music-nudged cycles; kicks light the sparks, a drop turns the sky on),
  **`OceanNight`** (a moonlit night sea — the bass is the sea state, a
  glitter lane runs to the horizon, kicks roll a circular wavefront),
  **`Jellyfish`** (a bloom of 25 bioluminescent jellyfish whose bells ALL
  pulse to the beat with per-jelly phases; tentacles trail and waver),
  **`MeteorStorm`** (shooting stars with long particle trails over a
  twinkling star dome; a drop turns the shower into a storm),
  **`BlackHole`** (an accretion disk — white-hot rim, Doppler-bright
  approaching side, photon ring, infalling streams; a drop fires the
  polar jets),
  **`LanternRise`** (hundreds of sky lanterns drifting up into the night,
  flames flickering — the calm scene of the pack),
  **`Tornado`** (a debris vortex snaking under a storm sky; the music's
  energy is the spin, kicks cinch the funnel, snares crackle white),
  **`LaserArena`** (a club laser show: two towers fan 20 beams sweeping
  with the bar, kicks strobe them, a drop snaps every beam vertical),
  **`KelpForest`** (an underwater kelp forest surging with the swell,
  caustic light wandering across the blades),
  **`SpectrumArena`** (the camera stands inside a circular equalizer
  arena — 98 columns of stacked cubes metering their spectrum bands,
  dead cubes staying as a faint skeleton grid),
  **`AsteroidBelt`** (drifting through tumbling sunlit asteroids at every
  scale; a drop lights every rock's rim).

  *Image-textured scenes* — the CURRENT IMAGE is available to every 3D
  scene as `tex0` (the host binds it before the pass), so these use the
  slideshow pictures as MOVING textures, many kaleidoscope-folded:
  **`PhotoTunnel`** (flying down a weaving tunnel whose walls are the
  image folded into 8 mirrored sectors and scrolling with the music),
  **`KaleidoDome`** (inside a planetarium dome covered by a living
  10-sector kaleidoscope rosette of the image; kicks bloom the centre),
  **`PhotoSphere`** (a turning planet wrapped in the image, day-side lit,
  key-coloured atmosphere rim, equator flash on the kick),
  **`SilkPhoto`** (the photo on a huge silk banner rippling in an
  audio-driven wind — kicks slap a radial ripple through the fabric),
  **`PhotoVortex`** (the image dragged down a whirlpool funnel; inner
  rings spin faster, the throat glows and gulps on the kick),
  **`PhotoCarousel`** (standing inside a revolving cylinder of 3000
  framed photo-crop cards; tilt waves climb the wall with the beat),
  **`PhotoShatter`** (the image as a wall of 3000 shards: calm music
  keeps it assembled, a DROP blows it into a tumbling cloud that drifts
  back together),
  **`MosaicWave`** (a curved 100×30-tile mosaic of the image; flip waves
  sweep across with the bar — tile backs show a hue-shifted twin),
  **`GalleryHall`** (an endless museum corridor of gold-framed crops
  under ceiling lights; the nearest picture pulses with the beat),
  **`BillboardCity`** (a night flight down an avenue of neon-bordered
  photo billboards, each pulsing with its own spectrum band).

  *Harmonic scenes* (projectM/MilkDrop-inspired — smooth, continuous,
  no strobing; the music leans on amplitudes and hues, never yanks):
  **`WaveRibbon`** (the classic MilkDrop waveform in 3D: 20 stacked
  neon wave lines, each an echo of the front line a moment earlier;
  the partials breathe with the spectrum bands),
  **`OscilloRings`** (nested oscilloscope rings on a tilted plane, each
  undulating with its own band and harmonic mode),
  **`AuroraVeil`** (aurora curtains folding across the night sky —
  green hems, violet crowns, the swell is the solar wind),
  **`HarmonicStrings`** (a giant harp: 20 strings ringing as standing
  waves, each mode fed smoothly by its spectrum band),
  **`EchoSpiral`** (the infinite MilkDrop zoom done honestly: a
  logarithmic spiral is self-similar, so the slow continuous zoom loops
  seamlessly forever),
  **`TorusKnot`** (a glowing (2,3) torus knot streaming its particles
  along the closed curve, tumbling slowly on two axes),
  **`RoseOrbit`** (rose curves r=cos(k·θ) drawn by orbiting particle
  streams — spirograph serenity with a counter-turning twin behind),
  **`Phyllotaxis`** (the sunflower head: 60k florets on the golden
  angle, doming gently; a ring of light rolls outward once per bar),
  **`NebulaCloud`** (a soft nebula of seeded clumps kneaded by slow
  sine winds, emission-pink and reflection-blue with embedded stars),
  **`LissajousOrbits`** (six streams tracing closed 3D Lissajous
  figures whose phase relation drifts over minutes),
  **`OrbitalShells`** (a warm nucleus in four precessing electron
  shells, each shell lit by its register),
  **`FireflyField`** (a summer meadow of drifting fireflies; a wave of
  blink synchrony sweeps the field with the beat phase),
  **`SnowDrift`** (slow snowfall through a blue night, every flake on
  its own pendulum, a faint glow where they land),
  **`MandalaGrid`** (a breathing mandala membrane with an 8-fold
  colour rosette flowing softly inward),
  **`PlasmaSheet`** (the timeless smooth plasma on a rippling silk
  sheet — gently desaturated, hue keyed to the music),
  **`SineTunnel`** (a smooth procedural warp throat: harmonic radius
  ripples, colour bands and a helix stripe streaming along the walls),
  **`RainOnWater`** (a still pond at night; raindrops on unhurried
  clocks send damped rings gliding under a moon lane),
  **`ChromeFlow`** (a sheet of liquid chrome: broad slow undulations,
  mirror-sheen bands gliding as the surface rolls),
  **`PolyDance`** (nested fibonacci-sphere constellations of cubes,
  counter-rotating at stately rates, each shell breathing with its
  register),
  **`GyroRings`** (a great gyroscope: six nested rings of cubes on
  tilted precessing axes; a soft glint travels each ring once per bar).

  *Spectacle scenes* (cinematic set pieces with camera drama):
  **`RollerCoaster`** (the camera RIDES a glowing coaster track through
  neon arch gates and past light pylons — the music's energy is the
  throttle, kicks flash the gate you pass, a drop sets everything
  blazing),
  **`DragonFlight`** (a serpentine particle dragon flies at the chasing
  camera, wings beating in time with the beat; a DROP makes it breathe
  fire),
  **`OrbitalDrop`** (atmospheric re-entry on loop: stars, then plasma
  fire streaking past, then a cloud deck bursts open and a city of
  lights rushes up; a music drop fires the sonic-boom ring),
  **`TronCycles`** (light-cycles race seeded closed circuits across a
  dark arena, leaving solid glowing walls that turn in sharp 90-degree
  corners; kicks flash the racing heads),
  **`VolcanoIsland`** (ballistic lava bombs arc from the crater — every
  kick feeds the fountain, a DROP is the big eruption; lava rivers
  crawl the slopes, embers spiral into the night),
  **`ThunderCloud`** (standing in the rain under a brooding storm
  cloud; snares and kicks trigger jagged lightning strikes that light
  the cloud from within — a drop is the full discharge),
  **`GearWorks`** (a colossal brass clockwork: meshing gears at matched
  rim speeds, a pendulum swinging one period per bar, a piston
  hammering with the kick),
  **`CometRide`** (flying in formation with a comet: tumbling nucleus,
  geysers venting on kicks, ion and dust tails sweeping across the
  frame, stars streaming past),
  **`MonolithField`** (gliding through a plain of towering alien
  monoliths whose glyph edges hum with their spectrum bands; the
  downbeat rolls a choir-pulse through the field, a DROP makes them
  LEVITATE),
  **`BioCell`** (a journey inside a living cell: breathing membrane,
  heartbeat nucleus, glowing mitochondria, filament transport lines,
  vesicles sparkling on onsets),
  **`Wormhole`** (a chain of sliding, pinching event horizons recedes down
  a tube; each ring bends light per-channel into a faint chromatic halo,
  a photon-ring glow tracing its edge),
  **`CrystalGrowth`** (70 gem branches grow outward from a hub — a resting
  glow ticks over even in silence, BUILD-UP blooms them toward full length,
  a DROP flashes the whole cluster ice-white),
  **`ConcertCrowd`** (you're on stage looking out at a silhouetted crowd
  under backlight; a wave of raised arms rolls through the rows on the
  beat, onsets and drops punch the whole crowd into a jump),
  **`StainedGlassRosette`** (a 12-fold mirrored glass rosette facing the
  camera, the photo cropped into each leaded cell with boosted saturation,
  godrays sweeping outward, swell/kick pulsing the backlight),
  **`SciFiHUD`** (a diegetic cockpit interface: bezel rings, a rotating
  radar sweep, a REAL oscilloscope trace of the live waveform
  (`audioWave[64]`), a 32-band spectrum arc, a target reticle with corner
  brackets, onset-triggered lock-on rings).

  *Research scenes* (mathematically grounded, after the music-visualization
  literature — manifold harmonics, cymatics, hypersymmetric music spaces):
  **`SpectralOrb`** (MANIFOLD HARMONICS made real: the sphere's
  Laplace-Beltrami eigenfunctions ARE the spherical harmonics, evaluated in
  closed form in the vertex shader — the 32-band spectrum excites the orb's
  natural vibration modes, bass buckling it globally, treble rippling the
  surface; antinodes glow, nodal lines stay dark metal; the L−R stereo
  side-signal drives the sin-phase mode partners, so stereo width literally
  deforms the body asymmetrically),
  **`SpectralTorus`** (the sibling body: on the torus the eigenfunctions
  are exactly the 2D Fourier modes cos(2π(nu+mv)) — each band bends the
  ring or ripples the tube at its own wavenumber pair),
  **`CymaticsPlate`** (Chladni figures the physical way: 60k sand grains
  gradient-descend onto the nodal lines of a square-plate standing wave;
  the mode pair advances on a music clock with cross-faded migration
  between figures, kicks scatter the sand and it re-converges),
  **`Planet4D`** (the harmony as a 4D object: the 12 pitch classes on the
  Clifford torus in S³ — circle of fifths × chromatic circle — under a 4D
  double rotation, stereographically projected; node glow follows
  `audioChroma[12]`, fifth/third edges light up when both endpoints sound,
  so chords light up their shape),
  **`SpiralArray`** (Chew's spiral array / MuSA.RT: the pitch classes wound
  along a helix of fifths, and the chroma-weighted CENTER OF EFFECT travels
  through it as a white-hot comet — a key change is a visible journey to a
  new neighbourhood, its path painted by the feedback trails),
  **`JellyBody`** (the spring-mass idea via modal analysis: a soft elastic
  body that RINGS after every hit — the decaying kick/snare/hat envelopes
  ARE the damping envelopes, each striking its own mode family at a fixed
  ring frequency; volume-preserving squash-and-stretch, gummy fresnel look),
  **`StrangeAttractor`** (600 trajectories on a CHAOTIC attractor — each
  activation picks Lorenz, Thomas, Aizawa or Halvorsen, so the scene
  returns as four entirely different chaotic beings; parameters breathe
  with the smoothed audio, velocity paints the colour heat),
  **`MelodyScript`** (the melody writes itself: ~7.7 s of dominant-pitch
  history drawn as a glowing handwriting line — pitch is height, silence
  lifts the pen, melodic activity heats the ink; the trails give the
  script its afterglow).

  They mix into every preset like normal effects (combines fold them,
  trails work).
  **TRUE VR STEREO:** while a 3D scene plays solo in `-3 sbs`/`tb` mode it
  is rendered TWICE per frame with a real eye offset (two-camera stereo,
  convergence in the shader; separation follows the `c`/`m` depth knob) —
  the combine stage passes the eye-packed frame through untouched and the
  present pass shows each half directly.  A cross-fade between TWO 3D
  scenes stays in true stereo as well: both scenes render per-eye and a
  plain per-pixel mix replaces the styled combine (nothing may warp across
  the eye boundary).  Only fades involving a classic 2D effect fall back
  to the depth-reprojection.
- **Stereoscopic 3D output (`-3 sbs|tb|ana`, key `z` cycles):** the mono
  frame is **depth-reprojected** in the present pass — a pseudo-depth
  (smoothed brightness pops bright structures toward the viewer, the
  radial term sinks the tunnel centre behind the screen) drives a small
  per-eye disparity.  `sbs` (side-by-side half) and `tb` (top-bottom)
  feed **3D projectors/TVs and HMD video viewers** (Virtual Desktop,
  Bigscreen, SkyBox, … — or via Spout → OBS); `ana` is red-cyan
  **anaglyph** for any screen with paper glasses.  Keys `c`/`m` tune the
  depth strength (persisted with `k`).  Overlays (title reveal, lamps)
  sit at screen depth; abstract kaleidoscope content takes this
  surprisingly well because there are no hard object edges to betray the
  reprojection.  Honest limits: it is NOT true two-camera rendering (the
  shaders have no scene camera) and there is no native OpenXR runtime —
  it is a display-format feature, zero cost while off.
- **DJ-STOP dramaturgy:** when the WHOLE spectrum suddenly collapses in
  running beat music (the classic DJ stop, 0.1–3 s), the picture "holds its
  breath" with the track — motion freezes within ~0.1 s and dims slightly;
  the slam-back releases it with a camera hit (the same hit channel as a
  drop, so drop-reactive shaders fire too).  A silence that lasts longer
  than ~3 s is treated as a track end instead (no slam), and the track-
  change detector ignores gaps the stop machinery has claimed.  Verified
  with a synthesized groove/stop/slam WAV (both stops caught, slams on the
  re-entry, no false slam at the real track end).
- **Build-up / drop detection (EDM dramaturgy):** the analyzer recognises a
  BUILD-UP (climbing onset density, rising centroid/filter sweeps, level
  swell, snare rolls → `audioBuildUp` 0..1) and the DROP that follows it (a
  bass vacuum while "armed", then the bass slamming back → `audioDrop`
  pulse + a counter the host can't miss).  Visuals build TENSION during the
  climb — trails tighten, the camera slowly pushes in, black **CinemaScope
  letterbox bars** creep in from top and bottom, and in the final bars the
  picture itself "holds its breath" (desaturates, dims slightly, the
  vignette tightens — a distinct mechanism from the DJ-STOP breath-hold
  above, triggered by the build-up curve rather than a sudden silence) —
  and RELEASE on the drop:
  the bars tear open, a **bass-shockwave** ring (pure image displacement, no
  brightness change — small on every kick, large on the drop itself)
  expands from centre, and the scene cuts — about half the time an
  instant hard cut with a camera hit, the other half the **shatter**
  transition (see Transition styles) so the release itself reads as an
  impact.  Verified offline with a synthesized groove→build→break→drop WAV
  (fires exactly at the slam, zero phantom drops).
- **Virtual camera (global "Regie" layer):** one slow-moving transform over
  the finished frame — micro drift (everything feels "filmed"), a decaying
  downbeat punch-in, a gentle once-per-bar roll, build-up tension zoom and
  a kick/drop shake.  The zoom always covers the offset + rotation, so no
  edge ever shows; all terms are slewed envelopes or fixed-frequency
  oscillations (flicker-free by construction).
- **VJ handbrakes:** `b` BLACKOUT (slewed fade to black inside the pipeline,
  so Spout output and recordings fade too), `e` FREEZE (frame time zero —
  the picture holds, switches wait), `t` TAP TEMPO (median of your taps
  overrides tempo + beat phase for ~45 s — for material the detector
  struggles with), `u` PIN (hold the current effect; suppresses scheduled
  AND forced switches).  Tap tempo and blackout are also MIDI-learnable
  pad targets.
- **Taste learning (per preset):** skipping a freshly-appeared effect with
  `n` teaches a persistent selection MALUS (×0.8, floor 0.3); `f` marks the
  current effect as a favourite (×1.25, cap 2.5).  The factors are stored
  **per preset** (`taste/<Preset>/<shader>` in
  `kaleidoscope_settings.ini`) — disliking a shader in Club leaves its
  standing in Ambient untouched.  They decay toward 1.0 a little on every
  start and bias the mood-based selection softly (never a hard exclusion).
- **Spout INPUT (`-i <sender|any>`):** a live Spout sender (OBS, Resolume,
  a webcam through OBS's Spout output, …) replaces the photos as the source
  image of the whole pipeline — the kaleidoscope folds the AUDIENCE into
  the mandala.  While no sender runs, the photos are the fallback.
  Verified end-to-end with two instances (`-o` sender → `-i` receiver).

**Photosensitivity safety:** a final pass rate-limits how fast the whole-frame
*average* luminance may rise, reining in large full-screen flashes while leaving
local pattern motion untouched. Audio brightness drivers are additionally
slew-limited at the source.

---

## Autocorrelation tempo (currently dead — measured, on purpose)

**Revived on 16.10.2026** on a SuperFlux onset function with a three-bar gate -- see "16.10.2026 (9)" at the
end. What follows is the state it was found in, kept as measured.

`AudioAnalyzer` runs an onset-detection function through a 4 s envelope and
autocorrelates it over the 70–180 BPM lag range, producing `m_acBPM` and a
confidence `m_acConf`. **That confidence has been a constant 0.000 for a long
time**, so everything downstream of it is inert:

* `rhythm = max(kickRhythm, m_acConf)` reduces to `kickRhythm` alone
* the BPM fusion is guarded by `m_acConf > 0.35f` and never fires

The cause is a threshold that outlived its input. The gate reads

```cpp
if (envMean < 0.010f || envStd < 0.050f) { m_acConf *= 0.98f; }
```

and its own comment records where 0.050 came from: *"a kick envelope measures
std ~0.14, drone ripple ~0.02"* — measured against the **band-RMS** onset
function this block used to consume. The ODF was later replaced with an
FFT-based one (to stop sustained bass from faking a tempo) and the threshold was
never re-derived. On the new scale, real music measures:

| track | `odfMean` | `odfStd` |
|---|---|---|
| P!nk — Get The Party Started | 0.0149 | 0.0378 |
| The Prodigy — Smack My Bitch Up | 0.0137 | 0.0213 |
| Kai Tracid — 4 Just 1 Day | 0.0140 | 0.0212 |
| Rammstein — Ohne dich | 0.0138 | 0.0294 |
| Eluvium — Indoor Swimming… | 0.0134 | 0.0226 |

`odfMean` clears its threshold; `odfStd` never comes close to 0.050. The gate is
closed permanently.

**Lowering the threshold does not fix it.** With the gate forced open across
beat-driven and beatless material, neither the autocorrelation peak nor its
prominence separates the two:

| track | `acPeak` | `acProm` |
|---|---|---|
| Kai Tracid (trance) | 0.609 | 0.962 |
| Alcest (**ambient**) | 0.427 | 1.000 |
| Apollo 440 (beat) | 0.332 | 0.978 |
| The Prodigy (**beat**) | 0.167 | 1.012 |
| Eluvium (ambient) | 0.131 | 1.049 |

A heavy-beat track scores *below* an ambient one, and prominence is ~1.0 for
everything. The onset envelope in its current form does not carry the
beat-versus-drone distinction, so reviving this needs a different ODF — not a
different constant.

It is left in place rather than deleted because that is a design decision, not
a bug fix: the block still costs its ~53 lags × ~370 products per block. If the
tempo estimate is not wanted, deleting the block reclaims that; if it is,
the work starts at the ODF. `KALEIDO_SPEECH_DEBUG=1` prints `odfMean` and
`odfStd` so the state above stays checkable.

---

## Recording: raw frames into ffmpeg

A recording used to encode every frame **twice**. The CPU JPEG-compressed it,
wrote it to disk, and then ffmpeg decoded all of them again to produce the
h264 — and on the way it discarded everything above 720 px tall, so rendering
at 2880x1620 and pressing `r` gave a 720p file.

Recording frames now go straight into a running ffmpeg as raw RGBA, which is
exactly what `glReadPixels` returned, so there is no conversion and no
intermediate image. On stop the video stream is *copied* into the container
beside the audio rather than re-encoded.

Measured on one 30 s Komplett batch render:

| | before | after |
|---|---|---|
| resolution | 1280x720 | 2880x1620 (full render size) |
| JPEGs written and read back | ~890 | 0 |
| encodes per frame | 2 | 1 |
| threads for it | up to 6 | 1 |

The writer is a **single** thread, not the pool. The pool existed only because
JPEG encoding was the pipeline's hard ceiling; writing raw bytes is not
expensive, and a pipe carries no frame index, so out-of-order writes would
garble the video rather than merely reorder it. One producer and one consumer
keep frame order for free.

The output is constant-rate. Each frame's *measured* duration is converted to
a whole number of output frames at 30 fps, with the fraction carried forward so
rounding cannot accumulate into drift; a frame lost to a full queue is
compensated by duplicating its predecessor. The file lands ~80–140 ms shorter
than the audio because `finishRecording()` discards the in-flight PBO frame —
a fixed end gap, not drift.

The JPEG path remains as the fallback when ffmpeg is missing, and still leaves
frames plus a `make_video.bat`. One rule there: that path must **not** drop
frames when handing them to the pool, because `asyncCapture()` has already
written the frame's line into `frames.txt`; a frame discarded at that point
would leave the concat list pointing at a JPEG that never gets written. It
waits for room instead, which cannot deadlock because `finishRecording()`
joins the pipe thread before it stops the pool.

### Encoder selection

Encoders are probed at runtime — presence in `ffmpeg -encoders` is not
sufficient, since a build can list `h264_nvenc` while the driver refuses it —
by actually encoding a 0.2 s throwaway clip at 256x256 (AMF and QSV impose
minimum dimensions; a smaller probe can be rejected by a healthy encoder and
silently demote the machine to software).

Order within a codec family: discrete GPU, then Quick Sync, then software. The
rate-control flags are per-vendor and **not** interchangeable — NVENC wants
`-cq`, AMF `-rc cqp` with explicit qp values, QSV `-global_quality`,
x264/x265 `-crf`, and SVT-AV1's `-crf` is a different scale again. The wrong
one is ignored without a warning and you get whatever default bitrate the
encoder felt like.

AV1 deserves a note, because its first configuration here was wrong: its
quality scale runs 0..63 rather than 0..51, and NVENC needs an explicit rate
control with `-b:v 0` or it targets a bitrate and ignores `-cq` entirely.
Measured against one fixed 8 s source, with SSIM against that source:

| setting | size | SSIM |
|---|---|---|
| h264 `-cq 20` | 55.4 MB | 0.9750 |
| hevc `-cq 20` | 21.2 MB | 0.9812 |
| av1 `-cq 20` | 60.2 MB | 0.9906 |
| av1 `-cq 25` | 29.0 MB | 0.9736 |
| av1 `-cq 32` | 24.2 MB | 0.9676 |

HEVC beats every AV1 point on *both* axes, so on NVIDIA hardware AV1 is a
compatibility choice, not a quality one.

---

## paint(), and why it is a list of calls

`RenderPipeline::paint()` was a single 878-line function covering the whole
frame. It is now ~49 lines: the ordered list of stage calls, plus the three
statements that genuinely belong between them (the global-time advance,
`tickFx`, and the Spout publish). Nineteen helpers hold the rest, and
`renderFxStage` was split again into `prepareFxInputs` / `renderStereoMixPass`
/ `renderTransitionPass` / `renderOverlayPass` / `renderNextOverlayPass`.

The order of those calls **is** the render order and is load-bearing: almost
every stage integrates state or leaves GL bindings the next one relies on, so
they are not independently reorderable. Two constraints are worth naming
because they look arbitrary otherwise:

* `m_globaltime` advances *after* the transport modifiers, so a freeze (`e`)
  or a DJ-stop really does stop it.
* `tickFx` runs *after* both scene passes, because it needs `m_trueStereoHold`,
  which only exists once they have run.

Both splits were pure code motion, verified by re-inlining every helper and
diffing the statement stream against the original: 525 vs 531 statements in
the same order, differing only by the `return`s the value-producing helpers
need and one dead local removed.

That verification mattered more than it sounds. The renderer cannot be run
deterministically — `qsrand(0)` is a no-op under Qt6 and every phase
integrates a *measured* frame delta — so a pixel A/B is not a usable oracle
here: the same binary run twice differs from itself more than two builds
differ from each other. Statement-level equivalence plus a clean build is the
strongest available evidence.

`AudioAnalyzer::processBlock()` (1435 lines) was *not* decomposed, and the
reason is instructive. Offline analysis IS deterministic — the same binary run
twice produced 0 differing lines over 3000 blocks — so there a real A/B is
possible, and it failed: lifting out ten self-contained stages, verified as
pure code motion at statement level, still moved three of the 23 published
features. The seed is floating-point (first difference 3.4e-6): writing a block
as its own function changes how MSVC contracts and schedules the arithmetic,
and the DSP's many `0.998 * prev + 0.002 * x` feedback loops amplify that
transiently to as much as 35 % before re-converging. `__forceinline` did not
help. Since `timingScale` is one of the three and it drives scene durations,
the change was reverted rather than shipped. Doing it properly needs either a
context struct (a large rename, not code motion) or pinning the FP model, which
is itself a behaviour change against today's binary.

---

## Marking scenes for review

`Space` marks or unmarks the scene on screen, `Shift+Space` writes every marked
scene to `Presets/Marked.xml`; both are also on the web remote
(`/api/mark`, `/api/savemarked`).

Marks are deliberately **not** taste. Taste biases the scheduler by degrees and
decays a little on every start; a mark is a binary "look at this again" that
must survive untouched. They live under `[marked]` in
`kaleidoscope_settings.ini`, written through immediately, so an inspection pass
can span several sessions.

Saving copies each scene's **real** `<TextureShader>` node out of
`Komplett.xml`. Synthesising a tag instead drops `geom` and every preset
parameter and renders a working shader wrongly — the same failure mode that
invalidated a whole measurement campaign (see below).

The companion is `TestAlle`, the review bench that
`Tools/make_genre_configs.py` writes alongside the genre presets: every scene,
25 s each, `FxPlain` as the only overlay and `Crossfade` as the only transition.

Three of its properties are **not** in the file. `Configuration.cpp` switches
the scheduler into review mode for any preset whose name starts with `Test`,
and review mode is what supplies the fixed span (`ReviewSoloSecs`, 25 s --
a full phrase at ~120 BPM, so a scene's slow arcs complete at least once;
the original 8 s only ever showed a scene's opening moment), the short cut,
and the walk
order — 2D scenes alphabetically, then 3D ones (`reviewBlock()` in
`SceneScheduler.cpp`; one list across both folders interleaves a flat fractal
with a lit model every couple of scenes and the eye spends its time
re-adjusting instead of judging). The `Test` prefix is load-bearing: rename the
preset and the walk silently goes back to random, which for an inspection pass
means never knowing whether you have seen everything.

What IS in the file is `AudioFile="..\Tools\review128.wav"`. A preset may
name a WAV, and if the command line said nothing (`-w`/`-x` outrank it) the
engine analyses that instead of listening — silently, nothing reaches the
speakers. A review needs it: with live audio the same shader looks different on
every pass, so two recordings of it cannot be compared.

Also in the file: the PHOTO pacing (`timeTextureSolo*` /
`timeTextureInterpolation*` on the root element -- background-image times, not
scene times, a distinction that has already claimed a victim). The bench holds
each photograph for 45-60 s and dissolves over 15-25 s, so the picture under
judgement does not change its palette mid-scene. An earlier revision set these
to 8-9 s with a 1-2 s fade in the belief they stated the scene time; since
photo and scene changes are both downbeat-quantised at nearly the same period,
the photo swap drifted onto the seconds right after each scene change, and --
the palette and the exposure both follow the photograph -- every fresh scene
appeared to abruptly change brightness a moment after arriving.

---

## Measuring the catalogue

`Tools/scan_scenes.ps1 -All` records every scene, `Tools/scene_metrics.py`
turns those into per-scene numbers, and `docs/scene-metrics.txt` is the
committed baseline. Three conditions make the numbers comparable between runs,
and each exists because its absence produced a wrong answer first:

* **renderScale pinned to 1.0, autoScale off.** With the adaptive scaler on, an
  expensive scene keeps its fps up by dropping resolution, so fast and slow
  scenes both report "fine".
* **One pinned background photo** (`Tools/pick_scan_image.py` picks the
  median-brightness image of the collection). Scenes that fold the photo
  inherit its brightness: with a random photo per run the worst luma delta
  between two runs was 0.43 and only 4 of 10 flag verdicts reproduced; pinned,
  0.002 and 9 of 10.
* **fps from the app's own report** (`KALEIDO_FPS_LOG`), not frames-on-disk
  divided by seconds. The recorder writes constant-rate video with duplicate
  fill, so counting frames stopped meaning anything the moment the raw pipe
  landed — two scenes of very different cost measured as equally fast.

Two traps are worth knowing before trusting any probe run:

* `verify.ps1` copies each scene's real node out of `Komplett.xml`. If that XML
  does not parse, the copy degrades to a synthetic `geom="points"` tag with no
  preset parameters — which for tessellation and geometry-shader scenes throws
  hundreds of phantom `GL_INVALID_OPERATION` per probe, and shifts everyone
  else's metrics. It now warns loudly; grep a scan log for
  `Probe faellt auf synthetischen Tag zurueck` before believing it.
* `-c <name>` matches the config's `ConfigurationName`, **not** the filename.
  A miss is not fatal: it falls back to the first config in the list, and since
  underscore sorts first, a throwaway `_probe.xml` usually *becomes* that
  default — so the mistake hides itself.

`RenderPipeline::checkGLErrors()` is a no-op unless `KALEIDO_GL_DEBUG` is set,
because `glGetError()` can force a driver sync. A "zero GL errors" claim from a
run without that variable therefore covers much less than it sounds like. And
because `glGetError` drains a *global* queue, a checkpoint's label names where
the error was **noticed**, not where it was raised.

That last point is why `KALEIDO_GL_DEBUG` now also installs a **KHR_debug**
callback (GL 4.3, present on Mesa too). The driver names the failing call and
usually the reason -- `Framebuffer name must be generated before being bound`,
`<program> has not been linked` -- instead of leaving you at a checkpoint three
subsystems downstream. It is synchronous, so it costs frames and also
serialises GL: a race can stop reproducing while it is on, which is itself a
useful signal.

A second switch, `KALEIDO_NO_SHADER_CACHE=1`, turns off the shader-program cache
(see `shader_setup.cpp`) without rebuilding. The cache changes object *lifetimes*,
and lifetime bugs get blamed on whatever changed last; being able to A/B it
inside one binary is the difference between attributing a fault and guessing.
That switch is how the preset-switch error storm was cleared of suspicion --
identical error families on both settings, only rarer with the cache, because
a shared program is usually not the one being deleted.

---

## Temporal budget: how fast a scene may change

A visualiser that changes faster than the music reads as hectic strobing rather
than as dancing. What counts as "too fast" depends on *what* is changing, so the
ceilings differ per class. Reference tempo is 120 BPM = 2 Hz.

| what changes | ceiling | why |
|---|---|---|
| full-field brightness flashing | **3 Hz** | photosensitivity guidance caps general flashing at 3 flashes/s; the 15–25 Hz band is the most provocative |
| global hue / palette cycling | **2 Hz** | one beat. Colour is meant to track harmony (`audioChromaHue`), not outrun it |
| camera / whole-image geometry | **4 Hz** | 2× the beat: fast, but the eye can still follow it |
| local detail / texture ripple | **8 Hz** | 4× the beat. Small, low-contrast, spatially dense features tolerate more than the whole frame does |

A term `sin(D * K)` oscillates at `K * rate(D) / 2π`, where `rate(D)` is how fast
its driver advances per second:

| driver | rate | note |
|---|---|---|
| `time` | 1.0 /s | the raw wall-clock uniform |
| `audioPhase` | ~1.2 rad/s | accumulated rotation phase (`AudioConditioner.cpp`), at full musical energy |
| `audioAdvance` | ~0.25 /s | accumulated tunnel advance, at its maximum |
| `audioBeatPhase` | 1 cycle / beat | musical by construction — an *integer* cycle count stays continuous across its 0→1 wrap |
| `audioBarPhase` | 1 cycle / bar | ditto, four times slower |

So on the raw `time` uniform: **K ≈ 19 is 3 Hz, K ≈ 25 is 4 Hz, K ≈ 50 is 8 Hz.**
Those audio rates are worst-case at reactivity 1.0; the user's `reactivity`
setting scales them (clamped 0–2.5), which is why the ceilings are conservative.

`Tools/temporal_budget.py` enforces this across every scene and stage, and
`docs/temporal-budget.txt` lists the fastest oscillating term of every scene.
Only *oscillating* uses count — a large coefficient driving a monotonic
translation is a fast pan, not a strobe, and is judged on its own merits.

This is checked statically rather than by measuring rendered frames on purpose:
the probe recorder captures at only ~10–15 fps, so anything above ~5–7 Hz
**aliases downward** and masquerades as calm motion. A rendered scan can
therefore never prove the absence of fast flicker; reading the coefficients out
of the GLSL can.

Prefer tempo-locked motion over a hard-coded rate wherever the effect is meant
to feel musical — `sin(audioBeatPhase * 6.2831853 * N)` gives exactly N cycles
per beat, follows the tempo automatically, and is continuous across the wrap for
integer N.

### The budget has a ceiling but no floor

Everything above bounds motion from *above*. For years nothing bounded it from
below, and 987 camera-rig formulas quietly fell through that gap.

Every mesh scene positions its camera with expressions of the shape

```xml
<expr name="rigYaw" formula="0.32*sin(0.030*advance + seed2*6.28)"/>
```

Read as a coefficient, `0.030` looks like nothing in particular. Multiply it out
against the table above and it is a **full oscillation period of 58 minutes**:
`audioAdvance` accumulates at roughly 0.03 /s under calm music (0.25 /s is the
worst case at full energy, not the normal one), so the sine's argument moves
0.0009 rad/s. Over a 40-second scene the camera therefore travels **0.8 degrees**.
Across all 987 formulas the periods ran from half an hour to 4.8 hours.

The scenes were not still — the models spin on `time` alone, deliberately, so a
kick cannot jerk them. Only the camera was frozen, which is exactly the failure
that hides best: something in frame is clearly moving, so "nothing is moving"
never occurs to you, and the shot still feels dead because the *frame* is.

The lesson is a habit, not a number: **a rate coefficient means nothing until it
is multiplied by its driver's rate and the scene's lifetime.** A scene lives
20–90 s, so any motion meant to read as motion needs a period in that range —
`k · rate(D) · lifetime` should land somewhere near a radian. The ceilings above
and this floor bound the same quantity from opposite sides, and only the ceiling
had a tool (`Tools/temporal_budget.py`) watching it.

Scaling every coefficient by a single constant (here ×25, median period 58 min →
2.3 min) is the right shape of fix, because the amplitudes and the coefficients
were already inversely related by hand: the wide 0.32 rad sweeps carry the small
`k`, the fast ones carry 0.04 rad. A uniform factor preserves that relationship,
and the fastest resulting term is a 2-degree wobble at a 19-second period —
three orders of magnitude below the 4 Hz camera ceiling.

---

## GPU reaction-diffusion (live simulation effect)

`ReactionDiffusion` is a genuinely *simulated* effect, not a procedural pattern:
each frame a fragment shader (`ReactionDiffusionSim.frag`) advances a **Gray-Scott
reaction-diffusion PDE** in a ping-pong pair of `RGBA16F` float buffers (a fixed
320×320 grid, so it stays cheap even on an iGPU), reading its own previous state.
Onsets / beats inject fresh reagent, so the pattern **blossoms with the music**.
The simulation also **wanders Pearson's parameter space with the music**: the
spectral centroid slides the kill rate (bright material → worm-like meanders,
dark material → coral/spot patterns) while bass transients pulse the feed rate
— sudden extra feed reads as cell division (mitosis bursts).  Both parameters
stay clamped inside the stable valley, so the tissue can neither die nor
explode.
The living field is exposed on a global `texSim` sampler, colourised by the mood
(`ReactionDiffusion.frag`) and then folded by the kaleidoscope into radiating
organic structures. If `RGBA16F` render targets are unavailable the simulation is
skipped and the effect falls back to a dark mood-tinted field (never a crash).

> It uses fragment-shader ping-pong rather than GL 4.3 *compute* shaders on
> purpose: a fragment-shader integrator gives the same simulation while staying
> portable to the weak NUC iGPU.  (Since the 4.3 core-profile migration the
> compute entry points ARE available, so future sims can go either way.)

A sibling sim, `Fluid` (`FluidSim.frag`, `texFluid`, unit 8), advects an RGB dye
field along the curl of a drifting noise potential — divergence-free by
construction, so it swirls like ink in water with no pressure solve; the current
photo is continuously injected as fresh dye.

---

## Compute-shader effects (`ComputeFX`)

Everything in `Source/ComputeFX.{h,cpp}` needs a capability a fragment shader
does not have: **scattered writes** (a thread decides at runtime *which* pixel
it writes), **atomics**, **workgroup shared memory** or **shader-storage
buffers**. A scene opts in exactly like the older sims — by *declaring the
sampler*; `EffectShader::cfxMask()` resolves that to one bit per sim, and only
the kinds actually on screen are stepped. Idle sims free their GPU memory after
25 s. Every kind fails soft: no compute, no program, no allocation → the scene
just sees an empty field.

The scattering sims share one back end (`Engine/CfxResolve.comp`): they
`atomicAdd` colour and density into a **uint** accumulator (fixed point —
float atomics are an optional extension, uint atomics are core), which is then
resolved into an `RGBA16F` canvas that keeps a decaying copy of the previous
frame. A single frame of a chaos game or a particle splat is far too sparse to
look like anything; that temporal integration is what makes it silky.

| Scene | Sampler / unit | What compute buys |
|---|---|---|
| `FractalFlame` | `texFlame` (12) | 65k chaos-game walkers plot 2M points per frame into an atomic **density histogram**; log-density tonemapping gives the classic flame filaments |
| `ParticleFlow` | `texParticles` (13) | 1.3M particles advected along the **curl** of a noise potential (divergence-free), each splatting the photo's colour where it happens to be |
| `GalaxyCollision` | `texNBody` (14) | 65k gravitating stars, forces accumulated through **shared-memory tiles** against a 1/32 sample; two discs on a decaying mutual orbit grow tidal bridges and tails |
| `Murmuration` | `texBoids` (15) | 131k boids with a **real neighbourhood** from an atomically built spatial-hash grid — separation, alignment, cohesion and a density-gradient pressure term |
| `CrystalGrowth` | `texCrystal` (16) | Diffusion-limited aggregation: random walkers **freeze into a texel they discover at runtime**, which is the defining scatter operation |
| `LightningStorm` | `texLightning` (17) | A branching discharge whose tips claim new slots through an **atomic counter**, so the tree's width is decided on the GPU frame by frame |
| `CausticPool` | `texCaustics` (18) | A wave equation on a shared-memory stencil, then **photon splatting**: each photon refracts at the surface and deposits its energy where it lands on the pool floor |
| `PixelMelt` | `texSorted` (19) | Every row luminance-sorted by a **counting sort in shared memory** — histogram with atomics, prefix sum, then scatter each pixel to the slot its bucket earned |
| `SpectrumFilter` | `texFFT` (20) | A real 256² **2D FFT** (radix-2 Cooley-Tukey, one workgroup per line, eight barrier-separated stages in shared memory): the 32 audio bands weight the image's spatial frequencies by radius, then it transforms back |
| `InkTank` | `texNSFluid` (25) | Actual **Navier-Stokes**: advect, then solve the pressure Poisson equation (24 Jacobi iterations) and subtract its gradient. The older `Fluid` is curl noise — divergence-free by construction, so it can only swirl; this one sheds vortices and pushes back against the walls |
| `FerroSpikes` | `texFerro` (21) | The **Swift-Hohenberg** equation on a coarse grid: a 13-point biharmonic stencil selects one wavelength and a quadratic term breaks the up/down symmetry, giving the hexagonal peak lattice a ferrofluid forms in a magnetic field. Bass is the magnet |
| `ErodedLand` | `texErosion` (22) | **Hydraulic erosion**: droplets run downhill, cutting where they accelerate and depositing where they slow. The land is re-raised every ~14 s, so the drainage network forms, matures and starts over |
| `LiquidMetal` | `texMetal` (23) | Cohesive particles with a spatial-hash neighbourhood, rendered by **screen-space fluid reconstruction** — threshold the splatted density, take its gradient as the normal |
| `ShatterField` | `texShards` (24) | 1300 rigid shards, each splatting its own patch of the photo at its current pose; a spring pulls them home so the picture visibly re-assembles between transients |
| `ClothDrape` | `texCloth` (26) | A **Verlet mass-spring sheet**, one particle per texel, with Jacobi distance constraints. Keeping the cloth on a grid means the display can shade it directly — only the physics needs compute |

Global, not a scene: **percentile auto-exposure** (`Engine/CfxHistogram.comp`).
One workgroup builds a 256-bin luminance histogram of the finished frame with
shared-memory atomics and writes the exposure its median and 98th percentile
justify into an SSBO that `Present.frag` reads *directly* — so unlike the older
mean-luminance limiter it costs no GPU→CPU sync at all. It sits **on top of**
the photosensitivity limiter, never instead of it: capping how fast the frame
may brighten must not depend on a histogram being available.

`Physarum` was also raised from 65k to **1M agents** on a 1024² trail map.

Not built: `Marching Cubes`. Meshing an isosurface needs a compute→VBO→indirect
draw path that this renderer does not have, and faking it with a raymarch would
not have been the thing that was asked for. The `texSculpt` slot is reserved.

### Native video as an image source

`-v <path>` plays a video file (looped) or a folder of them in turn, and its
frames replace the photographs. It hangs off exactly the hook the Spout input
already used — `m_liveTex` — so while a frame is available it stands in for
*both* photo slots, cross-fades collapse to a no-op on the image, and every
effect in the library folds moving footage without knowing anything changed.
Spout wins if both are given: that one is a live feed, a file is not.

Decoding is Qt6Multimedia's, which means the platform's own codecs — nothing
bundled, and whatever the machine can already play works here. Frames arrive via
`QVideoSink`, are converted with `QVideoFrame::toImage()` and uploaded. Mapping
the frame directly would be faster but would mean handling every pixel format a
platform might hand over (NV12, planar YUV, …), and this is a *texture source*,
not the main render path.

Everything runs on the GUI thread — `QMediaPlayer` emits there and `paint()`
runs there — so the newest frame is simply held in a member with no lock. Adding
one would only add a way to get it wrong. The audio output is muted on purpose:
a video's soundtrack would fight the music the visuals are reacting to.

One thing worth knowing about this codebase: a new command-line switch has to be
listed in `parsecommandline`'s **option table**, not only handled in the switch
below it. The table is what makes a letter valid at all — a `case` with no entry
is rejected before it is ever reached, and the app exits before it writes so
much as a log line.

### Four image and harmony scenes

The last of the idea list, and none of them needed new engine support — they are
there because each one rests on a fact worth knowing rather than on a trick.

**`VoronoiShatter`** breaks the photograph into Voronoi cells, because a Voronoi
diagram *is* what a fracture pattern looks like: both come from the same rule,
that every point belongs to the nearest seed. The cells are the break, not a
decoration drawn on top of it. Each shard then samples the photo through its own
transform — shifted, rotated, scaled about its own centre — which is the
difference between a shattered picture and a picture with cracks drawn on: a
real shard carries its piece of the image away with it and the seams stop lining
up. The crack itself comes from the distance between the *nearest* and
*second-nearest* seed, which is small exactly on a cell boundary and nowhere
else.

**`Halftone`** separates into CMYK and screens each ink on its own grid at 15°,
75°, 0° and 45°. Those angles are not a style choice: they are the ones that
keep four dot grids from lining up into a moiré. Screening RGB instead would
give three grids fighting each other and a picture that looks like a bug rather
than like print. Two details do the rest — dot *area* follows the value (hence
the `sqrt` on the radius, without which the midtones come out far too dark), and
black is pulled out first, which is what gives print its deep blacks instead of
a muddy three-ink overlap.

**`Tonnetz`** is the harmonic lattice: pitch classes on a triangular grid whose
three axes are the perfect fifth, the major third and the minor third. Its point
is that **triads become triangles** — every major and minor chord is one small
triangle, and chords sharing notes sit next to each other. So a held chord
lights one triangle, a related chord lights the triangle sharing an edge with
it, and a modulation walks across the plane. The whole lattice is one line of
code (`pitch = 7a + 4b mod 12`); everything else in the file is drawing.

**`Snowfall`** buys depth with layers rather than geometry: several sheets of
flakes, the near ones big, fast and badly out of focus, the far ones small, slow
and sharp. Parallax *plus* a focus that changes with it is what the eye reads as
distance — a single layer always looks like dust on the lens instead of weather.
The wind is one field shared by every layer and driven by height, so a gust
travels down the frame instead of shifting everything at once.

### FlowRibbons and Skyburst — two more indirect generators

**`FlowRibbons`** traces thousands of streamlines through a **curl-noise** field.
Curl noise is the curl of a vector potential and is therefore divergence-free
by construction — and that single property is why the ribbons read as a flowing
medium rather than as drifting confetti: a divergence-free field has no sources
and no sinks, so nothing piles up in a corner or drains away, and the
streamlines can only stretch and fold, which is what a fluid does.

Two structural choices worth copying:

- **One thread per whole ribbon**, not per segment. That looks wasteful against
  262144 invocations, but a streamline has to be *integrated* from its start, so
  a thread per segment would redo the same walk for every segment — O(S²) where
  this is O(S).
- **One `atomicAdd` per ribbon.** Reserving per triangle would issue sixty-four
  atomics for the same ribbon and serialise on the counter for no gain.

Integration is midpoint, not Euler: with Euler the ribbons drift off their
streamline and the fold structure smears out. The frame is carried along the
curve by parallel transport rather than rebuilt each step, so a ribbon does not
flip when its tangent passes vertical.

**`Skyburst`** is fireworks with real trails, and no simulation state at all.
Ballistics has a closed form, so a thread can evaluate not only where its spark
*is* but where it *was* — which is exactly what a trail needs. A particle system
would have to store the path; this one derives it. Shell phases come from
`audioAdvance`, so shells fire on a musical grid without any event history.

Three physical details carry it: drag is **exponential**, not linear, which
gives the characteristic sudden bloom followed by a slow drift; spark directions
come from a **Fibonacci sphere**, because random directions clump and the shell
looks moth-eaten; and the trail **cools along its length**, white at the head
through the shell's colour to deep red at the tail.

Gravity is set at 3.4, far below the real 9.81 — a firework is watched over a
couple of seconds, and at real gravity the fall (½gt²) swamps the burst's own
spread (v/k, about eight units). The sphere never opens; the sparks just rain
downward. That was the first probe, and it is why the constant is a decision
rather than a value.

### SpectroWeave and Harmonograph

**`SpectroWeave`** reads the same spectrogram as SpectroCanyon but as thirty-two
*separate* strands, one per band, braided around a common axis — so instead of a
landscape whose shape is the spectrum, you fly through a bundle in which each
frequency is its own visible thread that swells where its band was loud.

Its strand paths are closed-form helices, so unlike FlowRibbons there is nothing
to integrate and a thread can own a single **segment**. That is the better split
whenever the curve has a formula: 4096 threads doing one step each beats 32
threads doing 128. The strand radii come from a golden-ratio spread of the band
index, so neighbouring bands are *not* neighbouring strands — which is what
makes the bundle look woven rather than like a rolled-up sheet.

**`Harmonograph`** draws a wire sculpture whose shape *is* the interval being
played. A Lissajous figure closes if and only if its frequency ratio is
rational, and the simpler the ratio the simpler the closed figure — which is the
same fact that makes an interval sound consonant. A perfect fifth is 3:2 and its
figure is a tidy loop; a tritone is near 45:32 and never repeats, it just fills
the space. The sculpture does not illustrate consonance, it *is* the same
property, drawn.

The ratio comes from the two loudest pitch classes, snapped to the **just**
interval nearest their semitone distance. Equal temperament's 2^(n/12) is
irrational for every interval, so nothing would ever close — which is exactly
the wrong lesson to draw.

One thing the probe taught: the hue must sweep the wheel about three times along
the trace, not once. The damping puts most of the figure's visible area in the
first fraction of the trace, so a single turn spends nearly all its range on the
tiny wound-down centre and the big outer loops come out in one flat colour.

### Persistent generator state, and CoralGrowth on it

Every generator up to here derives its whole output from this frame's inputs.
That is a real constraint, and it rules out anything that *accumulates*: growth,
erosion, memory. So the indirect path gained one optional piece.

A scene3d entry may carry **`stateBytes="N"`**. The host then allocates an SSBO
of that size at **binding 2**, zeroes it once, and leaves it alone forever —
never reading it, never uploading to it, never synchronising on it. That is what
makes it cheap. The generator also gets two more uniforms: **`frameIndex`**, so
it can tell its first frame from the rest, and **`genPass`**.

`genPass` exists because a stateful generator has two jobs that must not race.
When a state buffer is present the host dispatches the generator **twice** with a
`GL_SHADER_STORAGE_BARRIER_BIT` between: pass 0 advances the simulation, pass 1
turns the result into geometry. Doing both in one dispatch would be wrong, not
merely slower — invocations within a dispatch have no ordering, so the meshing
half would read state the stepping half had not finished writing.

The zeroing goes through a CPU-side buffer rather than `glClearBufferData`. It is
a few hundred kilobytes, once, at scene load — against a state buffer that comes
up holding whatever the driver left behind, whose symptom is a scene that looks
wrong on some machines and right on others.

**`CoralGrowth`** is the first scene on it: **diffusion-limited aggregation**.
Walkers wander at random above a seeded floor; when one touches the structure it
freezes there and becomes part of it. That single rule is the whole simulation,
and it is why DLA looks organic — a walker is far more likely to meet a
protruding tip than to reach down into a crevice, so tips outgrow hollows and the
colony branches on its own. Nothing in the rule says "branch".

Getting from that rule to something that looks like coral took four corrections,
each of which produced a specific and recognisable failure:

- **Bias the walkers toward the colony, not toward the origin.** The first
  version seeded the colony at `y = -1.6` while pulling walkers toward `(0,0,0)`.
  Drift against diffusion put them in a cloud about 0.07 wide around a point 1.6
  away from the only node, so nothing was ever within contact range and the
  screen stayed black. There was no error to see — the simulation ran perfectly
  and did nothing.
- **Test contact exactly.** Scanning a rotating slice of the node list is cheap,
  and blind: a walker crosses a node's contact shell in two or three frames, so a
  slice holding 5% of the colony misses nearly every touch and the walker sails
  on into the interior before it sticks. That fills the crevices and gives a ball
  — the opposite of coral. Contact goes through a **uniform hash grid** instead,
  one node index per cell, cells wider than the contact radius, 27 neighbours
  tested. Both cheaper than the slice *and* correct.
- **Stick on first touch.** It is tempting to slow the growth down by making
  sticking rare, but low stick probability is the same failure as a blind
  contact test, arrived at deliberately: a walker that ignores its first contacts
  works its way inside before settling. Branching needs walkers that stop dead.
  Pacing comes from the **walker count** instead, and the kick rides on top so
  the reef surges audibly on the beat.
- **Let the generator frame its own output.** DLA is scale-free and its reach
  grows without bound, so no fixed render scale works: the same shader that was
  a speck at 12 s overflowed the screen at 40 s. The generator tracks its reach
  with one `atomicMax` and scales the mesh by `2.2 / max(reach, 0.85)` — a fixed
  scale while the colony is small, so it visibly grows, giving way to a camera
  pull-back once it fills the frame.

Sizing the state buffer is the one thing a preset can get wrong silently. Writes
past the end of an SSBO are discarded, not faulted, so a buffer that is too small
does not crash — it just loses whatever lives at the end of the layout. Here that
was the hash grid, and the symptom was again a black screen from a simulation
that ran without complaint. `CoralGrowth` needs 477 040 bytes and asks for
524 288.

### Origami — a Miura fold with one degree of freedom

The Miura fold is the one origami pattern worth building as real geometry rather
than faking with a normal map, because it is **rigid-foldable**: the panels never
bend or stretch, only the creases rotate, and the whole sheet has a *single*
degree of freedom. One angle controls how tall the corrugation stands, how far
the sheet contracts, and how much the ridges zigzag. A pattern with exactly one
parameter is the ideal thing to hand to a piece of music.

The generator uses the standard Schenk-Guest cell lengths, and runs the fold
angle as a **wave along the columns** so a fold travels through the paper instead
of the whole sheet breathing at once. That is not rigid folding any more, and it
is the right trade: every vertex is still a pure function of its `(i, j)`, so
neighbouring facets share their corners exactly and the sheet stays watertight.
The panels give up a little flatness, which nobody can see, rather than the seams
opening, which everybody can. Because the columns may each sit at their own
angle, the x positions are a running sum rather than a closed form.

Two things the probe taught, both about light rather than geometry:

- **Wrap the key light.** Panels turn through ninety degrees at every crease, so
  a hard `N·L` sends half of them to zero and the sheet reads as holes.
- **A corrugation shadows itself everywhere**, which is the point — but letting
  the shadow map drive an occluded panel to black loses the fold pattern exactly
  where it is deepest. The map is remapped into `[0.38, 1]` instead.

### CathedralGlass, and an overflow that turns bright pixels black

A single sheet of stained glass does not need OIT: there is nothing to sort.
This scene earns it by stacking three rose windows at different depths and
turning them against each other, so some pixels have three panes in front of them
in an order that changes as they rotate. The geometry is split by kind — opaque
stone tracery, transparent glass — and the vertex shader drops whichever kind
does not belong to the pass currently running.

Stained glass is not lit, it is **backlit**: a pane's colour is what survives the
light passing through it, not what bounces off. So the glass has almost no
diffuse term and a large emissive one, scaled by the spectrum band that pane
stands for. Shading it the usual way — key light, specular, ambient — gives
coloured plastic.

That emissive term exposed a real bug, and it is worth stating plainly because
the symptom points the wrong way:

> The OIT accumulation buffer is **RGBA16F**, and the weight multiplies colour by
> up to 3000. An emissive colour of 10, times an alpha near 1, times that weight,
> summed over three overlapping layers, passes 65504 — half precision's ceiling.
> It becomes `+Inf`, and `OitResolve.frag`'s inf guard paints it **black**. So
> the *brightest* region of the image is the one that goes dark.

The fix is two-sided: tone-map the colour *before* accumulating rather than after
resolving, and drop the weight ceiling from the paper's 3e3 to 2.5e2 — which
keeps the same relative ordering between near and far layers with an order of
magnitude of headroom. `GlassStack` had the same latent bug (its specular spikes
on a loud kick could overflow the same way) and got the same fix.

One thing remains unexplained rather than fixed: quads emitted across the centre
of projection came back as thin slivers instead of full wedges — one triangle of
each pair never rasterised — while the identical quad moved out to the rim drew
correctly. Neither winding order nor a larger inner radius changed it. The window
is therefore built as an annulus around an open oculus, lit from its inner rim,
which is what a real one often is anyway.

### ShadowForest — the shadows are the subject

The trunks are almost nothing: tapered four-sided prisms, dark, mostly in
silhouette. The scene is about the pattern they throw across the ground, which
is the one thing that cannot be faked without a shadow map — sixty overlapping
shadows, each stretching and swinging as the light moves, is not a texture
anyone can author.

Two constraints shaped it, and both are consequences of decisions the engine
made earlier for good reasons:

- **The sun is high, so the trunks must be tall.** The host deliberately keeps
  the light steep, because shadow length goes as 1/tan(elevation) and a low sun
  turns any scene with repeated geometry entirely dark. At about sixty degrees a
  shadow is a bit over half the object's height — so the only way to get a shadow
  worth looking at is to give it something tall to fall from. The trunks run
  7–13 units against a 1.7-unit eye height.
- **Everything stays inside the light's box.** It is centred on the origin and
  sized once from `shadowExtent`, so geometry past its edge silently reports
  "lit" and a whole region of ground comes back flat. A short dense stand inside
  the box beats a deep one half outside it.

The ground keeps a real sky term where it is shadowed rather than going to
black — a shadow on a sunlit floor is blue, not absent.

### SmokeHall — finished on the third pass, and why the first two failed

`SmokeHall` is the only scene that uses both new contracts at once: the hall is
opaque and casts into the shadow map, the smoke is transparent and reads that
same map back, so a slab standing in a beam's shadow goes dark and the shafts
between the roof slots are real geometry rather than a screen-space guess.

It took three passes, and the first two diagnoses were both wrong in the same
way. The frame kept coming back an even grey, which looks like a tuning problem
every time. It was not:

> **The hall did not fit in the light's box.** `shadowExtent` sizes an
> orthographic box centred on the origin, and the shadow lookup returns *lit* for
> anything projecting outside it. That fallback is correct — there is no
> information out there — but it is **silent**, and a volume that is lit
> everywhere looks exactly like a volume whose shadow map was never written. The
> hall is 32 units wide and 34 deep; at `shadowExtent="24"` most of it was
> outside, so most of the smoke reported lit and the shafts had nothing to cut.

Sealing the roof completely settled it in a single probe: still pale, therefore
the beams were not shadowing anything, therefore the geometry was never the
issue. It ships at `shadowExtent="44"`, with the hall shifted to straddle the
origin — a scene built from z = -8 to 26 wastes half of any box small enough to
have usable resolution.

The aesthetic conclusion reversed too. The first two passes opened the roof up,
reasoning that the beams' black undersides were filling the frame. That was a
framing problem. **A shaft needs scarcity**: light through a fifth of the ceiling
leaves four fifths of the volume lit, and a mostly-lit volume is a pale wash.
Mostly dark with a few narrow slots is the cathedral — and it also makes the dark
ceiling correct rather than a fault.

Four findings from the earlier passes stand on their own:

### SmokeHall — the volumetric findings

- **A participating medium wants a FLAT OIT weight.** Every other transparent
  scene here uses a weight that falls off with depth, because that is what stands
  in for the sort that is not happening. A volume has no such ordering: every
  slice along the ray contributes equally to the integral. Weight the near slabs
  more and the resolve stops averaging the volume and instead shows you the
  shadow pattern of whichever slice is closest — coarse blobs where there should
  be beams.
- **Per-slice opacity is set by the product, not the slice.** With 56 slabs the
  number that matters is `(1 - a)^56`. At `a = 0.035` that leaves 13% and reads
  as thick smoke; at `0.16` it leaves 10⁻⁹, the volume goes fully opaque a few
  slices in, and its average colour simply replaces the frame.
- **Slots must run ALONG the corridor, not across it.** Across is the obvious
  arrangement and produces no visible shafts at all: a ray going down the hall
  crosses every stripe in turn, so every ray averages to the same value and the
  volume comes out an even grey. Lengthwise makes the lit/shadow split a function
  of screen x, and the ray keeps whichever side it started on.
- **The volume must be bounded to the architecture.** Slabs sized to cover the
  frustum grow past both the hall and the shadow box, where the lookup can only
  answer "lit" — and one uniformly lit slab in front of the lens washes out every
  striped one behind it.

### Four combines on the depth buffer

`CombineEdgeInk`, `CombineRimLight`, `CombineHeatShimmer` and `CombineWiggle`
all sit in the combine stage and all but the last read scene depth. Each turned
on one decision that separates the working version from the obvious one.

**`CombineEdgeInk` — use the second difference, not the first.** The obvious edge
test thresholds the difference between neighbouring depths, and it is wrong in a
way that looks nearly right: a floor receding from the camera has a large depth
difference between *every* adjacent pair, so the ground inks solid black while a
wall facing the camera gets no outline at all. The test fires on slope, and slope
is not silhouette. Comparing the centre sample against the average of its two
opposite neighbours fixes it exactly — on any plane, at any angle, that average
*is* the centre, because linear interpolation is exact, so the response is zero
except where the surface actually breaks. Dividing by distance afterwards keeps a
far outline as heavy as a near one. Without depth it falls back to a luminance
edge rather than switching off.

**`CombineRimLight` — reconstruct normals, but pick the right neighbour.** A rim
needs a normal and the depth buffer has none; it can be recovered by unprojecting
neighbouring pixels and crossing the edge vectors. At a silhouette the neighbour
belongs to a different surface, so the normal there is garbage — and a silhouette
is exactly where a rim is brightest, so the artefact lands precisely where the
effect lives. Taking both the forward and backward difference and keeping
whichever spans the smaller depth step fixes it: at an interior pixel they agree,
and at an edge the one that stays on the near surface wins.

**`CombineHeatShimmer` — bend along the gradient, not the value.** A ray crossing
turbulent air is deflected by the *slope* of the refractive index. Displacing by
a noise field directly is the common shortcut and it looks wrong in a way that is
hard to name: the image slides in blobs instead of rippling, because a smooth
field has no small-scale structure until you differentiate it. Distortion also
scales with the depth the ray crossed — more air, more bending — which is what
makes the far trunks of a scene waver while the near ones stay put.

**`CombineWiggle` — hold, and hold at a constant rate.** Drawn animation wobbles
because each frame was drawn separately, and it reads as hand-made only because
it is shot on twos or threes: the same drawing exposed for two or three frames,
so the wobble steps at eight to twelve times a second rather than at sixty. A
displacement that updates every frame is video noise. The hold rate has to stay
constant, too — `floor(time * rate)` with a rate that follows the music does not
speed the boil up, it makes the step index jump back and forth and the drawing
stutters at random. The music changes how far the line moves, never how often.

### IceCrack, DrumSkin, VideoRelief

**`IceCrack`** puts the photograph behind a sheet of ice that keeps breaking. The
shards are a Voronoi tessellation, and getting a clean crack out of one is the
whole problem. The usual trick — take `F2 - F1`, the gap between the distances to
the two nearest seeds, and call small values "near an edge" — is not the distance
to the edge. Where two cells meet head-on it is roughly right; where they meet at
a shallow angle it is far too large, so the crack swells into a broad smear
exactly at the junctions where three shards come together, which is where the eye
looks. The correct distance needs a second pass: for every neighbouring seed, the
perpendicular distance from the pixel to the bisector between it and the winning
seed. The smallest of those *is* the distance to the cell wall, and it gives a
line of even width everywhere. It costs a second nine-cell loop and it is the
difference between cracked ice and a dirty window. Each shard also refracts what
is behind it by its own constant offset, which is what makes the pieces read as
separate slabs rather than as a drawn pattern.

**`DrumSkin`** is a circular membrane vibrating in its real modes, and it exists
to be the counterpart of `CymaticsPlate`. That scene is a *plate* — it obeys the
biharmonic equation and its patterns are Chladni figures. A drumhead is a
*membrane*, governed by the ordinary wave equation, and the difference is
audible. Its modes are `J_n(a_nm · r/R) · cos(n·θ) · cos(ω·t)`, where `a_nm` is
the m-th zero of the Bessel function `J_n`, and the frequencies are proportional
to those zeros: 2.405, 3.832, 5.136, 5.520. Those ratios are irrational. A
string's overtones are 1, 2, 3, 4 and it sings a pitch; a drumhead's are 1, 1.59,
2.14, 2.30 and it makes a thud. The scene is that fact drawn — the modes never
come back into phase, so the surface never repeats.

The Bessel functions use the standard split: the ascending series below x = 3,
the large-argument asymptotic above. The asymptotic form is the interesting half,
because it says `J_n` behaves like a cosine whose amplitude decays as 1/√x — which
is why the ripples on a drumhead look like waves losing height toward the rim
rather than like a sine.

One thing the probe forced: **give each mode a constant phase offset.** Started
together, all eight cross zero together, and the head alternates between a smooth
dome and a flat plate with no pattern on it for half the cycle. Offsetting them
means some mode is always near its peak — which is also what a struck head does.

**`VideoRelief`** reads the image source in the *vertex* shader and makes its
luminance the height, turning a photograph, a Spout feed or a decoded video into
terrain the light can rake across. The normal decides whether it works: taking
the height at the vertex and treating the surface as flat gives a lit plane with
a texture on it. Four extra taps and a cross product give the relief. The step has
to be a real texel or two — smaller, and the difference is quantised by the
source's own 8-bit levels and the surface comes out terraced. The tangents also
have to carry the sheet's world size, or the normal is wrong by the aspect ratio.

### FeatherStorm and PrismExplode

**`FeatherStorm`** puts one feather in each quad and lets the fragment shader
cut the silhouette out of it. That split is the point: a feather has a
complicated outline and almost no volume, so paying for it in geometry would be
absurd, while paying for it in fragments costs one shape function and stays
crisp at any distance.

The shape took two corrections, and both are about why the first version read as
a bed of leaves:

- **The width profile must be asymmetric.** `sin(π·u)` is the obvious choice and
  it is symmetric, which is exactly what makes it a leaf. A feather is widest
  *past* the middle and narrows toward the quill much faster than toward the
  point; `u^0.55 · (1-u)^0.35` peaks at 0.61 and does both.
- **The aspect has to be about six to one.** At a third of its length, a shape is
  a leaf whatever the outline function does.

The two vanes are also given different widths — a flight feather's leading vane
is visibly narrower than its trailing one, and that asymmetry is most of what
tells the eye "feather" before it can name why — and the same comb that draws the
barbs also nicks the outline, because a vane with a clean edge looks like
plastic.

The motion is a vortex whose angular speed falls as 1/r. A rigid rotation is what
a solid disc does and the eye recognises it instantly; real circulation shears,
so the inner feathers whip round while the outer ones barely turn.

**`PrismExplode`** is a shell of glass wedges thrown outward on the kick and
pulled back by a spring. Its subject is dispersion, done properly: glass has a
different refractive index for every wavelength, modelled by Cauchy's equation
`n(λ) = A + B/λ²`. With crown-glass values that is 1.532 for blue and 1.527 for
red — and the three channels are refracted *separately*, each with its own index,
scaled by the wedge angle the generator measured for that shard. A thin shard
barely tints; a fat one throws a full spectrum.

That alone produced no rainbow, and the reason is worth stating because it is
physics rather than a bug:

> **Dispersion is only visible against high-frequency contrast.** The three
> refracted directions differ by a fraction of a degree, so against a smooth sky
> gradient all three land on nearly the same value and the shard comes out
> merely tinted. A prism in a featureless white room makes no rainbow either — it
> needs an edge.

So the analytic environment gained a set of bright narrow bands. They are not
decoration; they are the slit that turns the wedges into spectra. Total internal
reflection is also handled — `refract` returns a zero vector there, and falling
back to the mirror direction makes a grazing shard turn reflective instead of
black, which is what real glass does.

### Order-independent transparency

Interpenetrating transparent objects are the case sorting cannot solve: there is
no order of the objects that is correct for every pixel, because they pass
through one another — and sorting per triangle does not help either once two
faces intersect. **Weighted-blended OIT** sidesteps the question by never asking
it.

Every transparent fragment adds its premultiplied colour into an accumulation
buffer, scaled by a weight that falls off with distance, and multiplies a second
buffer down by `(1 - alpha)`. Both operations are **commutative**, so the result
cannot depend on the order fragments arrived in. No sorting, and no popping when
geometry rotates through itself. The approximation is that layers at similar
depths are averaged rather than composited in sequence — invisible for glass and
smoke, wrong for a stack of opaque cards, which is exactly the trade this
technique exists to make.

The engine side, mirroring the shadow contract: a scene declares `oitPass` to
opt in, draws its opaque geometry with `oitPass` 0 into the frame as usual, and
is then drawn a second time with `oitPass` 1 into the accumulation targets.
`Engine/OitResolve.frag` composites the result back over the frame.

Four things that are not optional:

- **The accumulation target must be floating point.** It sums premultiplied
  colour over every layer with no clamping in between; an 8-bit target saturates
  after two or three panes and the stack becomes a flat white card.
- **The two targets need different blend functions** — colour adds, revealage
  multiplies down — which one `glBlendFunc` cannot express. That is what the
  indexed `glBlendFunci` is for.
- **Depth writes off, depth test on.** The transparent pass shares the scene's
  depth buffer so opaque geometry still occludes it, but writing depth would
  make the first transparent surface drawn hide the ones behind it, which is
  precisely the order dependence being removed.
- **The weight must be computed from linear depth.** `gl_FragCoord.z` is
  non-linear, so feeding it in raw pushes almost every fragment into the same
  weight and the ordering hint is lost. The weight must also never reach zero,
  or a distant layer vanishes instead of merely being faint.

**`GlassStack`** is the first scene under the contract: nested glass shells,
each tumbling on its own axis so they interpenetrate rather than nest neatly —
neat nesting would be sortable, and would prove nothing.

### Shadow maps — a contract, not an automatic pass

The tempting design is for the engine to render every 3D scene a second time
with a light matrix substituted for `projM`. It does not work: **every scene
places its own camera** before applying `projM`, so swapping the matrix lights
the scene from a direction that ignores that placement. The depth pass is
therefore something a scene *signs up for*:

- The engine sets `shadowPass` to 1, binds a depth-only framebuffer, and draws
  the scene. It supplies `lightM`, `lightDir`, `texShadow` (unit 31) and
  `shadowTexel`.
- While `shadowPass` is 1 the scene projects its **world** position with
  `lightM` instead of its usual camera chain, and its fragment shader returns
  immediately — it would otherwise sample the very texture it is rendering into.
- A scene opts in by declaring `texShadow`; scenes that do not are untouched and
  cost nothing.

`lightM` is an **orthographic** box, because this is a sun: its rays are
parallel, and a perspective shadow frustum would give the shadows a vanishing
point the shading does not have. It covers a fixed 120-unit cube at the origin,
and a scene wanting shadows keeps its geometry inside it — automatically fitting
the box would mean refitting it every frame from bounds the host never sees.

Three things that cost iterations, all worth knowing:

- **`sampler2DShadow`, not `sampler2D`.** With `GL_TEXTURE_COMPARE_MODE` set,
  the hardware compares each of the four texels a linear filter would fetch and
  averages the four *booleans* — free 2×2 percentage-closer filtering. A plain
  sampler averages the depths first and compares once, which produces a hard
  edge with a halo rather than a soft edge.
- **No face culling in the depth pass.** The standard trick is to cull front
  faces so the map records each object's far side, moving self-shadowing off the
  lit surface — but it assumes a known winding, and the cube buffer winds its
  outward faces clockwise. Culling `GL_FRONT` there records the *nearest*
  surfaces and every face shadows itself. Receivers offset their lookup along
  the surface normal instead, which needs no assumption at all.
- **Shadow length goes as 1/tan(elevation).** At 37° a tall object throws a
  shadow longer than itself, and in any scene with repeated geometry the ground
  goes entirely dark — which looks exactly like a broken shadow map. The sun sits
  high for that reason.

**`PillarHall`** is the first scene under the contract: a field of pillars whose
heights follow the spectrum, on a floor bright enough to show what falls on it.

**The light's box is sized by the scene**, via an optional `shadowExtent`
attribute on the `<TextureShader>` element. The map's 2048 texels are spent
across whatever that says, so a 120-unit box gives a 3-unit object about fifty
texels and its shadows come out in blocks. Only the scene knows its own scale,
and fitting the box automatically would mean refitting it every frame from
bounds the host never sees. The value also reaches the shaders as a
`shadowExtent` uniform, so the normal offset is expressed in real world units
and stays correct at any scale.

**`Detonation`, `BloomSculpt` and `MetaSculpt` are now under the contract too**
— one scene on each of the three pipeline kinds, which is what actually proves
the claim that a single depth pass serves them all. The branch goes wherever
that kind produces `gl_Position`: the **geometry shader** for Detonation, the
**tessellation evaluation shader** for BloomSculpt, the **vertex shader** for
MetaSculpt.

The indirect path needed one refinement for this. A shadowed scene reaches
`draw()` twice per frame, and regenerating the mesh in both passes would double
the compute for an identical result — and worse, if any input changed between
them the shadow map would describe a mesh the camera pass no longer draws. The
generator therefore runs in whichever pass comes first (the depth one) and the
second pass reuses the buffer.

### The scene depth buffer, readable

The two texture-effect FBOs used to carry their depth in a **renderbuffer**,
which is write-only from a shader's point of view. It is now a **depth
texture**, and the combine stage gets both of them as `texDepth0` / `texDepth1`
(units 29/30) alongside the colour buffers it already had. The attachment costs
the same either way; what changes is that everything downstream — depth of
field, ambient occlusion, light shafts, fog — becomes possible, and it works
with *every* 3D scene in the library rather than only with scenes written for
it.

Two pieces of bookkeeping make it safe to rely on:

- **`depthValid`** (a `vec2`) says whether each layer's depth holds real
  geometry this frame. A 2D effect never touches the depth attachment, so
  whatever the last 3D scene left there would still be sitting in it — the
  engine clears it to the far plane for non-3D effects and reports 0, so a
  depth-driven combine can tell "everything is far away" from "there is no
  depth" and pass those layers through untouched.
- **`nearFar`** carries the 3D projection's clip planes, which live in
  `EffectShader` rather than in `Scene3DShader` because the consumer is the
  combine stage — and a second copy of those numbers that drifted out of step
  with the projection would silently distort every depth-based effect. A depth
  buffer is stored non-linearly, with most of its precision near the camera, so
  anything comparing depths has to linearise first or the whole scene lands in
  one bucket.

**`CombineDepthField`** is real depth of field: the focal plane is a physical
distance that the bass pulls toward the camera and the kick snaps back — a rack
focus on the beat. Samples that are *in focus and in front* are rejected when
gathering, which is what stops a sharp foreground from smearing into a blurred
background. Two things learned by looking: 12 taps spread over a large disc read
as twelve copies rather than as blur (wider bokeh needs more taps, not a bigger
radius), and the per-pixel rotation of the tap pattern has to come from a
**hash** — a smooth function of uv gives neighbouring pixels almost the same
twelve directions and the sampling becomes a visible weave.

**`CombineSunShafts`** is the effect that could not be done before. The classic
radial-blur godray marches toward the light accumulating the colour buffer, and
fails the moment anything bright sits in front of the light — a lit object
smears rays out of itself as if it were a hole in the sky. With depth, the
occlusion test is the real one, so shafts fall *behind* objects and are cut off
by their silhouettes.

Worth stating, because the wrong version is tempting: the march accumulates
**openness**, not the frame's colour. Colour is bright exactly where there is
geometry, while light only travels where there is none — accumulate both and the
two gates cancel and the shafts disappear. What travels along the ray is the
sky's light; what the frame contributes is only the occluders.

**`CombineAmbientOcclusion`** asks, for every pixel, how much of the hemisphere
above its surface is blocked by nearby geometry — which needs a position and a
normal, and only a depth buffer is available. Both are rebuilt: a depth sample
plus the field of view gives the view-space position (the screen coordinate is a
ray direction, the linear depth is how far along it the surface sits), and the
normal comes from the derivatives of that position across the screen.

This is exactly why the engine now shares `tanHalfFov` as well, and why
`Scene3DShader` builds its projection from those same constants instead of its
own literals. Guessed camera parameters do not look broken — they look like
slightly wrong occlusion, which is far harder to notice and impossible to debug
from the image.

Three details decide whether it reads as lighting or as dirt:

- The sampling radius is a **world** distance projected into screen space, so
  near geometry gets a wide kernel and far geometry a narrow one. A fixed pixel
  radius makes occlusion scale with distance, which is backwards.
- A **range check** rejects neighbours much closer to the camera; they belong to
  a different surface, and counting them draws a dark halo around every
  silhouette (the screen-space derivatives that produced the normal cross
  silhouettes too, so this term covers both problems).
- Occluded areas get **cooler and keep some of their own colour**, because light
  reaching a crease has bounced off the walls around it. Multiplying straight to
  grey is what makes cheap SSAO look like smudged dirt.

**`CombineDepthFog`** treats haze as physics rather than as a distance-keyed
colour ramp. Two things happen to light crossing a hazy volume: some is
absorbed, and some is scattered *into* the ray from the sun. A plain lerp toward
a fog colour models only the first, which is why it flattens a scene into a
wash; keeping them separate is what gives aerial perspective its direction —
the haze glows toward the light and stays dark away from it. Scattering is
weighted by the Henyey-Greenstein phase function, and a height falloff turns the
fog into a layer with a surface so tall geometry can stand out of it.

One trap, and it is a spectacular one: a phase function is a probability
**density**, and a forward-scattering lobe is very tall — at g = 0.62 its peak
is above 11. Used raw it does not brighten the haze, it detonates it and the
whole frame goes white. Dividing by that peak, which has the closed form
`(1+g)/(1-g)²`, turns it into a 0..1 shape that still concentrates exactly where
it should.

### Compute → indirect draw — geometry the CPU never sees

`geom="indirect"` is the third and last of the pipeline additions, and the only
one where the host stops knowing what is being drawn. A scene opts in the same
way as everywhere else — by putting an `X.comp` next to its `X.vert`/`X.frag` —
and that compute shader writes both the vertices **and the draw call's own
argument list** into buffers. `glDrawArraysIndirect` then reads the vertex count
straight out of GPU memory. Nothing about the geometry, not even how much of it
there is, travels back through the CPU.

The pieces:

- The vertex buffer is bound twice — as an SSBO for the generator to write, and
  as the VAO's array buffer for the draw to read. It uses the same interleaved
  `attrA`/`attrB` layout as every other 3D scene, so the existing VAO setup
  works unchanged. It is allocated lazily, on the scene's first appearance.
- The generator is a **second program**, so the shared audio uniforms never
  reach it. It gets a small explicit set by hand, plus the scene's own preset
  `<float>` params looked up by name — which is what lets a generator be tuned
  from the preset exactly like the render stages.
- **`Engine/IndirectClamp.comp`** is shared by every indirect scene. A generator
  hands out vertex slots with `atomicAdd`, and `atomicAdd` keeps counting after
  the shader has stopped writing: an invocation that finds no room still bumped
  the counter on its way to giving up. Handing that raw number to the draw would
  make the GPU pull vertices from past the end of the buffer, so the raw total
  lives in its own slot and this pass publishes the clamped value into the one
  the draw reads. Capacity is a multiple of 3 and reservations are 3 at a time,
  so a reservation either fits entirely or starts at or past the end — no
  half-written triangle can fall inside the clamped range.
- Three barriers, not one: the clamp pass needs the finished counter before it
  runs, and the draw needs `GL_COMMAND_BARRIER_BIT` as well as the vertex-attrib
  bit. Forgetting the command bit is the classic bug — the draw then reads a
  stale count and the mesh flickers between this frame's size and the last
  frame's.

**`MetaSculpt`** is the first scene on it: twelve metaballs, one per pitch
class, orbiting and swelling with their own chroma bin, extracted as an
isosurface every frame. A single note grows one lobe, a chord merges several
into one smooth body. Because metaballs *merge* rather than intersect, the
result always reads as a single object.

Extraction is marching **tetrahedra**, not marching cubes: each cell splits into
six tetrahedra via the Kuhn decomposition, and a tetrahedron has three
topological cases against a cube's 256. It costs more triangles for the same
surface, but it needs no 4096-entry table baked into the shader and it cannot
produce the ambiguous-face holes that make a naive marching-cubes implementation
leak. Every tetrahedron's faces lie either on the cube's surface or on a shared
diagonal plane, so neighbouring cells agree and the mesh is watertight without
any inter-cell communication.

One sign worth remembering: **a metaball field grows toward the inside**, so its
gradient points inward and the outward normal is the *negated* gradient. Getting
this backwards is easy to miss, because a fragment shader that flips normals
toward the eye still lights the body plausibly — while every derived quantity
that actually needs the direction (thickness probes, rim terms, reflections) is
quietly wrong.

**`GrowthTree`** shows the other thing this stage is for. A compute shader
cannot recurse, which is the obvious way to build a tree and the one that is
unavailable. The way around it is that a binary tree has a closed-form address:
number the branches the way a binary heap numbers its nodes and a branch's index
*is* its path from the root. Node *n*'s depth is the position of its highest set
bit (`findMSB`), and the bits below that spell out, one per level, which way to
turn. Every thread reconstructs its own branch from scratch in O(depth) steps,
with no shared state and no ordering between threads at all.

Growth is a wave in *depth*: a level opens only once the growth phase has passed
it, so the tree unfurls from the trunk outward and folds back in, and a kick
shoves the wave forward so the crown bursts on the beat. Two proportions matter
more than they look: the branch radius has to taper more slowly than the length
(at 0.74 per level the eleventh generation is three thousandths of the trunk —
sub-pixel hairlines that alias into sparkle), and a leaf must be sized **from
the twig it grows on**, not from a constant, or it is bigger than the whole
branch and the crown becomes a pile of slabs.

**`SpectrumCity`** is a night city whose skyline is the music's history: depth
into the scene is time (rows of the spectrogram ring), distance from the avenue
is frequency, and a building's height is the energy that band had when its row
was written. A bar of music arrives at the horizon and marches down the street
as a wave of rising towers. The lots never move, which is what makes the window
pattern possible — the fragment shader needs a stable per-building identity, and
it has one because only the heights animate.

A generator can read the host's data textures too, but the host only uploads and
binds those while something on screen wants them, and the base `usesSpectro()`
only inspects the *render* program. `Scene3DShader` overrides it to check the
generator as well, and builds the generator in `initUniforms` rather than lazily
on first draw, so the answer is already correct when the host asks.

Two smaller traps, both familiar in shape: **`half` is a reserved GLSL keyword**
(like `centroid` before it) and produces a bare syntax error naming only the
token; and a roof "warning light" applied to the whole roof quad rather than a
small lamp turns every tower into a glowing red lid.

### Tessellation and geometry stages

Two pipeline stages that the project had never used are now wired in, and a
scene opts into them **purely by file presence**: `setShadersPipeline()` looks
for `X.tesc` / `X.tese` / `X.geom` next to a 3D scene's `X.vert` / `X.frag` and
attaches whichever exist. No preset attribute, no engine change per scene — a
missing file simply means "this scene does not use that stage".

Tessellation additionally needs patch primitives, so `Scene3DShader` gained
`geom="patches"`: a 64×64 field of quad patches (four control points each)
drawn with `GL_PATCHES` and `glPatchParameteri(GL_PATCH_VERTICES, 4)`. That is
the only geometry a tessellation control shader can consume.

**`Ocean`** is the first scene on it. Six octaves of Gerstner waves — which
displace the surface *horizontally* against the direction of travel, and that
is what produces sharp crests and broad troughs instead of a sine ripple — with
the tessellation level chosen per patch by distance, so the foreground gets
many triangles and the horizon almost none.

Things worth knowing before writing another one:

- **Project in the evaluation shader, not the vertex shader.** In a tessellated
  pipeline the vertex shader runs on the *patch corners*; projecting there
  means the tessellator interpolates in clip space and the displacement never
  appears.
- **Outer tessellation levels must match across a shared edge**, so compute each
  edge's level from that edge's own midpoint. Deriving it from the patch centre
  gives neighbouring patches different levels and the surface cracks.
- Any constant both stages use (here the sheet's `EXTENT`) has to be literally
  the same in both, or they place the same patch in different spots.
- Uniforms are **program-wide**, so the tessellation stages see `audioAdvance`
  and the preset `<float>` params without any engine plumbing. Preset params are
  scalars only — a `vec2` has to be a constant or two floats.

**`BloomSculpt`** is the second one: the patch sheet's (u,v) is read as
(azimuth, polar angle) so the flat grid closes into a sphere, and its radius is
then modulated by twelve spherical harmonics, one per pitch class. A held note
swells its own mode, a chord grows several lobes at once. Two details carry it:

- Every mode keeps the `sin(phi)^m` factor real spherical harmonics have. That
  is not decoration — it makes the mode vanish at the poles, where the azimuth
  is undefined. Without it each incoming meridian meets the pole with a
  different value and the sphere pinches into a flickering spike.
- The harmonic sum is **sharpened** before it becomes a radius (`sign(S) *
  pow(|S|, 0.68)`, with the same factor applied to the derivatives). A sum of
  smooth harmonics is smooth; rendered straight it is a bulging blob no matter
  how many modes go in. The exponent pushes the mid values out toward the
  extremes, so the surface spends its time on broad petals joined by tight
  creases.

**`SpectroCanyon`** is the third, and it is the one that needed a new piece of
engine. `texSpectro` (unit 28) is a **scrolling spectrogram**: 32 log-spaced
bands across, ~20 s of history down, written as a ring so no row is ever moved.
The history accumulates always — it is 32 bytes per row — while the texture is
created and uploaded only while an effect that samples it is on screen, exactly
like `texSSM`. Per frame it uploads only the one or two rows that actually
became due, splitting the block when it straddles the ring's wrap.

The canyon reads that texture as a heightfield: distance from the camera is
time, distance from the centre line is frequency, mirrored so the bass ends up
in the two outer walls and the treble along the floor. The mesh never moves —
the spectrogram slides through it, and that sliding is what reads as flight.

Two things make it work:

- **`spectroHead` is continuous.** It carries the sub-row fraction, because a
  head that only advanced when a row was written would jerk the terrain forward
  every 80 ms. It also trails the write head by two rows and lands on a texel
  centre: sampling any closer lets the linear filter interpolate across the
  write position, mixing the newest row with the 20-second-old one about to be
  overwritten.
- Normals come from **central differences at a fixed world distance**, not a
  fixed fraction of a patch. The height lives in a texture and cannot be
  differentiated analytically, and a step measured in patch space would change
  with the tessellation level and band the shading at every level boundary.

### Geometry shaders — GrassField and Detonation

The geometry stage gets one primitive at a time *with all its vertices at once*,
which is the one thing neither a vertex nor a fragment shader can do. Both
scenes on it exist because of that property, not despite it.

**`GrassField`** (`geom="scatter"`) holds 60000 bare points in its buffer and
nothing else; the geometry shader grows each into a tapered, wind-bent blade.
The blade shape lives entirely in the shader, so changing the grass costs no
buffer rebuild and no CPU work. Two of the points are hijacked as the backdrop —
index 0 becomes the ground plane, index 1 a sky quad written straight in clip
space at the far plane — because otherwise the gaps between blades are black.

`geom="scatter"` is the same point cloud as `geom="points"` but drawn **opaque
and depth-tested**. The existing point path is additive and depth-free, which is
right for glowing particles and wrong for anything solid: overlapping blades
would add up to white instead of occluding each other.

**`Detonation`** (`geom="grid"`) takes an ordinary closed mesh and treats each
triangle as an independent rigid body — only possible here, since a vertex
shader sees one corner at a time and cannot know which face it belongs to. A
ring of pressure sweeps out from a wandering epicentre, so shards lift in a
travelling wave rather than the whole shell pulsing at once.

- The mesh's own triangles are far too fine to be shards (52800 on a unit
  sphere, each a hundredth across — flung individually they read as dust). So
  the shards are **plates**: a coarse grid laid over the surface, with every
  triangle inside a plate sharing one centre, one axis and one throw.
- Which side of the shell a fragment is on is decided by `dot(N, V)`, **not** by
  `gl_FrontFacing`. That flag follows the mesh's triangle winding, and the grid
  this sphere is built from winds inward — it reports the entire outer shell as
  back-facing and paints the whole ball as magma.

**`HairCurtain`** and **`Blueprint`** round out the geometry stage, and each is
there for one specific reason.

Hair is shaded with Kajiya-Kay, because a hair is a cylinder far thinner than a
pixel: it has no single normal, it has a whole *ring* of them around the fibre.
Integrating over that ring makes the highlight depend on the angle to the
**tangent**, which is why hair shows a band of light running across the strands
instead of a point highlight on each one. Two things that cost iterations:

- The specular exponent has to be **far lower** than a solid surface would use.
  `sin()` of the fibre angle stays near 1 over a wide range, so a power in the
  hundreds collapses the band to nothing and the curtain goes dead flat.
- The strands must fall over a **curved crown**, not hang from a straight line.
  The highlight is a band of *directions*; a curtain of exactly parallel strands
  has the same angle everywhere and shows no band at all. Fanning the roots
  along an arc is what makes the sheen appear.

Blueprint draws a single-pass wireframe. That needs one thing a vertex shader
cannot provide: each vertex must know *which corner* of its triangle it is. A
vertex is shared between triangles, so that is not a property of the vertex — it
only exists once the whole triangle is in view. With (1,0,0), (0,1,0), (0,0,1)
at the corners, the interpolated value is the barycentric coordinate and its
smallest component is the distance to the nearest edge; `fwidth` converts that
to pixels so the line keeps one width regardless of foreshortening.

The same stage also solves the two problems that make such a wireframe look
wrong. The grid splits every quad into two triangles, and drawing the shared
hypotenuse turns a clean lattice into a herringbone that advertises the
triangulation — so each edge is checked for being a diagonal (its endpoints
differ in *both* parameters) and masked out. And a blueprint needs its sheet:
one triangle of the mesh is spent emitting a **full-screen triangle** in clip
space, which is exactly three vertices — the reason this fits where a quad
backdrop would not.

**`Magnetosphere`** is the third generator on the indirect path, and it exists
because a dipole field line has a closed form: `r = L·sin²θ`. Every point of
every line can be evaluated independently, with no simulation at all, which is
precisely the shape a compute generator wants. One thread builds one segment of
one line from nothing but its own index, and each shell is tied to one band of
the spectrum — bass in the tight inner shells, treble streaming out along the
outer ones.

The shell fraction rides down to the fragment shader in the spare vertex float
(2.0 marks the planet, anything below is the shell). Deriving it from the
position instead is wrong in a way that is easy to miss: a line's footpoints
come down to the planet's surface, so its innermost points share a radius with
every other line and the colour ramp collapses in the middle of the image.

### EventHorizon — general relativity in a plain fragment shader

`Scene2D/EventHorizon.frag` needs no compute at all. Each pixel integrates its own
photon in the Schwarzschild orbit plane using

```
d²u/dφ² + u = 3 M u²      (u = 1/r)
```

The `3Mu²` term *is* the relativity: drop it and light travels straight, keep it
and the photon sphere, the shadow and the Einstein ring all fall out for free.
The slideshow photo is the sky, so the lensing visibly drags the picture around
the shadow; the disk gets Doppler beaming from its Keplerian orbit, which is
what makes it read as *rotating* rather than as a flat ring.

Two things cost a rebuild each: the camera has to sit **outside** the disk's
outer radius (inside it, all you see is a wall of disk) at 20–45° elevation, and
the sky must be sampled with `textureLod(..., 0)` — next to the shadow the lensed
direction changes so fast between neighbouring pixels that the automatic
derivative picks a very coarse mip and the sky shatters into hard blocks.

*Naming:* a `Scene3D\BlackHole.frag` already existed, and the preset registration
script compared only the file NAME — so the new scene was silently skipped in
four presets. It now compares the full `Scene2D\<name>.frag` path.

**Lessons that cost a rebuild each** (all fixed in the code, worth not
repeating): `centroid` is a reserved GLSL keyword and cannot be a uniform name.
A capped per-cell index list makes separation saturate while cohesion, being an
average, does not — the flock collapses to a point unless a pressure term reads
the *uncapped* counters. Scattering a flock "radially away from the centre" is
a translation, not a scatter: on a wrapped domain it marches the whole
population into the border. Orbital speeds must be *derived* from the gravity
constant actually used — guessing left the discs 70× under-speed, so they
free-fell through the core and sprayed across the frame. And a NaN position
passes every bounds check (`NaN < 0` and `NaN >= w` are both false), so
particle sims need an explicit finite-check respawn. DLA needs *low*
stickiness (≲0.1) and walkers respawned on a ring around the cluster — freezing
on first contact from a seed line is Eden growth, a featureless advancing wall
with none of the branching. And `<windows.h>` defines `min`/`max` as macros
unless `NOMINMAX` is set before it, which turns every later `std::min` into a
baffling "invalid token on the right of `::`". `half` is a reserved GLSL word
too, so a butterfly's half-span needs another name. And a frequency mask needs
a LOW floor — a near-flat mask leaves the picture untouched, which is the whole
effect gone. `CfxResolve` writes the frame's density into the canvas **alpha**;
it used to write a constant 1.0 there, which silently told every screen-space
surface effect "solid everywhere". A droplet whose step length is the raw
terrain gradient never leaves its own texel and grinds that one pixel into
noise — take a fixed one-pixel step along steepest descent instead, and spread
erosion over a 3×3 kernel or the pixel-scale feedback dissolves the landscape.
Swift-Hohenberg selects `k = 1/sqrt(q)` radians *per texel*: the small-angle
shortcut `|lap| = k²` puts the pattern above Nyquist, so use the discrete
eigenvalue `2(1-cos k)` and pick the grid resolution to suit. And a shader
storage block in a `#version 330` fragment shader needs
`#extension GL_ARB_shader_storage_buffer_object : require` — bumping the
version instead would break linking against the shared 330 vertex shader.

**Probing these is its own trap.** Use one app run per scene with a generated
single-scene preset (`scratchpad/probe.ps1`): a preset whose name starts with
`Test` enables review mode and auto-advances every 8 s past whatever the remote
just forced, the recording's JPEGs lag behind a background encoder queue, and
during a cross-fade two scenes are on screen at once. All three silently
mis-attribute screenshots. `/api/snapshot` is synchronous but must be called
twice — the first call only arms the capture.

---

## GPU volumetric fire/smoke simulation

`VolumetricFire` is the third GPU simulation, and the most literal "3D" one: a
real volumetric field, faked as a 2D **tiled atlas** acting as a virtual 3D
texture (`Smoke3DSim.frag`, `texSmoke3D`, unit 9) — 20 square cells arranged
5×4, each cell one Z-depth cross-section of the volume; WITHIN a cell the local
(u,v) axes are (world X, world Y = height).  Two sub-steps run every frame on
the same `RGBA16F` ping-pong pair: a **horizontal** pass (per-cell curl
turbulence, a handful of wandering fuel emitters near the base, decay) and a
**vertical** pass (buoyancy — each texel pulls its value from the texel below
it in the same cell, so heat/density genuinely RISE — plus a light blend with
the neighbouring depth-cells to soften the between-slice seams).  R stores
temperature, G stores density.  Kicks/bass/drops drive the fuel injection
strength; treble/onsets drive the turbulence.

`VolumetricFire.vert/.frag` renders the living field as 20 additively-blended,
front-facing depth-slice billboards (the classic slice-based volume-rendering
trick — order-independent, so the stacked slices always sum correctly
regardless of draw order) — each billboard samples its own atlas cell and maps
temperature/density through a black → red → orange → yellow → white-hot ramp,
with a grey smoke haze wherever density outlives the heat.


### Sampler completeness: what the "texture state usage" warnings mean

A draw is validated against **every** sampler the bound program declares, not
only the ones its branches actually reach. So a shader that declares an
optional sampler -- a model's material layers, the frame-history ring, a
shadow map -- makes the whole draw ill-formed whenever that unit is left
empty, even though nothing samples it. The driver says
`texture object (0) ... does not have a defined base level`.

`glcoreDummyTex2D()` / `glcoreDummyTex2DArray()` / `glcoreDummyShadow()` exist
for exactly this: a complete 1x1 texture of the right TYPE, bound where a real
one is absent. The shadow stand-in reads 1.0 (the far plane), so a lookup
against it comes back "nothing occludes" rather than black.

Two rules follow, and breaking either produced hundreds of warnings per run:

* **A declared sampler always gets a unit, and that unit always holds a
  complete texture of the matching type.** Not "when the feature is active" --
  the mesh material sampler was assigned only when a model actually had
  material layers, which left a `sampler2DArray` pointing at unit 0, where a
  plain 2D photograph sits.
* **A function that moves `glActiveTexture` owes the next caller a reset to
  unit 0.** It is global state. `stepFluid()` ended with a bare
  `glBindTexture(..., 0)` while unit 2 was still selected, which emptied that
  unit rather than unit 0 -- and left the fluid program bound with `tex1`
  pointing at it.

A related trap, and a real spec violation rather than a warning: the shadow
pass renders **into** the depth map while the previous frame still has it bound
for reading on the shadow unit. A texture that is simultaneously render target
and sampler source is a feedback loop, undefined by the spec. The pass now
binds the stand-in over it for the duration of its own draw.

### Auto-exposure, and how it spent its life switched off

`Engine/CfxHistogram.comp` builds a luminance histogram of the finished frame
and derives a percentile exposure that `Present.frag` applies. It declared its
result SSBO at `binding = 0` while the C++ side binds the buffer to 3 and
`Present.frag` reads 3. So the compute pass wrote its exposure into whatever
SSBO happened to be bound at slot 0 -- a ComputeFX canvas, or a Scene3D vertex
buffer -- and `Present.frag` read the four values uploaded once at creation,
forever. The startup line said `Auto-exposure: histogram (GPU)` the whole time.

Two lessons, both cheap to act on:

* **A feature that reports itself as available has not thereby been observed to
  work.** The only symptom here was that the catalogue looked dark, which every
  reader attributed to the shaders.
* **Bindings are a contract between three files** -- the compute shader, the
  consumer shader, and the C++ that binds. Nothing checks them, and a mismatch
  is silent in both directions: the writer scribbles somewhere harmless-looking
  and the reader sees stale data.

Its two constants had therefore never been measured either. Over 7543 frames
from a 99-scene sweep (p50/p98 come from the pre-present frame, so they do not
depend on the exposure and the whole table is computable from one recording):

| target / maxGain | mean | median | near-black |
|---|---|---|---|
| no exposure at all | 0.169 | 0.147 | 12% |
| 0.26 / 1.35 (as written) | 0.184 | 0.194 | 10% |
| **0.34 / 1.8 (now)** | **0.234** | **0.259** | **7%** |
| 0.50 / 2.5 | 0.316 | 0.314 | 6% |

The exposure also **adapts fast through a scene change and slowly otherwise**
-- the scheduler tells it (`Inputs::sceneFade`, slew 4.5/s during a fade plus a
0.5 s tail, 0.9/s while a scene stands). An earlier iteration instead had the
shader snap whenever the median jumped >25% in one frame, reasoning that only a
hard cut moves a whole frame's median that fast. Both halves of that were
wrong, and measurement said so: the engine's scene changes are CROSSFADES,
whose median moves a few percent per frame and never trips such a threshold --
so the one case the snap was built for, it could not see (the gain walked
1.62 to 0.79 across two visible seconds while the new scene stood) -- and a
strobe scene would trip it on every flash and turn the exposure into a pump.
The scheduler simply knows when a fade runs; inferring it from luminance was
the wrong tool. The 0.5 s tail exists for a dark scene arriving over a bright
one: the mix stays bright until the old scene is nearly gone, so the correct
exposure only becomes reachable in the fade's last moments -- without the tail
the gain was still 0.57 short at fade end and crept for a visible second.
Verified over eight consecutive changes: five settle with literally zero gain
movement in the 1.5 s after the change, worst residual 0.157 (content drift),
where the slew-only version left up to 0.57 of visible post-fade adaptation.

Two more pieces joined after a user report of the picture abruptly dimming
INSIDE a scene about a second after a change:

* **The percentiles are smoothed before anything is derived from them**
  (EMA in the shader's SSBO, tau 1.75 s standing, near-instant during the
  scheduler's fade -- `smoothK`). Raw p50/p98 describe one FRAME: a beat flash
  moves p98 by half its range in two frames, and an exposure following raw
  percentiles follows the flash -- worst during the post-fade window while the
  slew is still fast. Measured on a spike-scene probe: in-scene gain movement
  per second fell from median 0.061 / max 0.318 to median 0.013 / max 0.085.
  The post-fade grace tail keeps only the fast SLEW; the fast MEASUREMENT is
  gated on the strict fade flag (`sceneFadeStrict`), or a flash landing in the
  tail would still yank the gain.

  The smoothing needed one companion: **the measurement snaps to the raw
  percentiles on the first frame after a fade ends** (`expoSnap`). The
  fade-time fast smoothing can only track the MIX, and the mix reaches the new
  scene's statistics in its very last moment -- left to the slow standing tau,
  the measurement then crept toward the new scene for seconds, and the gain
  visibly dimmed the picture after the change (worst arriving from a near-black
  scene, where the gain sits pinned at maxGain; reported as Aizawa dimming a
  second after leaving the black-hole scene). That first standing frame is
  100% the new scene, so its raw percentiles are the honest measurement.
  Measured on a dark-to-bright probe: gain at fade end 1.48 then creeping to
  1.28 over five standing seconds before; 1.01 at fade end and flat (residual
  0.03) after.

* **During a fade, the exposure measures the INCOMING scene's own composite**
  (`fadeMeasureTex` -- the texture feeding the transition's tex1 slot), not the
  presented mix. Measuring the mix cannot work by construction: its median is
  dominated by the outgoing scene until the fade's last moments, so for a
  bright scene arriving over a dark one the wanted gain stays pinned at maxGain
  almost to the end and the whole correction lands in the final tenth of the
  fade -- fast slew renders that as a one-frame crash, slow slew as a
  seconds-long crawl, and BOTH were reported (a user recording showed the
  arriving scene ramping 0.06 to 0.25 and then dropping 0.14 in one frame).
  With the destination measured from the fade's first frame, the gain glides
  across the whole fade (rates were calmed to 2.0/2.5 per second accordingly;
  the panic rates existed only to compensate for want arriving late). The
  fade-time smoothing tau sits at 0.3 s -- fast enough to converge inside a
  0.8 s fade, slow enough that the arriving scene's own opening flash does not
  drag the exposure (at 0.12 s an Apollonian intro flash pulled the gain to
  0.59 and back within one fade).
* **Fast attack, slow release** (`slewDown` 10/s fading, 2/s standing, against
  4.5/0.9 upward). When a bright scene fades in over a dark one the gain is
  still pinned high, and every frame it lags is a frame of the new scene
  overshot into glare, ended by a visible drop -- the reported "briefly bright,
  then abruptly dark". Asymmetry cannot pump, because want is computed from the
  smoothed percentiles. Measured: the worst single-frame luminance drop in the
  probe recording fell from 0.284 to 0.065, below even the pre-exposure
  baseline of 0.088.

`KALEIDO_EXPOSURE_DEBUG=1` logs the limiter's frame mean and the exposure
gain/percentiles per sample. It is what turned "the catalogue is dark" into a
binding number.

**Postscript -- the ramp-and-cliff was never the exposure.** After all of the
above, live recordings still showed a one-frame brightness crash (and a
visible background-texture swap) at the end of every scene fade, while
`EXPOGAIN` proved the gain gliding cleanly through the very same fades. Full-
frame stage means (mipmap-top readback per pass) localised it: the transition
mix was arithmetically perfect, but the INCOMING scene itself rendered onto a
different background as "next" than it did one frame later as "act". Cause: a
braceless `if` in `renderActiveScenePass` had swallowed a later-inserted
`glcoreDebugMark("oit")` line, so `renderOitPass` ran for every scene -- and
its resolve step binds `oitAccum`/`oitReveal` to the photo units 0/1 without
restoring them. The next-scene pass that follows sampled the OIT buffers as
its background photos; at fade end the real photos snapped in. Fix: braces,
plus the OIT resolve now rebinds the photos itself (so a genuine OIT scene
cannot poison the incoming scene either). Verified: all fade ends continuous
(0.0-1.3% deviation; before 33-194%), zero ramp-and-cliff events in a
six-change live recording. Lesson: when a state machine's endpoints disagree,
dump the *actual GL bindings* of both draws and diff them -- the culprit named
itself in one run after days of plausible theories.


## Screening the whole catalogue instead of watching it

831 scenes cannot be reviewed by eye, and the user-reported faults kept
falling into the same handful of families. So the catalogue is now screened
two ways, and the second one doubles as the catalogue-image render.

**Static audit** — grep for the fault signatures the feedback rounds
established. The productive ones this round:

* `float t = audioAdvance * k * spd;` with no `time` term. `audioAdvance`
  integrates the music, so on a quiet passage it barely moves and the scene
  stands still — the repeatedly reported "no dynamics, it just twitches to
  the beat". 66 scenes carried it. The fix is a steady base plus a musical
  push; the split matters, though: `time*k + advance*0.8k` runs 1.8x the
  old speed during music, which is too fast for scenes that were already
  right. `0.6k + 0.6k` keeps music-time close to the original and
  guarantees motion in silence.
* `floor(time * k)` with k >= 3 as a *reselection* clock — a 5-10 Hz
  strobe on whatever it gates (30 scenes).
* whole `floor(uv * N)` cells lit as stars or sparkles: those are SQUARES,
  and at N = 40..50 they are 40-pixel squares (8 scenes).

What the static pass CANNOT decide is the `hash11(x * big)` precision
collapse: whether `sin()` degenerates depends on the coordinate magnitude
at run time, not on the source text. A blanket edit there was wrong and was
reverted — that class belongs to the empirical pass.

**Empirical sweep** — `KALEIDO_SCENE_SWEEP=<secs>` walks the loaded config
in catalogue order and logs `[sweep] i/N t=<secs>s <name>`, so every scene
sits at a known timestamp. The catalogue is cut into ~110-scene configs,
each run against a WAV that alternates loud and quiet, and each recording is
decoded ONCE into numpy (`ffmpeg -f rawvideo`, 5 fps, 160x90) rather than
into thousands of files. Per window: median luma, median frame-to-frame
motion, a strobe ratio (max/median), spatial standard deviation, clipping.

The thresholds took a correction to be useful. "Dark" alone flagged 79 of
185 scenes and means nothing — a space scene is supposed to be dark. What
actually indicates a fault is *nothing to see*: luma AND spatial variance
both on the floor. With `LEER = luma < 0.030 and std < 0.038`,
`STARR = motion < 0.0025`, `BLITZ = strobe > 12`, the same data flags 15.

Two measurement traps, both of which produced confident nonsense first:

* The screening WAV steps between loud and quiet. The step itself is a
  frame difference, so every audio-reactive scene reported STROBE. Frames
  around the audio edge have to be dropped from that statistic.
* The recorder encodes the MP4 in a **separate ffmpeg process after the app
  exits**. Waiting only for the app gives you a file that does not exist
  yet, and the analysis then reports zero frames — silently, because an
  empty result is not an error. Wait for the file to appear, then for its
  size to stop changing, and refuse to delete a recording whose analysis
  returned nothing.

**Catalogue images from the same mechanism.** The per-scene harness
(`Tools/render_catalog_images.ps1`) restarts the application once per scene;
at roughly 40 s of start-up that is hours of pure loading for a couple of
hundred scenes. A catalogue sweep holds each scene for 24 s against a WAV
whose cycle is also 24 s (16 s quiet, 8 s loud), so the three catalogue
marks keep their old meaning — two quiet, one loud — in a single run.
The marks are chosen by the *actual* audio phase rather than a fixed offset,
because the sweep clock drifts by one frame per scene and several seconds
of accumulated drift would otherwise slide the "loud" frame into the quiet
half. `Tools/make_catalog.py` is incremental, so a partial scan updates only
the scenes it contains.

### One command, and a baseline to compare it against

The chain above lived in half a dozen throwaway scripts that had to be
reassembled from memory every time. It is now `Tools/screen.py`:

```
python Tools/screen.py                       # the whole catalogue
python Tools/screen.py --preset SpaceAmbient # only that preset's scenes
python Tools/screen.py --kind fx             # the overlays, over one fixed scene
python Tools/screen.py --save-baseline       # freeze the result
python Tools/screen.py --check               # compare against the frozen result
```

The baseline is the part that changes how the catalogue is maintained.
`docs/scene-baseline.json` records what every scene measured when it was known
good, and a later screening flags any scene whose structure or motion has
collapsed. Two of the four real defects found in the 31 August round were
earlier fixes that had treated a symptom and left the cause — the scene went
on rendering, just emptier — and both would have surfaced here at the next
screening instead of months later on a catalogue image.

The threshold is a factor of two, and that number is measured rather than
chosen. Run-to-run scatter with a pinned seed is about 2 % on calm scenes and
20 % on busy ones; **without** a pinned seed the same shader swings by a
factor of two, because each activation re-rolls the scene's parameters. Which
is why `KALEIDO_SEED` exists at all: a screening that cannot be repeated
cannot be compared, and a before/after where the unchanged control scenes move
as much as the edited one proves nothing. Always read the controls first.

Two more traps worth naming, both found by walking into them:

* **The metric rewards noise, not form.** Densifying `EndOfTheUniverse`'s
  starfield moved its structure score by 4.9× while turning a warm ember field
  into grey static. The change was reverted. Conversely a sparse point field
  measures low no matter how good it looks, because the analysis raster is
  160×90 and averages the points away. The numbers rank candidates; the
  picture decides.
* **Frequency and step size belong together.** Raising a volumetric scene's
  noise frequency to sharpen it made it measurably *flatter*: at a march step
  of 0.5 units, a frequency above 2 moves more than one noise cell per step,
  and the integral along the ray averages to a constant. Undersampling looks
  exactly like smoothness.

### Overlays are swept the same way

`KALEIDO_FX_SWEEP=<seconds>` is the scene sweep's counterpart: it holds the
scene still and steps through the overlays instead, so each one lands at a
known timestamp over identical content. An overlay that does nothing is a real
failure class — 43 silent FX and transitions were once found in a single pass
— and the picker is random, so nothing guarantees a given overlay is on screen
when you look. `RenderPipeline::forceFx()` deliberately bypasses the
complexity budget, the mood filter and the mesh-calm rule: a sweep exists to
see the one that was asked for, including the ones those filters would veto.

## Camera rigs are named, not copied

830 scenes carry a camera rig, and between them they use nineteen distinct
formula sets — the commonest twelve cover 822 of them. Written out per scene
that was 1333 lines of near-identical arithmetic:

```xml
<expr name="rigYaw"   formula="0.18*sin(0.450*advance + seed1*6.28)"/>
<expr name="rigPitch" formula="0.08*sin(0.375*advance + seed2*6.28)"/>
```

replaced by

```xml
<rig preset="mesh-18"/>
```

resolved at load time from `Presets/rigs.xml`.

The point is not the disk space. Every rig coefficient in the catalogue was
three orders of magnitude too small — oscillation periods of half an hour to
five hours, so a 40-second scene panned by 0.8 degrees and 238 scenes read as
still images — and that went unnoticed for months, because nobody reads 1300
near-identical numbers. As a twelve-row table the same fact is one glance.

The names describe the motion: `mesh-18` swings the yaw 0.18 rad, about ten
degrees. Where two sets differ *only* in which seed drives the yaw, the name
says so, because that is not a detail: pitch always runs on `seed2`, so a yaw
on `seed2` oscillates in phase with it and the camera wobbles along a diagonal
instead of tracing a compound path. Twenty-seven scenes do that. Left alone,
but now visible.

Eight scenes with one-off rigs keep their formulas. A rig used once is clearer
written out than hidden behind a name invented for it.

An unknown preset name is reported loudly rather than ignored: a silently
dropped rig leaves the camera frozen, and a frozen camera looks like a design
choice rather than a missing entry.

**The migration was proved, not assumed.** The engine prints an `Expr OK` line
for every expression it resolves (since 16.10.2026 only with `KALEIDO_EXPR_LOG=1`); the set was 2307 lines before and 2307 after,
with an empty diff. And a checker that reads only `Komplett.xml` goes blind the
moment the formulas move — `Tools/temporal_budget.py` dropped from 1579 terms
to twelve while still reporting "0 frozen", so it now resolves the table too,
and treats a missing table as an error rather than a quiet pass.

### The framing question, answered with a number

The contact sheets suggested the mesh scenes' models sit small in the frame.
`KALEIDO_COVER_LOG` replaces that impression with a measurement — an occlusion
query around the mesh draw, counting the fragments it writes. Across all 24
mesh shaders:

| | frame area |
|---|---|
| MeshTerrain | 51.6 % |
| Dissolve | 36.9 % |
| Condensation | 19.6 % |
| ShipDocking | 12.6 % |
| ShipFlyby | 8.2 % |
| **catalogue median** | **5.3 %** |
| IndustrialStation | 3.6 % |
| SensorStation / ExoticStation | 2.8 % |
| FortressStation / Creature | 2.4 % |

The station families are the smallest and the tightest cluster: 2.4 to 3.6 per
cent. With 96 % of the frame being sky, a correct camera move measures as
almost no motion — which is the whole explanation for their STARR flags, and
nothing is wrong with their rigs.

Two failed measurements on the way there, both given away by their own results.
A query around the ordinary draw counts **overdraw**, not silhouette (4.0 to
7.0 where 1.0 is the maximum); the draw has already left the visible surface in
the depth buffer, so a repeat draw under `GL_EQUAL` passes exactly once per
covered pixel. After that every scene measured exactly 4.0000, and that
exactness gave away two more things at once: the vertex buffer carries the
background dome behind the model (so the draw covers the whole frame), and
`GL_SAMPLES_PASSED` counts *samples* — four per pixel under 4× MSAA.

**The framing cannot be changed through the rig.** Tested rather than assumed:
pushing `rigDolly` through 0.55, 1.5 and 3.0 over a scene's lifetime moved
SensorStation's coverage from 3.9 % to 4.2 % to 4.3 %. The framing is built
into each scene's own `.vert` (`world.z += 105` and similar), against which a
translation of a few units is nothing. Changing it means editing the camera
distance in 24 mesh shaders, which is an aesthetic decision, not a repair.

### Arcs: a scene that moves is not a scene that goes somewhere

`arc` = net change across the window ÷ path length. A scene that rotates and
arrives where it started scores low however much it moves; one that goes
somewhere scores high. Measured over the mesh shaders, `AtmosphericEntry` —
the only one with a staged dramaturgy — scores **0.64**, while the station
families sit at **0.10**. The metric separates the two cleanly, which is what
makes "this scene needs an arc" a finding rather than an opinion.

`progress` is now a variable of the formula language (0 at scene start, 1 at
the end of its solo span), so a scene can be given an arc through its rig
instead of through its own source. What that experiment also showed, though, is
that an arc and the framing are the same problem: with the model on 4 % of the
frame, no camera move can produce much net change, because the remaining 96 %
is a sky that does not respond to translation.

### The clock nobody bounded

Three scenes measured a spatial structure of 0.0006–0.0022 in the full
screening run and 0.22 when re-rendered on their own — a factor of 400. The
first suspicion was the measurement: a wrong window, a drifted timestamp, the
wrong neighbour. Extracting the frames settled that. The alignment was exact
(offset −0.2 s), and the frame really was a flat green field with faint
concentric rings — which is precisely what
`HyperbolicTilingPolyhedralFlight.frag` draws when **no ray hits anything**:
`bgCol = imgPalette(length(uv) * 0.3 + 0.4)` depends only on the radius.

The cause is one line of engine, one line of shader:

    RenderPipeline.cpp   m_globaltime += timeSinceLastFrameSec;   // never reset
    the shader           ro = vec3(sin(t*0.4)*0.9, t*1.1, cos(t*0.35)*0.9);

`time` counts seconds since the program started. The camera flies along +y at
a fixed rate, but the honeycomb is a fold fractal that only exists near the
origin — five reflection planes cannot bring a point at y = 80 back into the
cell. So the camera leaves its own world and keeps going.

`KALEIDO_TIME_START` presets the clock, which turns "does this scene survive an
hour?" from a question that costs an hour into one that costs a minute:

| clock at start | spatial std | luma |
|---|---|---|
| 0 s | **0.1939** | 0.419 |
| 120 s | 0.0075 | 0.197 |
| 900 s | 0.0014 | 0.053 |
| 3600 s | **0.0005** | 0.058 |

The scene is dead after two minutes. In normal use the program runs for hours;
the screening measured every scene within the first few minutes of a
recording, which is exactly why the whole class stayed invisible. It also
explains the shape of the original anomaly: the scenes that measured near zero
sat *late* in a 15-minute chunk, and the nine-scene reproduction failed
because there the same scene ran at t = 30 s.

`audioAdvance` and `audioRotPhase` are accumulators too
(`m_audioAdvance += dt * advRate`), so the class is not limited to `time`.

Two fixes are correct, and which one applies depends on what the scene claims
to be:

* **`sceneTime`** — a new uniform: seconds since *this* activation, so a flight
  restarts on every appearance. Enough when one solo span of travel stays
  inside the geometry.
* **A periodic domain** — `mod` on the flight axis, with the camera origin
  wrapped to the same period. Then the flight really is endless, and the
  coordinates stay small enough for `float` to resolve a strut.

`Tools/clock_runaway.py` finds the candidates statically: it follows `time`,
`audioAdvance` and `audioPhase` through the assignments of a shader and reports
where one of them reaches a *position* without a bounding function around it.
Two decisions keep the list readable — a value that has already gone unbounded
is reported once, at the assignment where it entered a position rather than at
every consequence downstream; and a call to a function defined in the same file
counts as a boundary, because a distance estimator returns a distance, not a
position. The output is a suspicion list, not a verdict: a domain that wraps
itself with `mod` makes the identical expression completely correct. What
settles it is the measurement.

### One measurement is a sample, not a verdict

Chasing an apparent regression turned up a second, more uncomfortable finding.
`FuturisticCityFlight`, measured in the same configuration, at the same clock,
with the same neighbours — only the seed differing:

| seed | spatial std |
|---|---|
| 1 | 0.0694 |
| 2 | 0.0837 |
| 3 | **0.0062** |
| 4 | 0.0292 |

A factor of thirteen, from nothing but the per-activation parameter roll
(`glowP` 0.6–1.8 scales the window lights and neon, which are the only bright
things in a night city; `fogP` 0.5–1.5 takes them away again). Seed 3 is not a
broken scene — it is one legitimate draw at the dark end of the ranges.

This bounds every conclusion drawn from a single screening value. A scene
flagged once is a suspicion; the catalogue-wide list of nineteen "collapses"
against the baseline shrank to twelve real ones as soon as each was measured
directly at two clocks with the same seed. It also explains the original
factor-400 anomaly more completely than the clock bug alone did: that scene
was genuinely dying with the clock, *and* its measured value swung with the
draw.

`screen.py --confirm` is the arbiter: it re-measures the flagged scenes with
three seeds and reports min/median/max. `FuturisticCityFlight` comes back at a
median of 0.0478 — comfortably alive. The rule that follows is worth stating
plainly: **never edit a shader on the strength of one measurement.** The two
cheap confirmations are a second seed and a second clock, and they cost about
two minutes each.

### What the baseline comparison cannot see

Comparing a late-clock run against the baseline only finds scenes that
**drop**. A scene that already sat late in its chunk when the baseline was
recorded was already dying there, so it shows no drop at all — it can only be
found by its *absolute* value. Three more clock victims came out that way:

| scene | clock 0 | clock 3600 | after |
|---|---|---|---|
| NeutronStarCollision | 0.1073 | 0.0237 | 0.1442 → 0.1122 |
| SupermassiveBlackHoleOrbit | 0.1036 | 0.0291 | 0.1073 → 0.1250 |
| AbandonedStarGate | 0.0526 | 0.0360 | 0.0457 → 0.0435 |

(medians of three seeds, before and after)

Equally worth recording is what was **not** touched. `Assembly`, `Dissolve`,
`EndOfTheUniverse` and `MelodyScript` measure just as flat at clock 0 as at
clock 3600 — they are not victims of the clock, they are empty scenes, which
is a different problem and belongs on a different list.
`EndOfTheUniverse` even carries the suspicious `drift = time * 0.6 + ...`
line, but it demonstrably does not degrade; the rule exists to prevent a
defect, not to justify rewriting code the measurement clears.
`CarbonNanotubeChiralityArmchairZigzag`, flagged at exactly 3.02× against the
baseline, comes back at a median of 0.1354 — the flag was parameter scatter,
nothing more.

Twenty shaders were corrected in this class in total.

### The old flag list, closed

The forty scenes flagged by the earlier clock-0 screening were re-measured
with three seeds each. Every one of the strongest-looking candidates came back
healthy:

| scene | single measurement | median of three |
|---|---|---|
| SuperconductingVortexLatticeMelting | 0.0055 | **0.0683** |
| NonEuclideanKleinQuarticTile | — | 0.1261 |
| Hologram | — | 0.1015 |
| HarmonicRings | — | 0.0816 |
| ModalVibration | — | 0.0600 |
| DielectricMetasurfaceHologram | — | 0.0521 |
| Aperture | 0.028 (3 of 14 windows) | 0.0648 |

`SuperconductingVortexLatticeMelting` had looked like the single most
convincing finding on that list — luma 0.0000, structure 0.0055, one window.
It is fine. Its median is twelve times its flagged value.

What survives confirmation is a short list of genuinely sparse scenes —
`Assembly` 0.025, `EndOfTheUniverse` 0.023, `Dissolve` 0.018, `MelodyScript`
0.040 — all of which measure the same at both clocks. That is a composition
question, not a defect, and it is the one thing this pass deliberately leaves
open.

### The four sparse scenes, looked at properly

The four scenes that measured flat at both clocks were rendered with a 30 s
hold — long enough for a staged scene to play out — and again with real music
(`Tools/review128.wav`, looped to 150 s because the engine exits with the WAV
in offline mode and the original is 30 s). One of the four was a bug, one was
under-exposed, two were the probe.

**Assembly** (mesh family, 8 models) — a bug. The arc works: pieces fly in,
the bust is half-assembled at 14 s, complete at 20 s. But the finished object
stood as a flat, saturated orange silhouette with no shading at all — measured
RGB 0.67 / 0.36 / 0.17. The landing flare was written as "a narrow window
around seat = 1":

    landing = smoothstep(0.82, 1.0, seat) * (1.0 - smoothstep(1.0, 1.02, seat));

`seat` is clamped to [0, 1] and never reaches 1.02, so the closing edge of the
window lies **outside the value's range**: the flash switched on and never
switched off. The flash now lives in the geometry stage on the flight's own
clock `k`, as `smoothstep(0.85, 0.97, k) * (1 - smoothstep(0.97, 1.0, k))` —
zero at k = 1 and beyond. The finished bust is now cold, lit marble
(RGB 0.09 / 0.08 / 0.06). Its sky was also raised to the level its sibling
Dissolve already had, and for the same reason: for the first third of the
scene the sky *is* the picture. A catalogue grep for the same shape
(`1.0 - smoothstep(a, b, x)` with b beyond the range of x) found no second
instance.

**Dissolve** (mesh family, 8 models) — exposure. The silhouette read, but the
body measured luma 0.04–0.08 against a sky of 0.03: a contrast of 1.4–2.6×.
The splat falloff `(1 − r²)²` averages to one third over the disc, and at
this grain the splats barely overlap, so a third of the material's brightness
is what reached the frame. A factor of 2.4 on the splat colour puts the lost
two thirds back without changing the falloff's shape; the body now sits at
0.10–0.14, contrast 3.9–5.1×, and still reads as dust.

**MelodyScript** — the probe. The screening WAV's drone is at 55 / 82.5 Hz;
the engine maps dominant pitch over 60–1200 Hz, so the probe has no usable
pitch and the pen sits at the bottom edge or lifts. With real music the scene
draws a glowing handwriting line mid-stave with its octave doublings, playhead
and accent strokes — structure 0.078 against 0.033 on the drone. Nothing to
fix in the shader; the blind spot is now documented in `write_wav()`.

**EndOfTheUniverse** — intent. "A terrifyingly empty, black void where only
the faintest embers remain", and that is what it draws, with the drone and
with music. It is tagged dark/calm and is only chosen for quiet passages.
Left alone.

## Foundations, second round

Nine proposals were built in one evening; each is behind an environment
variable or a new tool, so the running show is unchanged. What was proven,
and how:

### Randomness per scene

`KALEIDO_SEED` used to seed one global `rand()`; which parameters a scene
drew depended on who ran *before* it, which is why a nine-scene reproduction
of a 112-scene chunk measured 0.22 against 0.0006 for the same shader.
`EffectShader::resetParameters()` now reseeds from (seed, shader path,
activation count) — FNV-1a — when the seed is pinned, and does nothing
otherwise. The proof is not a picture (the cross-fade from a different
neighbour contaminates the window) but a log line: with `KALEIDO_SEED` set,
each activation prints `SEEDED <shader> act=N seeds=… solo=…`, and the line
for `FuturisticCityFlight` reads `seeds=0.8874 0.3799 0.5453 solo=89` alone
and with four neighbours alike.

### The solo span the screening never saw

`sceneProgress` normalised over the review span of 25 s while the screening
held each scene for 8 s, so a staged scene was measured in its first third:
`Assembly` stood in every window as a cloud, luma 0.0039.
`KALEIDO_SOLO_SECS` caps that span (`soloCap()` in EffectShader), `screen.py`
sets it to the hold time, and the same window now measures luma 0.0166 and
structure 0.042 with the bust assembled.

### Parameter corners

`KALEIDO_PARAM_CORNER=min|max|alt` makes `Uniform::roll01()` return the end of
every range instead of a draw. `Tools/param_corners.py` renders the three
corners plus a three-seed median and reports a corner that is empty while the
median is healthy — a range that is too wide, not a shader that is broken.
This is what the seed-3 draw of `FuturisticCityFlight` (0.0062) was.

### The recorder was already fast

It has had an async PBO readback and NVENC for a while; only its cap was 30.
`KALEIDO_RECORD_FPS=60` lifts it without touching the user's ini, and the
pipeline sustains it: 3233 frames in 53.9 s, exactly 60.0, against 1614 at
30. The screening still samples at 5 fps, so its strobe measure does not
benefit until that raster changes too.

### The melody is not the root

The dominant pitch is a harmonic product spectrum over 60–1200 Hz, and on a
full mix the strongest harmonic series is the bass line. Measured on a
synthetic track with a loud saw bass and a lead an octave above the chords:
38 % of frames under 0.15 (bass), 1 % in the lead's range. `melodyPitch` runs
the same product spectrum from 150 Hz up — 10 % and 73 % — and now feeds the
melody ring, so `MelodyScript` writes the tune. Shaders get it as
`audioMelodyPitch`; `audioPitch` stays the root.

### A feature log, finally

`KALEIDO_FEATURE_LOG=<csv>` writes one line per frame: pitch, melody,
buildUp, dropPulse/Count, bar and beat phase, BPM, section, presence, level,
swell, flux, harmonic change, phrase position and seconds to the next phrase
boundary. Every number above came out of it. Two traps it exposed at once:
`estimatedBPM` is *normalised* — (BPM − 40) / 160, so 0.6 is 136 BPM and not
"no tempo" — and the analyzer reads the first ~20 s of anything as a build-up
while its 10-second baselines are still climbing (0.67 in an intro groove,
0.43 in the actual build-up that followed).

### Tools that read the scene instead of guessing

`Tools/scene_traits.py` derives `staged` (reads `sceneProgress`, or a rig
formula uses `progress`) and `pitch` (`audioPitch`/`audioMelody`/
`audioDeltaPitch`) from the source — six staged scenes, seven pitch-driven —
and the screening report tags flagged scenes with them.
`Tools/check_enum_tables.py` (CI) keeps `AudioLocE`/`kAudioLocNames` and
`ExprVars`/`kVarNames` the same length; both were extended by hand twice today,
and a mismatch there is silent.

### The baseline as a distribution

`screen.py --seeds N` renders every chunk N times and records
median/min/max per scene; `--check` compares against the recorded *minimum*,
so a value the baseline itself once produced is no longer a regression. The
screening WAV is version 2 — a chord bed, a lead, a bass line and drums at
128 BPM under the same loud/quiet cycle — because version 1's drone had no
pitch at all. The baseline carries the WAV version and refuses a comparison
across versions.

### Cue memory: a favourite that remembers where it was pressed

The taste system already had favourites (`F`, `/api/fav`) and marks. A
favourite pressed while a track is identified now also stores *where*:
`[cues] <track>/<second> = <scene>` in the settings ini, with the track key
derived from the OS media session's `artist|title` reduced to `[a-z0-9_]`.
`RenderPipeline::tickCues()` runs once per frame; when the same track is
playing and reaches a remembered second (±2.5 s), it forces that scene once
per playback through the same path the remote's scene browser uses. The
visualiser learns one favourite picture per song per press.

Offline it is testable through `KALEIDO_FAKE_TRACK=artist|title`, which
supplies a fixed key and the run clock as the position. Two cues written into
the ini fired at 18 s and 34 s, each followed by the activation of its scene —
the second one even had its arc re-timed by the regie below.

One finding on the way: the engine reads `..\kaleidoscope_settings.ini`
*relative to the executable*, which in the development tree is the file in the
repository root, not the one next to `Release\Kaleidoscope.exe`. The first
test edited the wrong file and fired nothing.

### Arcs on the drop

Dance music puts its drops on 8-bar boundaries. The conditioner now counts
bars into a phrase (`phrasePos`, and `phraseSecsLeft` at the current tempo),
resetting only on a detected drop — section changes looked like the natural
anchor too, but they land mid-phrase as often as not (measured at 16.6, 34.3,
47.1 and 91.0 s on a track whose phrases sit at 15, 30, 45 …).

When `buildUp` rises past 0.45 (after a 20-second warm-up, because the
analyzer reads any opening groove as a build-up while its baselines settle),
`SceneScheduler` takes the active scene, and if it is staged, calls
`EffectShader::setClimaxIn(phraseSecsLeft)`: the progress ramp is bent so that
0.95 lands on the predicted boundary, continuously — the current progress is
kept and only the slope changes, so no piece flies out again. The ramp has its
own origin (`m_progressT0`) precisely so that `sceneTime`, which the 19
clock-fixed scenes fly on, does not jump. While the tension rises, the next
pick also prefers staged scenes.

Two engine details this surfaced: `estimatedBPM` is normalised, (BPM − 40) /
160, and the bar counter must count every arrival at beat one — a downbeat
resync from beat two skips the 3 → 0 wrap and silently loses a bar.

**Measured**, on a synthetic 128 BPM track with three build-up → vacuum →
drop rounds at 45, 90 and 135 s (`Tools/make_structure_wav.py`, which writes
the truth next to the WAV): the drops are detected 0.3–1.0 s ahead of the
slam (44.73, 89.34, 133.95); the build-ups cross 0.45 at 41.9, 87.0 and
131.8 s; and once the first drop has anchored the phrase clock, the predicted
drop lands at 89.9 and 134.4 s — errors of **−0.1 s and −0.6 s**. The first
drop of a track has no anchor and came out +2.0 s late. The phrase clock got
there in two steps: counting bars from the host's bar bookkeeping lost one in
four (16 counted against 23 real in 44 s) whenever a downbeat resync and a PLL
wrap disagreed; integrating beats from the tempo since the last drop cannot
lose a bar, and drifts only with the tempo error. The drop detector's arming
threshold also had to come down from 0.60 to 0.45: even a deliberately strong
synthetic build-up peaks at 0.50–0.53 on that feature, so nothing ever armed.
The vacuum and bass-slam tests behind the arming are what keep a false drop
rare. The two false build-up rises in the first 25 s of the track (the
analyzer's baselines settling) bend an arc once for nothing; the scene simply
finishes early.

### Real music, at last

Seven tracks from the user's library — psytrance (1200 Micrograms, Astrix,
Infected Mushroom), big-beat (Prodigy), house (Daft Punk), rock (AC/DC) and
pop (Alanis Morissette) — converted to mono WAV and run offline with the
feature log. Two things came out unambiguously.

**The dominant pitch is the bass.** On a real mix the strongest harmonic
series is the bass line in 32–91 % of frames; the melody search from 150 Hz
up moves that to 0–2 % and puts 71–97 % of frames in the melodic range:

| track | dominantPitch under 0.15 | melodyPitch in 0.3–0.7 |
|---|---|---|
| 1200 Micrograms — DMT | 91 % | 71 % |
| The Prodigy — Breathe | 90 % | 93 % |
| AC/DC — Thunderstruck | 71 % | 79 % |
| Astrix — High On Mel | 53 % | 81 % |
| Infected Mushroom — Dancing With Kadafi | 38 % | 94 % |
| Alanis Morissette — Ironic | 37 % | 78 % |
| Daft Punk — Around the World | 32 % | 97 % |

**The vacuum drop detector almost never applies.** It wants the bass gone for
250 ms and back at 1.45× its average — a synthetic drop. Real breakdowns last
6–30 s, the bass often keeps running, and the slow bass average adapts inside
the gap. Across the seven tracks it fired twice (both on Infected Mushroom,
both within 1.4 s of the envelope reference — precise, just rarely
responsible). A plain envelope-jump reference computed on the WAV itself
(RMS in 250 ms hops, a step of ≥ 6 dB after a quieter stretch) finds the
returns the ear hears: 222, 289, 302 s on DMT, 36, 162, 289 s on
Thunderstruck. The build-up flanks the analyzer reported sat *after* those
returns as often as before them — the groove coming back reads as a build-up
too — so the arc regie was bending arcs for drops that had already happened.

Hence a second drop path in the analyzer, which is that reference in engine
form: the level mix sits ≥ 0.10 under its 8-second mean for ≥ 6 s, then comes
back to within 0.05 of where it was; that return counts as a drop, anchors
the phrase clock, and silences the build-up flank for 15 s.

**Measured, before and after**, on the same seven tracks against the envelope
reference (a hit is a detection within 3 s of a reference jump):

| | detected | hits | false alarms |
|---|---|---|---|
| vacuum path only | 2 | 2 | 0 |
| plus the return path | **9** | **8** | 1 |

Prodigy — Breathe: both returns (109 s, 270 s), and the second one landed at
phrase position 0.95 on a grid anchored by the first — the prediction was
within two beats on a real track. Infected Mushroom: three of three detected.
Daft Punk and DMT: one each. The misses are honest: AC/DC and Alanis
Morissette have transitions shorter than six seconds or flatter than 0.10,
and five of DMT's six reference jumps are the *entries* of a track that
builds in layers rather than breaking down. The reference itself is generous;
the detector is deliberately not. What the arc regie needs is not every
section change but a drop it can trust — and eight of nine is that.

**Recorded** overnight (8 chunks × 3 seeds, 2383 windows, 616 scenes): the
catalogue's median structure is 0.123 on the musical WAV; the per-scene
spread max/min has a median of 1.28 and a 90 % quantile of 2.36, exceeds 3×
for 30 scenes and 10× for 8. A first reading blamed the new WAV's quiet half
for the low minima of several space scenes; the window data refuted it — the
loud/quiet luma ratio sits at a median of 1.2, and what varies is *whole
windows* by seed (`GasGiantCloudCity` luma_max 0.168 / 0.074 / 0.033 across
its three draws). That is parameter spread, which is what the distribution is
for, and what `Tools/param_corners.py` is for.

### Corners: where a range is too wide

`Tools/param_corners.py --from-baseline --worst 30` took the thirty scenes with
the widest recorded spread and rendered each at the three corners of its
parameter space — every float at its minimum, every one at its maximum,
alternating — against a three-seed median. **Thirteen** have a corner under
the empty threshold while the median is healthy: the shader is fine, one end
of a range is not. The lower corner is the usual culprit (`glowP` 0.5, `fogP`
1.5 and the like), and `GasGiantAtmosphere` reaches exactly 0.0000 at its
upper one. A corner says *that* a range is too wide, not *which* parameter;
`KALEIDO_PARAM_CORNER=min:glowP` therefore takes a name list — the named
uniforms go to the corner, every other one to the middle of its range — and
`--per-param` runs one lower and one upper test per parameter name.

**Per parameter**, on those thirteen scenes (51 runs: one with every
parameter mid-range, then one lower and one upper run per parameter name,
`hueP` skipped because a hue angle empties nothing): fourteen (scene,
parameter, end) pairs fall under the empty threshold while the mid run is
healthy. Density-type parameters at their lower end dominate —
`CliffordAttractorSilkRibbons/densityP`, `CrystalAsteroidField/densityP`,
`DarkMatterWeb/webP`, `KardashevTypeIIICity/techP`,
`PrismaticRainbowCloud/densityP` (0.0087 against a mid of 0.113),
`FuturisticCityFlight/buildP` and `glowP` — plus a few upper ends:
`FuturisticCityFlight/fogP`, `DerelictMothership/glowP`,
`SpinGlassFrustrationLattice/kagomePitchP`. `GasGiantAtmosphere` is the one
case no single parameter explains: its empty corner is the *combination* of
`cloudP` and `stormP` at their maxima, and it was left alone.

The fix is arithmetic, not taste: the empty end moves a third of the range
inward (the middle was healthy, the end was not, so the tipping point lies
between — a third removes the corner without halving the variety). Fourteen
ranges in `Komplett.xml`, the presets regenerated from it. Every range lives
in the master file and nowhere else, which is what made this a one-line
change per finding.

**Verified** with the plain corner test on the ten scenes touched: eight have
no empty corner left (FuturisticCityFlight's lower corner 0.0029 → 0.0432,
PrismaticRainbowCloud's 0.0117 → 0.1099, DarkMatterWeb's 0.0097 → 0.1117).
Two needed a second, smaller step because their empty corner was a
*combination*: `SpinGlassFrustrationLattice` (pointSizeP and pointGainP low
together, 0.0075 → 0.0223 after the first step) and `GasGiantAtmosphere`
(cloudP and stormP high together, 0.0000 → 0.0303). `DerelictMothership`
stays on the sparse list — its middle is 0.028, so no corner can be blamed.
After the second step both are out of the corner list on the axes that were
adjusted (SpinGlass lower corner 0.0648, GasGiantAtmosphere upper 0.0687);
GasGiantAtmosphere's *lower* corner then read 0.0306 on parameters that had
not changed and had measured 0.0551 the run before — the same draw, twice,
1.8× apart. That is the measurement's own noise floor on a dim scene, not a
range, and it was left alone.

## Ten new scenes, built on the parts that lay idle

The catalogue's building blocks were used unevenly: the melody ring by two
scenes, the previous-frame feedback by one, the self-similarity matrix by
one, the spectrogram ring by one, the Physarum trail map by none. The first
block of new scenes takes each of those as its subject, so that every scene
also tests whether the block holds in real use.

| scene | block | what it shows |
|---|---|---|
| DepthPortalRecursion | `texPrevFrame` | a Droste portal: the last frame inside the portal, which contains the portal … — a real recursion, one frame per level, so a beat flash sinks inward level by level |
| SpectrogramTunnel | `texSpectro` | the tunnel is the spectrogram: bands around the wall, history down the tube; you fly through the last eight seconds |
| SelfSimilarityCorridor | `texSSM` | a corridor tiled with the song's self-similarity; a returning chorus lays bands across the floor |
| StereoKaleidoscope | `audioStereoL/R` | left and right halves folded from their own channel; the seam widens with the stereo width |
| MelodyConstellation | `audioMelody[96]` | the last ~8 s of melody as stars on a spiral, joined into a constellation |
| PhraseClockRosette | `audioPhrasePos/Left` | a 32-petal rosette that fills with the phrase and blooms on the drop |
| PhysarumGalaxy | `texPhysarum` | the slime mould's trails on a turning globe, lit as star streams |
| ReactionDiffusionKaleidoscope | `texSim` | the Gray-Scott field through an n-way mirror |
| DropCountdownVortex | `audioPhraseLeft` | a vortex whose rings slide to the throat as the drop nears |
| StarlingMurmuration | `geom="indirect"` | 12–24k birds as one body, folded by a curl field; frightened by onsets |

Three conventions had to be learned by rendering, and are worth writing down:

- **The SSM ring runs backwards in texture space.** `h = 0` is the oldest
  stored moment, `h = 1` is now, and a sample is `texture(texSSM, h +
  ssmHead)`. An *age* `a` therefore lands at `ssmHead − a`; adding the age
  samples rows not written yet and the corridor came out empty. Its floor was
  black for another reason: the diagonal of the matrix — a moment compared
  with itself — is not a bright line here, so the floor now shows the matrix
  a fixed lag off the diagonal, where the section bands live.
- **An indirect scene has no background.** Mesh scenes carry a sky shell;
  an `indirect` generator draws only what it emits, over the clear colour.
  StarlingMurmuration's first thread emits one huge quad behind the flock, marked by
  a negative density, and the fragment stage paints the dusk on it.
- **Feedback must converge.** The portal decays the previous frame and
  soft-knees its luminance before re-injecting it; without that the rim glow
  piles up level after level into white.

The Physarum globe shows large blobs in the first ten seconds of a scene:
the trail map is created when a scene first samples it and the agents need a
solo span to grow their networks. That is the simulation's nature, not a
defect, and it was left alone.
## Ten more, and two host defects they exposed

The second block of the fifty (03.09.). The rule of the day was continuity
(V7c): no fold count, ring phase or direction may change as a step. Every
scene below moves on `sceneAdvance` or `sceneTime`, uses envelopes only as
rates and amplitudes, and rolls its discrete numbers once per activation.

| Scene | Building block | What it does |
|---|---|---|
| MoebiusTunnel | -- | ribbons with an odd number of half-twists per loop; front face photo, back face its palette-negative, the twist swaps them |
| PhyllotaxisZoom | `audioChroma[12]`, `audioMelodyPitch` | a log-spiral phyllotaxis: self-similar under "one seed inward", so the zoom is periodic and seamless in both directions; seeds glow by pitch class |
| HyperbolicKaleidoscope | -- | reflections across a {p,q} polygon in the Poincare disc; a translation by one polygon step is a tiling symmetry, so the endless drive to the rim wraps invisibly (p in {4,6,8}, where the perpendicular spoke is a mirror) |
| ChromaKaleidoscope | `audioChroma[12]` | twelve wedges = twelve pitch classes, brightness normalised by the loudest; fifths order optional |
| BinauralTunnel | `audioStereoL/R`, `audioStereo` | the cross-section is the stereo image: each wall pushed by its channel, width stretches the vault |
| FluidInkMandala | `texFluid` | the Navier-Stokes dye in counter-rotating mirrored rings; onsets as ripples on a travelling phase |
| SectionMemoryHalls | `audioSectionId/Prev/Age/Known` (new) | a hall per section, returning sections return to their hall; the change is a door 14 units ahead reached after ~8 s, never a cut |
| WaveformRiver | `audioWave[64]`, `audioMelodyPitch` | height-field river valley; the waveform is the water's light (three samples averaged: strobe 15 -> 5), the melody widens the river, the bass floods |
| DysonSwarmConstruction | `indirect`, `sceneProgress` | 24k panels fly from a shipyard cloud to a Fibonacci sphere along the arc; the drop regie can time the closing |
| GalaxyMergerNBody | `indirect`, `stateBytes`, `genPasses=2` | 32k stars integrated live (restricted three-body: two softened cores on an analytic in-spiral); tidal bridges and tails grow by themselves |

**Section uniforms.** The analyser's section memory was never reachable from
a shader. `applyAudioFeatures` now uploads `audioSectionId`, `audioSectionPrev`,
`audioSectionAge` (seconds since the change, from a steady clock), `audioSectionKnown`
and `audioSectionCount`. The first sight after an activation starts with a
large age, so no door opens on scene start; the age is what lets a scene
*approach* a change instead of cutting on it.

**The generator's own uniform list.** Compute generators get their uniforms
from `Scene3DShader::runGenerator()`'s `GenLocCache`, not from
`applyAudioFeatures`. `sceneAdvance`, `sceneTime` and `sceneProgress` were
not in that list: a `.comp` declaring them compiled fine and read 0 forever.
StarlingMurmuration (block 1) never moved its flow field, and the Dyson swarm
never left its shipyard until the three were added. Rule V5c in the
authoring guide; `usesProgress()` looks at the vertex/fragment program only,
so a staged indirect scene declares `sceneProgress` in its `.vert` as well.

**Stateful generator, the safe way.** GalaxyMergerNBody keeps 1 MB of star
state. Init is self-healing on a magic word derived from `sceneSeed`; pass 0
seeds or integrates and emits, pass 1 (one thread) stamps the magic and the
clocks -- so every thread of a frame agrees on whether it was an init frame,
which a single-pass "thread 0 writes the magic" cannot promise. The step is
`dt = wall * (0.5 + 1.3 level) + d(sceneAdvance) * 0.9`, clamped, so the merge
runs on the music and cannot explode on a hitch.

**No shaking, ever.** Rene has gaming sickness: any movement of the whole
frame that is not the scene's own steady travel -- a kick that pushes the
picture, a beat that pumps the zoom, a bar-phase camera sway, a wall radius
riding a per-frame energy -- makes him ill within minutes. Rule V7d: the
frame (camera, global zoom, global rotation, tunnel radius, horizon, water
level, fold centre) moves only on `sceneAdvance`, `sceneTime`, `sceneProgress`
or seconds-scale envelopes (`audioSwell`, `audioBuildUp`); `audioKick`,
`audioBeat`, `audioOnset`, `audioBass`, `audioLevel`, `audioStereo*`,
`audioDrop`, `audioMelodyPitch`, `audioBarPhase`, `audioBeatPhase` are light
and colour only, or move single objects inside the scene. The audit of the
twenty new scenes found six bar-phase sways, five beat/bass/kick zoom pumps,
a wall radius on stereo energy, a water level on bass, a portal wandering on
the bar and tilting with the melody, a rosette scaling on the drop, a flock
bobbing on the centroid -- and one outright jump: MelodyConstellation turned
by `audioBarPhase * 0.4` and snapped back at every bar wrap. All removed; the
reactivity moved into light. The grep in V7d runs before every scene commit.

Measured with the screening tool (10 s, structure WAV): sd 0.04-0.17, motion
0.01-0.11, no strobe above 5; all ten compile on GL 4.6.

## The host was shaking too: calmMotion

While auditing the new scenes for jolts, the engine turned out to have a
*virtual camera* of its own, applied to every scene in the present pass
(`AudioConditioner`, "Regie layer"): a ~1.6 % punch-in zoom on every
downbeat, a kick shake (two sinusoids at 40 and 31 Hz scaled by the kick
envelope), a per-bar roll, a 24-fps "gate-weave" micro-jitter, a slow
drift, a build-up tightening; on drops a rewind race (the picture jumps
1.6 s back and catches up with a hard cut), a DJ-stop scrub, and a bass
shockwave that pushes a displacement ring through the picture on every
strong kick. The trail layer pumped its echo zoom on the beat and rippled
with it. For a viewer with gaming sickness that is the whole problem,
whatever the scenes do.

`calmMotion` (settings key, **default true**) switches all of it off: the
virtual camera stands still (zoom 1, no offset, no roll), no rewind, no
scrub, no shockwave, letterbox bars only creep, the echo zoom keeps its
steady drift without the beat term and without ripple. `calmMotion=false`
in the ini restores the old look. The dev hook `KALEIDO_CALM` is
unchanged. Rule V7d in the authoring guide now covers the host too.

## Block three: space, zooms and a fan

| Scene | Building block | What it does |
|---|---|---|
| AccretionDiskRelativistic | -- | rays marched with a 1/r^2 pull: the disc bends over and under the shadow; Doppler beaming brightens the approaching side; Keplerian rotation on the scene clock |
| PulsarLighthouse | `audioBeatPhase`, `audioKick/Snare/Hat` | three beam cones rotate with the beat phase (angle = 2 pi phase, continuous) and sweep a plain; each cone only as bright as its instrument |
| OortCloudDrift | -- | endless fall to the Sun: bodies in log-polar cells, periodic in log-radius, so the wrap is a symmetry; onsets ignite comet tails (light) |
| ProtoplanetaryDiscRings | `audioSpectrum[32]` | 32 rings = 32 bands, bass inside, treble at the rim; planets carve gaps and orbit on the scene clock |
| KleinBottleFlythrough | -- | ray-marched bottle (a torus body and a torus neck in smooth union); the camera loop runs down the neck through the wall into the belly: inside and outside trade places without a cut |
| GravityLensingZoom | -- | photo on a tunnel (angle, log radius) with the log-radius period equal to the zoom period; point-mass lenses per period bend it into Einstein rings |
| SpectrogramKaleidoscope | `texSpectro` | the mirrored motif is the last twenty seconds of the music: centre now, rim 20 s ago |
| HyperbolicEscherFish | -- | Circle Limit with swimming fish: the same seamless hyperbolic translation as the kaleidoscope, fish drawn from fundamental-domain coordinates, tails wag on the scene clock |
| PersistenceOfVisionFan | `texPrevFrame` | spokes paint the photo into the afterimage; the picture exists only in the persistence |
| OrbitalDebrisField | `indirect` | 20k plates on orbits around a station, camera parked in the stream; collisions are onset flashes |

Three things only the render showed. A generator variable named `half`
killed the whole compute stage silently (`half` is reserved in GLSL). A
persistence loop must not multiply the previous frame by anything but its
decay: a global brightness factor and a tone map inside the loop cut the
afterimage to a few frames -- the fan now keeps `prev` linear and tone-maps
only above 1. And a scale-invariant lens chain needs small masses: with an
Einstein radius comparable to the lens spacing the whole picture collapses
into one deflection and reads as flat grey.

## Block four: the Sun, a terminator, a crust, and two models

| Scene | Building block | What it does |
|---|---|---|
| SolarProminenceLoops | -- | magnetic loops arch over a boiling photosphere; plasma streams along them on the scene clock, the swell raises them, the drop lights the main loop end to end |
| TidalLockTerminator | `dayPhase`, `audioValence` | a flight along the day/night line of a locked planet; the world turns under a still camera, the host day clock drifts the line, valence is the day-side weather, auroras on the night side breathe with the swell |
| NeutronStarSurfaceSprint | `audioSharpness` | a Voronoi crust of iron plates split by glowing cracks; a starquake is a flash through the crack network, the ground never heaves |
| HarmonicChangeLightning | `audioHarmChange`, `audioChroma[12]` | a still night; a harmony change strikes a bolt whose twelve limbs have the lengths of the twelve pitch classes |
| BuildUpPressureChamber | `audioBuildUp`, `audioDrop` | a corridor whose walls close in with the build-up (seconds-slow) and whose far end floods with light on the drop |
| TempoGearwork | `audioBarPhase` | a gear train at one, two and four turns per bar: the bar phase is the angle, a whole number of turns wraps exactly; idles on the scene clock while the tempo is unknown |
| ZCRNoiseStorm | `audioZCR`, `audioFlatness` | a sandstorm tunnel whose grain density and contrast are the noisiness of the sound |
| MeshKaleidoscope | `geom="mesh"`, `instances="12"` | a loaded model drawn twelve times about the view axis, every second copy mirrored: the image set of a two-mirror kaleidoscope, as a wreath |
| AnglerfishAbyss | `geom="mesh"` | the Anglerfish model in black water, lit by its lure alone; the lamp tints with the melody and flares on the drop -- no camera jerk |
| FadeOutDissolution | `indirect`, `audioFadeOut` | the photo as a curtain of 48k particles that lets go as the track fades out; a slow dissolve wave keeps a corner alive between fade-outs |

Forty of the fifty proposals are built. The remaining ten need building
blocks the host does not have yet (a 3D smoke field, scene depth for a
mirror room, tessellation patches, OIT glass) or were dropped by the rules
(the strobe-shutter zoom freezes the frame; moire fringes flicker).

One more reserved word: `flat`, like `half`, cannot name a variable; the
fragment stage at least says so (`C7537`), a compute generator dies
silently. Rule V6d lists the reserved words with a grep.

## Block five: the last ten, without new host features

The proposals that seemed to need a building block the host lacks turned
out to need a different construction instead.

| Scene | Instead of | What it does |
|---|---|---|
| InfinityMirrorRoom | a depth buffer | space folded by `mod` + mirror: a ray leaving the room re-enters a reflected copy, so the regress has real depth; lamps and a framed picture repeat to infinity; fog on the sub-bass |
| VoronoiMirrorShatter | a geometry-shader shatter on the drop | shards drift apart and mend over the arc (`sceneProgress`, bent onto the drop by the regie) -- a slow breakage, never a cut |
| SelfSimilarityMandala | (replaces the strobe-shutter zoom) | `texSSM`: the row "now against the past" as rings, the matrix's bands as petals; a returning section warms the mandala |
| MelodyKaleidoscope | (replaces the moire) | the melody ring as a mirrored contour, age outward, pitch across the wedge |
| InterstellarMediumDust | a 3D smoke simulation | ray-marched fbm density with a curl-like domain warp on the scene clock; stars behind dim by the integrated column |
| SmokeSigils | the same | a smoke slab masked by a lattice of procedural glyphs on its middle plane; the melody lifts a column (smooth kernel) |
| FleetJump | -- | `instances="24"` of one GSV; the wedge holds, the drives spool along the arc, then rank by rank each hull stretches and streaks away on a continuous ramp |
| ShipShadowPlay | a shadow map | `instances="3"`: the ship and two PLANAR PROJECTIONS of the same mesh onto the wall, one per lamp -- two coloured shadows that overlap to dark; the lamps glide on the scene clock |
| TessellatedOcean | -- | `geom="patches"` after Ocean's contract; fineness from a quarter treble and three quarters swell with fractional spacing, so the mesh never pops; a night sea with phosphorescent crests |
| GlassNaveFlight | -- | indirect + weighted-blended OIT after CathedralGlass/GlassStack: stone pillars in the opaque pass, glass panes and a clerestory in the transparent pass, each pane a spectrum band, the sun on `dayPhase`; bays emitted relative to the camera with the pattern phased on the flight distance |

The fifty proposed scenes are all built (48 as proposed, two replacements).
Note for staged mesh scenes: a preview of 10 s reaches `sceneProgress`
0.7 at best (activation and cross-fade eat the start), so a cue at 0.72
never shows in a probe -- FleetJump's jump starts at 0.5.

## The catalogue pass, done statically

The question was whether the old catalogue could be checked for the same
jolts without another overnight render. It could: the offending shapes are
in the source. `Tools/shake_scan.py` reads every shader and the rig
formulas and reports five patterns -- a frame coordinate (p, uv, camera,
zoom, radius, angle) written with a fast envelope, an explicit
shake/jitter/punch term, a vertex-stage hull position on kick/beat/bass,
`floor`/`step` on audio, and a whole lit grid cell (`step(k, hash(floor(p)))`).
Over 1014 files it flagged 133; reading them left 58 real ones (the rest
were light terms, point sizes and static lattice jitter that happen to use
the same words). Seconds of scan, an hour of reading and editing, ten
minutes of targeted renders.

What changed, by kind: eight FOV punches on the kick (a constant focal
length now); a dozen whole-frame zooms on beat, kick or sub-bass (on the
swell now, at a third of the amplitude); camera distance, roll, pitch and
sway that rode level, flux, drop and sub-bass; three explicit shakes
(PulsarJet's random kick jitter, AtmosphericEntry's 31-43 Hz judder,
FortressStation's 37 Hz hull tremor); tunnel radii and object lattices that
pumped or leapt outward on every kick; rotation angles and an attractor
parameter on the spectral centroid (per-frame noise); Fleet's formation
blowing apart on the drop; and two grid-cell light fields turned into round
lights. A rescan of the 58 files reports nothing; all of them still render.

The scanner is now the pre-commit check for V7d and V8e; its false
positives are the price of catching the true ones, and it prints the line
so the reading is quick.

## The second fifty, block A: space

A second list of fifty (`docs/proposals-2026-09-03-second-fifty.md`), proposed
against the full 666-scene catalogue and under the standing rules. Block A:

| Scene | Building block | What it does |
|---|---|---|
| DarkNebulaBokGlobules | -- | dust cocoons ray-marched before the photo as an emission nebula; stars dim by column density; onsets ignite protostars inside (light) |
| VacuumDecayBubble | `audioBuildUp` | a bubble of true vacuum rewrites the sky inside it (inverted, refracted, dispersed); radius on the build-up, the wall flashes on the drop |
| PlanetaryNebulaShells | `audioSpectrum[32]` | shells at radii doubling outward, each a band; the inward flight is log-periodic in ln 2, so it never wraps visibly |
| SolarEclipseTotality | `audioSpectrum[32]`, `dayPhase` | 32 corona streamers = 32 bands; the moon drifts a tenth of a radius on sin(dayPhase), so totality is the rule |
| IoVolcanicPlumes | `audioOnset` | Jupiter's bands turn on the scene clock; umbrella plumes flow on a phase, onsets are their brightness |
| MicrolensingCausticSweep | `audioSwell` | a two-mass lens map with magnification 1/det J; caustic folds sweep a star field |
| CosmicMicrowaveBackgroundSky | `audioSpectrum[32]` | eight angular noise scales weighted by band groups: the music's spectrum as the CMB power spectrum |
| OrbitalSunrise | `dayPhase`, `audioValence` | sunrise from orbit on the sine of the day clock (rises and sets, never wraps); round city lights fade with dawn |
| TidalDisruptionEvent | `indirect`, `stateBytes`, `sceneProgress` | a star on a fly-by, self-gravity as a spring released along the arc, the hole's tides do the rest |
| WhiteHoleFountain | `indirect` | photo tiles born at a horizon fly outward on continuous life phases |

**Stale state buffers.** GPU memory is recycled between runs and activations,
so a fresh state buffer can already carry the right magic word and a stale
(or garbage) star: TidalDisruptionEvent showed no star until particles that
fell into the hole were reborn in the right place. Three guards now, also
in GalaxyMergerNBody: re-seed in the first frames of every activation
(`sceneTime < 0.06`); pass 1 stamps the magic only after pass 0 has seeded
(a flag in the header), so pass order cannot validate garbage; and every
particle is reborn on a zero slot, a NaN, or when swallowed.

## The second fifty, block B: endless zooms and tunnels

Ten 2D scenes (03.09.2026), all `type="normal"` with `<rig preset="flat"/>`,
no new host features.  Every one is a steady flight or zoom on the scene
clock; the fast envelopes touch only light and colour.

| Scene | Idea | Note |
|---|---|---|
| MatryoshkaPhotoDoll | the photo nested in itself at the brightest spot | `brightSpot()` is a soft-argmax over a 4x4 mip grid, so the nesting point drifts, never jumps; the zoom is log-periodic in `L = -log(ratio)` |
| BookPagesTunnel | the tunnel walls are a book's leaves hinged on the spine | two hits per ray (nearest, and nearest still >= 0.7 ahead): a leaf that has come close fades over the one behind, so no dim close-up and no pop; rotation on `sceneAdvance`, not `audioBarPhase` (a tracker resync would jolt every leaf) |
| SpiralStairwellDescent | a stairwell seen from above, steps carrying photo tiles | descent on the scene clock, the well breathes on `audioSwell` |
| CapillaryFlight | a flight through a branching vessel with blood cells | cells are round discs (V8e), never grid cells |
| TemporalZoomSSM | the self-similarity matrix nested in itself, scale /4 | `L = ln 4`; each level samples `texSSM` at its own age window |
| PowersOfTenZoom | ring-of-bodies inside ring-of-bodies, scale x10 | `L = ln 10`; bodies sized to their level so every level reads (first draft was too small and dark) |
| KarmanVortexStreet | the photo advected through a vortex street | Lamb-Oseen vortices, advection integrated along `sceneAdvance` |
| PapercutShadowBox | layered paper cut-outs lit from behind | layers move at parallax rates on the scene clock |
| LighthouseFresnelLens | the world outside seen through a turning Fresnel lens | dispersion capped (0.008..0.026); above that the treble turned the frame into RGB noise |
| GlacierCrevasseDescent | descent between blue ice walls | glints are round (V8e); the sub-bass is light welling from the depth |

Two lessons from the previews: a scene whose camera looks along a corridor
must handle the moment when the nearest object fills the frame (BookPages
fades it), and a self-similar zoom needs its smallest level to be visibly
large -- the Powers-of-Ten draft rendered a system of dots too small to
read at 1080p.

## The second fifty, block C: kaleidoscopes and psychedelia

Ten 2D scenes (03.09.2026), all `type="normal"`, `<rig preset="flat"/>`,
camera still in every one; the music shapes light, colour and the slow
parameters, never the frame.

| Scene | Idea | Note |
|---|---|---|
| ZoetropeDrum | a zoetrope seen from outside: motion only through the slits | the drum turns on the scene clock; the frame phase seen through each slit advances with the turn |
| RotoreliefIllusion | Duchamp's eccentric discs, one per chroma class | ring membership by distance to a per-ring centre that rotates -> the bulge illusion; the sounding class lights its disc |
| TieDyeFold | the photo pleated radially, dye soaking in | diffusion width on `audioSwell`, front brightness on the kick |
| KirlianAura | corona discharge along the photo's Sobel edges | filaments march back along the gradient; reach and brightness on `audioHigh`, flicker on a continuous noise clock |
| LenticularFlip | tex0/tex1 interlaced under lenticules | the viewing angle sweeps on the swell and drifts on the clock, with a wave across the sheet; rainbow fringe at the flip |
| GuillocheEngraving | the banknote rosette drawn by the chroma vector | r(theta) = sum of cosines with chroma amplitudes; the chroma is smooth, so the shape is |
| KluverFormConstants | tunnel / spiral / lattice / cobweb morphing | log-polar phase fields; `audioArousal` picks the family through positive, normalised weights |
| BubbleChamberTracks | spiralling tracks of round bubbles | tracks are born on a continuous clock (onsets only brighten); curvature fixed per instance at birth |
| Teleidoscope | the three-mirror tube: p3m1 folding of the photo | mirror spacing on the swell (slow), object cell turns on the clock, barrel lens |
| StringArtChords | twelve pins in fifths, strings between sounding classes | string presence = product of the two chroma values (continuous fade) |

Three lessons from the previews: a scene that takes its colours only from
the photo palette goes grey on a grey photo (TieDyeFold now mixes a hue
wheel into the dye); a scene whose base brightness is the photo needs a
floor so a dark photo does not give a black frame (Teleidoscope,
StringArtChords, RotoreliefIllusion); and a corona driven by the raw treble
strobes -- KirlianAura keeps most of its brightness constant and lets the
treble add only a part.

## The second fifty, block D: music data as geometry

Ten 2D scenes (03.09.2026), `type="normal"`, `<rig preset="flat"/>`.  Each
takes one analysis feature and makes it the subject of a picture.  Every
beat- or bar-phase idea in the proposal list was replaced by the steady
scene clock (rule V7d: a tracker resync would jolt the whole frame); the
tracker events stay as light.

| Scene | Feature | Note |
|---|---|---|
| PipeOrganChroma | `audioChroma[12]`, `audioSpectrum[32]` | pipes per class and octave, heights from the harmonic series; nothing moves but light |
| PendulumWaveTempo | scene clock | pendulum periods as divisions (8+i swings per cycle); `audioBeat` only lights the bob at centre |
| BuildUpAvalanche | `audioBuildUp`, `audioDrop` | snow load grows with the build-up; the drop (the one allowed cut) releases the slab -- objects move, the camera does not |
| MoodWeatherValley | `audioArousal`, `audioValence` | wind and lean from arousal, sun vs rain from valence; both slow; lightning on the kick is diffuse |
| RustBloomRoughness | `audioRoughness`, `audioHarmChange` | rust blooms from seeds with the roughness; a harmony change is a polish sweep running on the clock |
| BellTowerDownbeat | `audioDownbeat` | bells swing on the clock at size-given periods; the downbeat is the strike (flash + ring wave down the tower) |
| KeyChangeSeasons | `audioChromaHue`, `audioMode` | the tonal centre is the season (four blends), major/minor the weather; seasonal round particles |
| StereoSearchlights | `audioStereo`, `audioStereoL/R` | balance biases a slow sweep (never steers directly), channel levels light the two banks |
| SpectrumStalactiteCave | `audioSpectrum[32]`, `audioOnset` | one stalactite per band; drips fall on the clock, band energy and onsets are their light |
| PhraseTideBeach | `audioPhrasePos`, `audioDrop` | tide = sin of the phrase position (continuous at the wrap); the drop is the breaking wave |

The shake scanner flags the city windows in StereoSearchlights as PIXEL:
they are rectangular windows in towers, not particles, and stay.

Preview lesson: StereoSearchlights drew bright windows and invisible
beams -- the beams needed three times the width, a slower falloff and the
windows halved before the searchlights read as the subject.

## The second fifty, block E: models, indirect, OIT, tessellation

Ten 3D scenes (03.09.2026) on the existing pipelines; no host changes.

| Scene | Pipeline | Note |
|---|---|---|
| GlassVesselsOIT | `indirect` + OIT | twelve lathe surfaces (profile turned about y), one per chroma class; glass in the OIT pass refracts the wall photo along the refracted ray |
| SoapFilmMembrane | `patches` | standing modes of a rectangle; thickness drains over the arc; thin-film reflectance per channel from the optical path difference |
| KiteFestival | `indirect` | 700 kites: string, diamond (two triangles), five ribbon segments; wind strength = swell, gusts = sines on the clock |
| BaitBallVortex | `indirect` | 5000 fish on ring orbits; the predator on a figure-of-eight; avoidance is a smooth push by distance (no fright jumps; onsets flash silver in the fragment) |
| DandelionClock | `indirect` | 800 seeds; each lets go when the swell crosses its threshold, crossfaded over a band of swell so nothing pops; flight on a continuous phase |
| ExplodedViewDiagram | `mesh` | explosion along a low-frequency noise field of position (neighbouring vertices move together, no tearing) on `sceneProgress`; blueprint shading |
| VoxelizedModel | `mesh` | the voxel look lives in colour and lighting only (cell colour, axis-snapped normal, seams); positions never quantised |
| SmokeRingChorus | `indirect` + OIT | tori of quads born on continuous phases per mouth; alpha from the tube silhouette, thinning with life |
| MeshSandSculpture | `mesh` | erosion along the normal = roughness x arc allowance x windward noise; rebuilt as the allowance closes |
| TessellatedLavaLake | `patches` | Voronoi plates with drifting centres ride a plateau over the melt; seam distance drives the glow in the fragment |

Conventions used here that are worth keeping: a compute generator sees only
the GenLocCache uniforms (time, sceneSeed, audioAdvance/Level/Beat/Kick/
SubBass/High/Bass/Mid/Chroma/Spectrum/Phase/Swell, the three scene clocks,
maxVertices, frameIndex, genPass) -- anything else stays 0, so arousal,
onset, roughness and the like belong in the fragment stage; a generator
that needs per-vertex normals packs normal.xy into the uv slots and the z
sign into `kind` (SmokeRingChorus, GlassVesselsOIT rebuild it in the
vertex stage); OIT scenes collapse the half that does not belong to the
current pass behind the near plane in the vertex stage (CathedralGlass
pattern).

Preview lessons: an opaque pass that draws dim pixels over a bright
background reads as dark blobs (DandelionClock's pappus discards
everything but the bristles now); a lathe placed too close fills the frame
(GlassVesselsOIT sits at z 8.5..10.5 at a third of its first size); a
patches surface has no sky, so TessellatedLavaLake raises the far end into
a crater wall; MeshSandSculpture uses wrap lighting, which is robust
against the model's normal orientation.

## The third fifty, block A: space, from current research

Ten scenes (03.09.2026), chosen against the 827 already in the catalogue.

| Scene | Pipeline | Note |
|---|---|---|
| FastRadioBurstDispersion | 2D, `texSpectro` | the sky is the dynamic spectrum (frequency up, time across); bursts are curves x(band) = now - (age + DM/f^2) launched on the clock |
| TransitLightCurveStars | 2D | transits are brightness events only; three light curves scroll for hosts picked by the tonal centre |
| BaryonAcousticRipples | 2D | galaxies as round dots whose presence follows web + shells; the pattern expands with `sceneProgress` |
| ThreeBodyFigureEight | 2D | lemniscate of Gerono as the choreography; trails by marching back along the curve |
| EuropaChaosTerrain | `patches` | Voronoi rafts as tilted plateaus (tilt fixed per raft); the far end rises into ridged plains; ocean light through the seams on the sub-bass |
| TitanMethaneRain | 2D | orange haze, Saturn behind it, rain rings on the lake from hashed spots on the clock |
| RingSpokesAndWakes | 2D | 32 ringlets from the spectrum; Kepler differential rotation; moon wakes as trailing sinusoids; spokes corotate and flash on the kick |
| SpriteElvesUpperLightning | 2D | sprite columns are fixed fbm shapes whose brightness is the kick times a per-column response; elves are rings expanding on the clock |
| AsteroidRubblePileTumble | `indirect` | 9000 boulder tiles on a spinning-top body; the sunward term is computed in the generator and stored in the lit slot; touchdown dust on continuous phases, lit by the kick |
| CoronagraphSpeckleField | 2D | speckles live in a rotating frame, planets in the fixed one (angular differential imaging) |

Preview lessons: three dark-space scenes needed their light doubled
(BaryonAcousticRipples, RingSpokesAndWakes, CoronagraphSpeckleField) --
a sparse field of dots on black reads as nothing at contact-sheet size;
EuropaChaosTerrain drove both the seam width and the seam light from the
sub-bass and strobed (12.9) until the width was fixed and the light given
a floor; the regolith glints were whole grid cells and are round now.

## The third fifty, block B: physics and matter

| Scene | Pipeline | Note |
|---|---|---|
| DoubleSlitElectronBuildup | 2D | each hashed cell has an arrival threshold; a dot is present once probability x arc exceeds it (smoothstep, so arrivals fade in); fringe spacing from the slewed tonal centre |
| OpalStructuralColour | 2D | Voronoi domains; Bragg parameter from domain orientation + a slow viewing-angle sweep; the band matching the colour lights the domain |
| TimeCrystalLattice | 2D | drive at w, response at w/2 as a smooth square wave with a phase gradient across the lattice |
| CavitationCloudPropeller | `indirect` | bubbles born at blade tips on continuous phases, carried along a helical wake, grow then collapse (collapse = kick light) |
| SaffmanTaylorFingers | 2D | interface radius as a Fourier series in angle; higher modes switch on later in the arc (tip splitting) |
| TimeReflectionPond | 2D | effective wave time = clock - 2.2 sin(pi drop): the waves slow, run back and resume, continuous |
| AnechoicChamberWedges | `patches` | pyramids from min(tri(u), tri(v)); normals from the face gradient; tips lit by the column's band |
| LeidenfrostDroplets | 2D | drops on sums of incommensurate sines, shrinking over a life phase, drawn as lenses over the plate |
| OpticalLatticeAtoms | `indirect` | one atom per filled site oscillating toward a neighbour as 0.5(1 - cos), amplitude shrinking with the swell (lattice depth) |
| TensegrityFloat | `indirect` | expanded-octahedron strut ends; each end tied to its four nearest foreign ends by rank selection in the generator |

Preview lessons: the electron dots were one to two pixels at 60-120 cells
across and read as black -- particles need at least four pixels at 1080p;
TimeCrystalLattice strobed (17.3) with a 1 Hz drive flash on every disc
until the clock was halved, the flash quartered and the phase gradient
tripled so the flips travel as a wave instead of blinking together.

## The third fifty, block C: life sciences

| Scene | Pipeline | Note |
|---|---|---|
| ProteinFoldingChain | `indirect` | every residue is a blend by the arc of three closed-form conformations (coil, four helices, packed bundle), so the fold is continuous; hydrophobic flag fixed per residue |
| NeuralConnectomeGlow | `indirect` | somas, dendrites and axons as fibre quads; spikes are drawn in the fragment at a phase along the fibre (uv.x); band energy is their brightness, never their rate |
| CephalopodChromatophores | 2D | round pigment sacs on two jittered grids expand with their patch band plus a travelling passing-cloud wave |
| BeeWaggleDance | `indirect` | a smooth lemniscate with a high-frequency sideways waggle on the run; followers trail by phase lag |
| RibosomeAssemblyLine | 2D | beads placed by age (codons since added) along a curling path; the tape scrolls with the same clock so bead and codon stay in step |
| PhytoplanktonEddies | 2D | twelve backward advection steps through a Lamb-Oseen eddy field; the bloom lives in the source frame |
| LeafVenationGrowth | 2D | midrib, secondaries and tertiaries as segments whose lengths grow with the arc, each order later than the last |
| SonarPingReveal | 2D | rings on phases; the photo is lit by a wake behind each ring front (exp decay) |
| ForaminiferaSpiralShells | 2D | chambers on a log spiral; the newest inflates with the fractional growth |
| SpiderOrbWebDew | 2D | radii first (arc 0..0.35), then the capture spiral from the hub outward; dew as round drops on the spiral threads |

Preview lessons: the first hex-grid helper in BeeWaggleDance was wrong and
drew a flat gradient -- the mod-based pointy-top trick (two offset
lattices, take the nearer) is the one that works; chromatophores driven
straight by their band strobed (9.2) until the band share of the expansion
was cut to a quarter and the slow cloud wave carried the motion.

## The third fifty, block D: mathematics, computation, AI

| Scene | Pipeline | Note |
|---|---|---|
| EinsteinHatTiling | 2D | the kite lattice ([3.4.6.4] Laves) drawn exactly; kites grouped into hats by a golden-ratio hash (aperiodic-looking, not the true substitution) |
| DiffusionDenoiseReveal | 2D | variance-preserving blend sqrt(1-s^2) image + s noise; s falls with the phrase, ramps back over the last 10 percent, the drop zeroes it; noise seed crossfaded between integer steps |
| AttentionHeadRibbons | 2D | arches between tokens weighted by chroma products; one arch height per head |
| StippleVoronoiRelax | 2D | three jittered layers; a dot exists where local darkness exceeds the layer threshold; small orbits on the clock stand in for Lloyd relaxation |
| LidarSweepPointCloud | `indirect` | 60000 points on room surfaces; age = angle from the sweep, so freshness is continuous; points below 3 percent light are not emitted |
| MuonTomographyPyramid | 2D | tracks from the sky on phases; inside the pyramid a track survives at 35 percent except through the chamber; the chamber photo resolves with the arc |
| BorromeanRingsOrbit | `indirect` + OIT | three golden-rectangle ellipses in perpendicular planes (the Borromean arrangement); normals packed xy + z sign |
| UlamPrimeSpiral | 2D | square-spiral index in closed form; trial division to 320 (numbers stay below 1e5); primes coloured by n mod 12 |
| PersistentHomologyBubbles | 2D | 26 points; edges appear by smoothstep as balls meet, triangles when three pairs touch (Vietoris-Rips) |
| FourierEpicycleDraw | 2D | chain of circles with radii from a geometric fall-off breathed by bands; the trace is 90 segments of the last cycle |

Preview lessons: StippleVoronoiRelax strobed (21.9) because every dark
dot recoloured on the kick -- a quarter of that is enough; the noise seed
of DiffusionDenoiseReveal crossfaded six times a second and read as
flicker at two it does not; PersistentHomologyBubbles flickered where
point orbits carried pairs across the touch threshold, so the orbits are
a third of their first amplitude; the scanner flags a variable named
jitter as a shake, so it is called jit.

## The third fifty, block E: music and sound geometry

| Scene | Pipeline | Note |
|---|---|---|
| ShepardPitchHelix | 2D, `audioMelody` | helix sampled 160 times for the rail; the melody history as beads at helixPoint(pitch); a simple perspective by z |
| SelfSimilarityTerrain | `patches`, `texSSM` | height = similarity squared; both axes read backward from ssmHead; the far end rises to fill the horizon |
| RhythmLoomWeave | 2D | warp threads by band; the cloth scrolls with the same clock the shuttle uses, so rows and passes stay in step |
| CentroidSunArc | 2D, `audioCentroid` | the sun on an arc from the centroid; slopes lit by the sign of the ridge derivative against the sun side |
| MelodyRidgeline | 2D, `audioMelody` | the history interpolated at fractional age; each ridge reads it at an extra delay |
| PhraseSkyscraper | 2D, `audioPhrasePos` | the current tower rises with the phrase; `audioSectionCount` towers stand behind |
| SectionStrataCanyon | 2D, `audioSectionId` | one layer per counted section, the current one growing with `audioSectionAge` over 40 s |
| StereoWidthCanyon | 2D, `audioStereo` | width from the swell (the slow envelope), the balance only leans the slot; channel levels light their wall |
| HarmonicSeriesStrings | 2D | the standing-wave envelope |sin(n pi u)| is drawn, never the vibration |
| BuildUpRocketLaunch | 2D, `audioBuildUp` / `audioDrop` | climb = (1 - drop) while the drop envelope is alive, so the rocket rises smoothly from liftoff |

With this block the third fifty is complete: 150 new scenes since 02.09.2026.

Preview lessons: BuildUpRocketLaunch gated its engines with step(0.02,
drop) and toggled frame by frame on envelope noise (strobe 40.7) -- any
gate on an audio envelope must be a smoothstep with a band; MelodyRidgeline
was flat on a track without a followed melody and now falls back to a
rolling profile on the clock when the melody value is near zero.

## The fourth fifty, block A: earth and weather

Ten scenes (03.09.2026), chosen against the 877 already in the catalogue.

| Scene | Pipeline | Note |
|---|---|---|
| HaboobDustWall | 2D | the front breathes forward and back on a long period instead of passing through; the wall face is fbm lobes, lightning a diffuse fbm flash on the kick |
| PermafrostPolygons | `patches` | Voronoi cells with a rim ridge (Gaussian in the seam distance) and a low centre; troughs flooded; the pond mirrors the photo top |
| SalarMirrorFlats | 2D | the sky photo mirrored below the horizon; a pointy-top hex crust in ground perspective; walkers as round-headed silhouettes with mirrors |
| GlacierCalvingFront | `indirect` | slabs on continuous phases: lean, fall, splash (40 round spray drops each), float away, shrink out; the calving rate is the swell |
| IcebergWaterline | 2D | above/below split at the waterline; the underwater mass is the photo refracted by fbm; bubbles and fish on the clock |
| NoctilucentClouds | 2D | sheets in perspective with gravity-wave bands; lit from below by the sunk sun (brightest low) |
| HurricaneEyeWall | 2D | a ray per pixel against a leaning cone (the eyewall) and the sea plane; the wall texture turns on the clock |
| SundogHaloSky | 2D | 22 degree halo, sun dogs, parhelic circle, upper tangent arc and pillar; the crystal load is the treble |
| FataMorganaMirage | 2D | a triangle-wave fold of the source row above the horizon, blended in by the heat (swell) |
| SeismographDrum | 2D | the drum turns, the trace samples audioWave by the angle since the pen; the frame never moves |

Preview lessons: HurricaneEyeWall lit the whole eyewall with every kick
and strobed (19.8); lightning must be localised (a sector window) and
scaled down; the calving cliff used a cell hash for crevasses and read as
blocks -- a sine fissure field replaced it.

## The fourth fifty, block B: craft and machines

| Scene | Pipeline | Note |
|---|---|---|
| FoundryPour | 2D | a blackbody-ish heat ramp; the melt temperature falls with distance from the impact; sparks on phases, the kick only brightens them |
| GlassblowerGather | 2D | the gather is a shaded ellipsoid; its temperature cycles slowly on the clock and the kick adds a reheat term |
| KilnGlazeCrystals | 2D | radiating needle fans from fixed seeds, each nucleating at its own point in the arc |
| OrreryBrass | `indirect` | table space tilted to world by one rotation; planets on Kepler periods; one invocation draws each orbit ring as 24 quads |
| BlacksmithSparks | 2D | the hammer swings on the clock; the kick is light on the bar and the sparks, never the blow itself |
| CandleForestBreath | 2D | rows in depth; flames sheared by a draught wave on the clock; candle i has band (i + 7 row) mod 32 |
| FerrisWheelNight | `indirect` | cabins hang level under the rim points; spoke i is band i, its lamps light up to the band level |
| HotAirBalloonDawn | `indirect` | envelopes as 16x8 lat-long quads on a teardrop profile; each balloon on a continuous rise-and-relaunch phase |
| RegattaSpinnakers | `indirect` | a 6x6 bellied sheet in the heeled boat frame; boats cross the view on the clock |
| MarbleRunTrack | 2D | the track is a closed parametric curve sampled 120 times; marbles are phases along it and light the rail nearest them |

Lessons from the block: an indirect table scene must put the camera on the normal side of the table plane -- OrreryBrass had the tilt sign wrong, so every planet, arm and moon lay behind the base disc and the depth test hid them while the engraved rings on the base looked plausible (check the sign of dot(normal, cameraFromCentre) before blaming the emitter); craft scenes on a dark shop floor need a floor of 0.4 to 0.5 of the photo plus a constant or they read as black at sheet size; a spark burst on the kick with a weight above 1 strobes (13 on the metric) -- 0.5 is enough.

## The fourth fifty, block C: nature and animals

| Scene | Pipeline | Note |
|---|---|---|
| PeacockTrainFan | 2D | feather index from the angle within a fan whose half-angle is the swell; eyespots at the tips |
| TermiteMoundPlumes | 2D | a refractive fbm field above the spires displaces the scene lookup; strength from the bass |
| MonarchRoostTree | `indirect` | two wing quads per butterfly hinged along the body; roosting wings open with the swell, flyers circle on phases |
| GlowwormCaveThreads | 2D | ceiling cells checked up to three cells above so threads hang into lower cells; the water half mirrors |
| TurtleHatchlingsMoon | `indirect` | each hatchling a phase from nest to sea with a wandering course; shell, two paddling flippers, a track |
| PenguinHuddleRotation | `indirect` | a sunflower (golden-angle) spiral rotating on the clock, the outer ring faster (the shuffle) |
| CherryBlossomFront | 2D | a wavy front line advancing with the arc; trees pink at the front, greening behind |
| BambooGroveWind | 2D | culms bend as bendAmp sin(clock - 1.5 x) times height squared: a wave running across the grove |
| SuperbloomOpening | 2D | flowers on a perspective grid; six round petals whose spread is the swell |
| SporeReleaseGills | 2D | gills as angular ridges from a centre above the frame; three spore layers falling at different rates |

Lessons from the block: a refraction amplitude must never follow a fast envelope -- TermiteMoundPlumes scaled its heat shimmer by the treble and the whole background jittered at frame rate (strobe 14); the swell drives the amplitude now and the treble only lights the shimmer highlights. Crowd scenes in indirect geometry need their distance tuned by eye: the penguin huddle at z 14 was a line of dots, at z 8 a wall of slabs, at z 12 a huddle. A flat billboard for a mound reads as a slab -- discard outside an ellipse. Sparse glow fields need about 1.6 times the light they seem to need on the sheet. A flower field whose blossoms close when the music is quiet reads as an empty field: keep the open state at 0.6 or more.

## The fourth fifty, block D: culture and play

| Scene | Pipeline | Note |
|---|---|---|
| UkiyoeWaveWoodblock | 2D | a wave profile plus a circular curl lobe; foam claws as round dots along both; flat woodblock colours |
| IlluminatedManuscript | 2D | vines as polylines with leaves every fifth segment opening as the growth passes; a gold highlight sweeps on the swell |
| ZellijTilework | 2D | eight-pointed stars as the union of two rotated squares per cell; corner squares and kites by angle |
| RangoliPowderMandala | 2D | rings laid in order over the arc, each filling around from a start angle; grains as dense round specks |
| CalligraphyBrushStrokes | 2D | strokes drawn in windows of a cycle; the page washes out over the last 8 percent (a crossfade) and begins again |
| FrescoRestorationReveal | 2D | patches cleaned in row-major order; each a smoothstep over its slice with a ragged fbm edge |
| DominoCascadeWave | 2D | topple = smoothstep of (front - row); tiles stand again far behind the front, out of view |
| SpirographGearDraw | 2D | hypotrochoid with a rational ratio fixed per activation; 220 trace segments over three turns |
| KaleidocycleFold | `indirect` | six tetrahedra spanning alternating hinges; the fold phase is unbounded and continuous, so the ring turns forever |
| TangramShuffle | 2D | seven pieces as signed-distance shapes; poses from a 5x7 table blended with shortest-way rotation |

Lessons from the block: on a white page a brightness swing with the level (0.75 + 0.5 x level) is a whole-frame strobe (SpirographGearDraw 10.9) -- bright scenes get 0.9 + 0.2 x level; a camera flash on the kick over the whole wall strobes too (FrescoRestorationReveal 10.6), so the flash lives near the worked patch; dominoes drawn as full-cell columns read as stripes -- a gap between the stones and a dark top edge make them stones; a seal carved from a cell hash is a pixel grid (V8e), a sine-product carving is not.

## The fourth fifty, block E: music and sound

With this block the fourth fifty is complete: 200 new scenes since 02.09.2026.

| Scene | Pipeline | Note |
|---|---|---|
| PianoRollWaterfall | 2D | screen rows above the keys map to the age of a melody sample; the bar x is the pitch on the keyboard; keys light by chroma |
| VinylGrooveMicroscope | 2D | the groove walls carved by audioWave sampled by position (fixed in the vinyl, scrolling past); round dust motes; stylus at the centre |
| TapeReelEcho | 2D | tape path as three segments; reels turn at v / r; the spectrum printed at the record head repeats dimmer at the playback heads |
| ModularSynthPatchbay | 2D | module kind by cell hash (knobs, scope, spectrum, LEDs); cables as sampled parabolas with a pulse on the clock |
| TuningForkChoir | 2D | forks as SDF boxes, halos as concentric rings from the tine tips; the mallet glides on the chroma-weighted centre |
| FormantVowelSpace | 2D | centroid and spread from 16 bands of the spectrogram history, averaged over rows; the trail from older rows (about 200 fetches per pixel) |
| GranularCloudSynth | 2D | three layers of jittered round photo grains over the waterfall; existence = smoothstep of the cell hash against the swell |
| SidechainLungBreath | 2D | lobes as unions of ellipses scaled about the hilum on the swell; the kick only dips the light and drives the GR meter |
| ChordRailwaySwitches | 2D | routes as a random walk over five tracks with S-curve blends; twelve crossovers, one per chroma class; trains spaced so the wrap is seamless |
| SilenceSnowfallHush | 2D | cover = 1 - swell; snow settles on bright (upward) photo parts plus an fbm pattern; flake presence by a smoothstep of the cell hash |

Lessons from the block: a continuous melody history drawn one sample per screen row is a wavy line, not a piano roll -- quantise each sample to its key before placing the bar, then the bars stand still while they fall; a curve sampled at points and tested with a point distance is a dotted line -- test against the segments between the samples; a sound-shape marker (centroid, spread) read straight from the live spectrum jumps, so FormantVowelSpace reads it from the spectrogram history averaged over a few rows (about 200 fetches per pixel, cheap enough at 2D); the 90 percent snapshot of preview.py at hold 12 already showed the next scene for this block (the probe scene ended early), hold 10 is safe. Also in this commit: the PeacockTrainFan body (block C) got a slender neck, a head with a beak and a crest -- the old silhouette read as something else entirely on the catalogue page.

## The startup stutter: 245 mesh uploads, 21 GB of vertex buffers

Reported as "the frame rate stalls shortly after the start". The per-second
fps average said everything was fine (82 fps in the first second, ~100 after)
because a stutter is ONE long frame and a single 200 ms frame among a hundred
still reads as 95 fps. `KALEIDO_FRAME_LOG=<ms>` (new) logs every frame over
that many milliseconds with its wall-clock offset and what the lazy warm-up
did in the same frame, which named the cause immediately:

| | before | after |
|---|---|---|
| Frames over 25 ms in the first 80 s | 245 | 0 |
| Longest frame | 235 ms | under 25 ms |
| Stall total | 11.6 s | none |
| GPU memory after a minute | 26 GB | 5.7 GB |

Every one of those spikes was a mesh scene's GL upload: 8-12 ms to copy the
vertex array and upload the material texture array, 2 ms for the bounding box
on the render thread, and 14-24 ms for `glBufferData` of about 27 MB. The
warm-up walked all 245 mesh scenes of the full preset, one per frame, for the
first 51 seconds -- and left every one of them resident, which is where the
21 GB came from (each scene owns its buffer; 171 distinct models, 245 scenes).

Two changes:

- **A model is loaded when it is about to be seen, not because it exists.**
  The per-frame warmer now only compiles GLSL and finishes uploads that were
  actually asked for. The machinery for arriving late already existed and is
  now the only path: the fade's incoming scene requests its model, the
  scheduler parks the fade while the worker loads it (up to 5 s), and
  `draw()` builds the frame the worker publishes. `buildGeometry()` no longer
  loads a mesh synchronously at all -- that was the earlier generation of the
  same bug, a 200-700 ms load on the render thread.
- **A residency budget** (`RenderPipeline::trimMeshResidency`, default 16
  scenes, `KALEIDO_MESH_BUDGET` to override). The active and incoming scenes
  are stamped every frame; anything beyond the budget gives its vertex buffer
  and material textures back to the driver (`Scene3DShader::releaseMesh`) and
  reloads through the same asynchronous path when it is next due.

What remains is one upload per mesh scene that is actually shown, about 35 ms,
and it lands while the fade is still parked -- so it falls on the outgoing
scene at full opacity rather than in the middle of a cross-fade. Verified over
a 210 s sweep at 2 s per scene: 53 mesh scenes shown, 53 uploads, GPU memory
flat between 5.3 and 6.8 GB, and the mesh scenes render exactly as before.

## The fifth fifty, block A: light and optics

| Scene | Pipeline | Note |
|---|---|---|
| CameraObscuraRoom | 2D | the photo turned through 180 degrees and blurred by a disc of taps whose radius is the aperture; brightness and blur move together, as an aperture does |
| WeldingArcSeam | 2D | the bead is a function of how far behind the torch a pixel is; cooling is one exponential, temper colours a second, wider one |
| StageRigMovingHeads | 2D | each head is a cone test (along, across) with a photo gobo; the pool on the deck is the ray-plane hit, not a second drawing |
| XrayLuggageBelt | 2D | dual-energy palette from the photo's own luminance; the density comes from the band at the pixel's height inside the bag |
| ThermalIronbowStreet | 2D | the street is drawn (facades, windows, road) and only then read as temperature, so the ironbow never depends on what the photo happens to be |
| PhotoelasticStressFringes | 2D | fringe order = summed load field, coloured by a Michel-Levy walk; isoclinic brushes are a separate cosine the treble sharpens |
| EclipseLeafCrescents | 2D | every canopy gap is a pinhole: a sun disc minus a moon disc whose offset is the eclipse fraction, drawn over a 3x3 cell neighbourhood so crescents may overlap |
| LightPaintingTrails | 2D | the trail is 56 segments walked BACKWARDS in time along the wand path; segment distance, not point distance, or the ribbon reads as dots |
| LaserHarpBeams | 2D | a beam is cut by a smooth window on the hand's distance, so it never switches between frames; the bloom sits at the contact point |
| CrepuscularRaysForest | 2D | ray index comes from the angle around the sun, one spectrum band each; the fan swings because the sun sinks over the arc |

Lessons from the block: a pinhole projection blurred with a disc of taps needs a radius around 0.006 in uv, not 0.02 -- at 0.02 the image is a smear and the scene reads as fog; a dark workshop or shop floor needs the photo at about 1.1 with a constant added, since 0.55 of a dark photo is black at sheet size; a scene whose subject is a false-colour reading of the world (thermal, X-ray) must DRAW its subject -- facades, windows, road, bags -- and only then map it to the palette, otherwise the palette paints whatever the photo happens to be and the scene has no identity.

## The fifth fifty, block B: built spaces

| Scene | Pipeline | Note |
|---|---|---|
| SplitFlapDepartureBoard | 2D | the top half of the falling flap is the NEXT character compressed vertically by the fold; the bottom half is already the current one |
| EscalatorHallCrossing | `indirect` | two flights crossing in an X; steps march along the flight direction, riders ride the same parameter, rails are three long segments |
| SubwayMapPulse | 2D | node positions come from a fixed random walk over three step directions, so every line reads as a diagram and stays put |
| SuspensionBridgeCables | `indirect` | the cables hang OUTSIDE the deck width -- at the deck edge the slab hides them completely from underneath |
| GlasshouseIronRibs | 2D | one perspective mapping (u along the vault, v across) carries ribs, purlins, panes and the sun patch |
| ServerRoomAisle | 2D | corridor projection: the wall's screen height grows with its screen x; subtracting one from the depth squeezes the racks into the middle sixth |
| WindTurbineFieldDusk | `indirect` | blades are bounding-box quads with the taper discarded in the fragment; each turbine has its own steady rate |
| HeliostatSolarTower | 2D | ring and slot indices from the ground-plane polar coordinates; the glint is a narrow power of the tracking angle |
| AqueductArchesValley | 2D | the arch is a rectangle unioned with a semicircular head, cut out of a tier slab; two tiers stack |
| CoolingTowerPlumes | 2D | the plume widens with height and leans by the wind; its colour comes from the band at that height, so it is a slow vertical spectrogram |

Lessons from the block: in an indirect scene, geometry placed exactly on the silhouette of a larger piece is invisible -- the bridge cables sat at the deck width and the deck hid every one of them from underneath; move such parts clear of the occluder rather than tuning their colour. A ribbon built from cross(segment, viewDirection) needs its guard BEFORE the normalise: a segment running nearly along the view has a vanishing cross product, and normalising that yields a NaN quad the rasteriser drops without a word. And a corridor projection has the wall's screen HEIGHT growing with its screen x; subtracting a constant from the depth (a plausible-looking near-plane offset) squeezed the whole rack row into the middle sixth of the frame.

## The fifth fifty, block C: water

| Scene | Pipeline | Note |
|---|---|---|
| TidePoolRefraction | 2D | the ripple field displaces the floor sample by the local DEPTH, so the middle of the pool sways and the rim stays put |
| SpillwayGateRelease | 2D | the sheet is a function of how far below the crest a pixel is: glassy near the lip, white further down, temper-free |
| TravertineTerracePools | `patches` | terrace staircase with a smoothstep riser; the rim bulge is a gaussian just behind each lip, and the water level breathes without the dam moving |
| MangroveRootsTide | `indirect` | roots are sampled arches emitted as camera-facing segments; one caustic field sampled by world xz lies consistently on bed, roots and fish |
| PuddleNeonReflections | 2D | one function draws the street; the reflection calls it again with a mirrored, ruffled, ring-displaced coordinate |
| WaterStriderDimples | 2D | the subject is not the insect but its six leg dimples: a bright caustic ring with a dark rim, drawn as a lens over the bed |
| SalmonRunFalls | `indirect` | each fish rides a real parabola with its heading taken from the arc's own tangent, so it points up on the way out and down on the way in |
| CenoteLightShaft | 2D | the shaft is a cone from the sun with a band texture; motes are round and only bright INSIDE the cone, which is what makes the cone read as solid |
| RiceTerracesDawn | `patches` | terrace index comes from the hill height, so the bunds follow the contours; the hill is ramped to zero at the camera or the scene renders from inside the ground |
| PivotIrrigationCircles | 2D | the wetted wedge is an exponential of the angle behind the arm, so a field dries out smoothly over a whole turn |

Lessons from the block: a tessellation (patches) scene has NO sky quad, so whatever lies above its far ground is black -- the far rise has to climb to about a hundred units to reach the top of a 55 degree frame, and EXTENT.x has to be wide enough that the upper corners are still ground; both scenes here first rendered as a lit mesa in a black box. EXTENT must be identical in the control and evaluation stages or the patches tear at their seams. A displaced terrain must also be ramped to zero AT the camera: the rice hill stood where the camera was and the scene rendered from inside the ground, which reads as a black frame with a swirl of contours in it. And an envelope must never scale a radius that is already in flight -- two scenes here had the kick multiply an expanding ring, which makes the ring jump outward on every beat; the radius stays continuous and the kick lights it instead.

## The fifth fifty, block D: textiles and materials

| Scene | Pipeline | Note |
|---|---|---|
| KnittingRowsGrow | 2D | a stitch is two bowed legs meeting at the bottom; the bow is what makes it read as a knitted V instead of a chevron |
| QuiltBlockPatchwork | 2D | four traditional piecing patterns chosen per block by hash; blocks arrive row-major, each over its own slice of the arc |
| BobbinLacePillow | 2D | the two moves of bobbin lace (cross and twist) drawn as segments between pin positions; the bobbins hang below the working line |
| BatikWaxCracks | 2D | the crazing is a Voronoi seam whose front spreads from three origins; the dye bleeds sideways out of the crack |
| KintsugiGoldSeams | 2D | one continuous sweep: whole, then broken (the break front), then mended (the gold front just behind it) |
| EmbroideryHoopStitches | 2D | satin stitch is parallel bands across the petal's short axis with a sheen that peaks at its centre line |
| KumikoLatticeShoji | 2D | the hemp-leaf figure is six slats through the cell centre plus chords between them; the wood reads as silhouette against the lit paper |
| ChainmailRingRipple | 2D | rings must OVERLAP (radius near half the pitch) or the sheet reads as separate donuts; two passes give the interlock |
| CloisonneEnamelCells | 2D | the cells are a Voronoi over a swirled coordinate, so they curl with the design; each fires from matt powder to a glassy dome |
| DamascusSteelEtch | 2D | the layer coordinate is sheared by position along the blade, which is exactly what twisting the billet does to its layers |

Lessons from the block: interlocking geometry has to actually interlock -- the chainmail rings first sat at a radius of a third of the pitch and read as a field of separate donuts; at nearly half the pitch, in two passes, the sheet becomes mail. A structure lit from behind reads as silhouette, not as lit material: the kumiko bars had to drop to about a third of their first brightness before the lattice was legible against the paper. And a seam that carries the whole subject of a scene needs real width -- the kintsugi gold at 0.012 of the frame was invisible at sheet size and works at 0.024.

## The fifth fifty, block E: rhythm machines and toys

With this block the fifth fifty is complete: 250 new scenes since 02.09.2026.

| Scene | Pipeline | Note |
|---|---|---|
| MetronomeForest | 2D | every pendulum keeps its OWN fixed rate; the music only lights the ones whose phase happens to agree with the beat phase, so the rank drifts in and out of agreement without a single jolt |
| HourglassSandFall | 2D | upper funnel, falling column and lower mound are one function of the arc, so the glass runs through without a cut |
| SundialShadowSweep | 2D | the shadow's angle AND length come from the same day parameter; the penumbra widens with distance from the gnomon |
| SlotMachineReels | 2D | reels never snap to a stop -- they keep their steady rates; the drum coordinate must show about three symbols, not forty |
| GaltonBoardBeads | 2D | each bead's path is a running sum of left/right steps, interpolated between rows, so the bounce is smooth and the bins build the bell curve over the arc |
| MusicBoxCylinder | 2D | the pin field is indexed by (position along, angle around), so the score rolls under the comb as the cylinder turns |
| WindChimeTubes | 2D | a ringing tube does not move: it brightens and throws concentric halos, which is how a struck tube reads without shaking the frame |
| StepSequencerGrid | 2D | the playhead is a soft gaussian in step space, so it sweeps rather than jumping cell to cell |
| AbacusBeadCount | 2D | each bead's travel is a smoothstep of the band against its own index, so beads glide to the bar and never teleport |
| JukeboxBubbleTubes | 2D | the tube path is a straight run unioned with an arch over the dome, one distance field, so bubbles rise round the corner |

Lessons from the block: a machine whose whole subject is repetition must NOT be locked to the beat -- the metronomes and the slot reels keep their own fixed rates and the music only lights them, which is what lets a rank of them drift in and out of agreement with the track instead of snapping to it. A drum or reel coordinate has to be scaled to show about three cells in its window: the first cut put forty symbol cells behind the glass and every one of them was too small to read. And a counter (abacus, Galton bins) reads as counting only if each piece glides: the travel is a smoothstep of the value against the piece's own index, so a bead is always somewhere between its two rest positions and never teleports.

## Batch runs must not take the machine hostage

A catalogue render or a screening pass runs on a machine somebody is using at
the same time.  Three separate things made those passes feel like the computer
had died -- typing lagging by seconds, switching windows taking seconds:

**1. Orphaned windows.**  Every tool starts the app with `Start-Process` and
stops it again afterwards.  When the STARTING script dies first -- a tool run
hitting its time limit, a cancelled job, a crash -- the window it started keeps
rendering for ever.  Measured: one such orphan costs ~17 % of an RTX 5090 and
1-2 GB of video memory, and four of them together take the GPU to 52 %.  They
never stop, so they accumulate across a working day.  Verified directly: kill
the parent script, and the child is still rendering afterwards.

The fix is that the process is now responsible for its own end.
`KALEIDO_MAX_RUNTIME_SECS=<n>` arms a dead man's switch in `main.cpp`: after n
seconds the app quits itself, whatever happened to whoever started it.  Both
tools set it to comfortably above the intended run length, so it only ever
fires when something already went wrong.  `Tools/kill_orphans.ps1` sweeps up
what older runs left behind and runs at the start of every catalogue pass.

**2. The window stole the keyboard.**  `window.show()` activates: a 1920x1080
window jumped in front of the user's work and took the focus once per scene.
`KALEIDO_NO_ACTIVATE=1` shows it with `WA_ShowWithoutActivating` and lowers it
to the bottom of the stack.  Verified: with the flag, the foreground window
never changes during a render, and the catalogue PNGs are identical.

**3. Everything ran at full priority.**  Renders now run at `BelowNormal`, and
ffmpeg gets `-threads 4` instead of all 24 cores.  Builds are started at
`BelowNormal` too.  A GPU-bound render loses nothing measurable by it.

The related root cause, fixed the same day, was the mesh residency bug: the
lazy warm-up loaded every mesh scene's model and never released one, so the app
sat on up to 26 GB of a 32 GB card.  Video memory that far overcommitted makes
the whole desktop page over PCIe, which is what "extremely slow" really was.

| Measurement | One render | Four orphans |
|---|---|---|
| GPU | 17 % | 52 % |
| Video memory | +0.9 GB | +3.4 GB |
| Scheduler wake delay, median | 0.3 ms | 0.5 ms |

## 27 new transitions, and three traps that come with them

83 transitions became 110.  The six families are print and paper, optics,
matter and phase changes, living things, mechanism, and algorithms; the list
with each one's mechanism is in `docs/proposals-2026-09-04-transitions-27.md`.

A transition has one structural advantage over a scene: its progress is
monotonic, so continuity is free as long as no audio envelope scales something
already in flight.  It also has one structural constraint a scene does not
have.  **Both ends must be exactly the untouched scenes.**  Everything a
transition adds is therefore gated on `arc = sin(PI * d)`, which is zero at
both ends by construction, or on a coverage term that is provably 0 at d=0 and
1 at d=1.  A shadow left at 30 % on the last frame is a visible seam at every
scene change.

### The tooling was lying about every transition image

`render_catalog_images.ps1 -Kind trans` built its probe configuration with the
two reference scenes and no `<TransitionShader>` at all.  `KALEIDO_TRANS_STYLE`
selects from the transitions REGISTERED in the configuration, and a
configuration with none falls back to the built-in Crossfade -- so every
transition image in the catalogue showed a plain cross-fade rather than the
transition it was labelled with.  Fixed; the existing 83 images predate the fix
and are still wrong until they are re-rendered.

`Tools/trans_strip.ps1` is the new instrument: it records one forced cross-fade
and pulls a row of frames out of it.  One frame cannot show whether an arc
starts clean, does its one thing and lands clean.  It uses the QUIET wav on
purpose -- with a confident beat the scheduler clamps a cross-fade to four
beats, two seconds at 120 BPM, and two seconds cannot be sampled.  It also sets
`KALEIDO_MOOD=0`, because the mood grade rotates the whole frame onto the key
the music is in: a Prussian-blue cyanotype came back wine red.

### Trap 1: a feature may not outgrow its neighbourhood search

A cell-based effect looks at a fixed ring of neighbouring cells.  If a bubble's
shock ring, a grain's growth or a droplet's travel reaches further than that
ring, the boundary between "this pixel sees the feature" and "this pixel does
not" IS the cell boundary -- and the result is axis-aligned rectangles in the
middle of the picture, which read as data corruption.

Growth and reach can be decoupled: grow fast, cap the reach.  Once neighbours
have met, the frame is completely tiled, so any reach beyond that is invisible
anyway (`RecrystallisationGrainGrowth`).

### Trap 2: a branch-selected sample offset destroys the mip level

When the lens offset for a texture fetch is chosen per pixel by a branch --
"whichever bubble covers me" -- the offset jumps at every feature boundary, the
implicit derivative of the texture coordinate explodes, and the sampler drops
to its coarsest mip.  The result is blurred rectangular blocks.  `textureLod`
with an explicit level takes the choice away from it.

### Trap 3: paper is the white point

Three of the print transitions came back as a white wash.  A print cannot be
brighter than its stock, so lifting the sheet with a gain blows every highlight
in the picture to pure white, and highlights are what the eye reads first.  The
same restraint keeps these out of strobe territory: a near-white full-frame
sheet is a flash, whatever it is a picture of.

## Feedback round 04.09.2026: eighteen scenes, and why each one was wrong

A user pass over the catalogue with the release running.  Every item was a
real defect; the interesting part is that most of them share a cause.

### Nine plates that filled half the frame

`geom="grid"` scenes draw a plate and nothing else -- the black above it is
the clear colour.  Six of them built their camera as *push away, then tilt*:

    vp = worldPos; vp.z += D; vp = tilt(vp);

which rotates the already-pushed plate about the CAMERA, not about the plate
-- dropping the plate's centre by `D*sin(tilt)` and parking it in the lower
half of the frame.  *Tilt first, then push* keeps the plate on the view axis,
and at the same distance it fills the frame.  The other three (plates lying in
XZ with a pitched camera) were simply too far away; and the ocean needed the
camera lowered and pitched down, with the plate widened, because a plate seen
in perspective is a trapezoid and a frame is a rectangle: the far edge has to
be wider than the frustum at that depth or the top corners stay black.

The vertical field of view is 55 degrees (`SceneTanHalfFovY` = 0.52), which
is what these distances were computed against.

### Two horizons

`CyberpunkSynthGridHighwayFly` split sky and ground at `rd.y == 0`: rays
pointing up never asked the terrain, so every ridge that rose above eye level
was cut off flat at the horizon line.  March the terrain for EVERY ray; draw
the sky only where the march misses.  The ridges then stand in front of the
sun, which is the whole picture.

`SuperradiantTokamakIgnition` tore along the atan cut on the left.  Every use
of the angle is periodic in 2*pi only if its coefficient is a whole number;
the safety factor `3.2 * hel` was not.  An integer q closes every term -- and
rational q is where a real tokamak's islands sit anyway.

### FuturisticCityFlight, rebuilt

Reported three times as pure chaos, patched three times.  The corridor's floor
sat five units below the camera (no street), the buildings were lattice boxes
with a detail cube on top (no walls), and the windows were indexed through a
finite-difference normal that flipped between wall directions at every
lattice seam (rewriting themselves every frame).  Now: one road at y = 0, a
row of buildings per side with per-block width, height and setback, a
six-box distance field with an ANALYTIC normal, windows in the wall's own
coordinates.  A wall is a wall.

### KerrNewmanSingularity: right geodesics, wrong compositing

The background was added to every ray, including the ones that had fallen
through the horizon, so the shadow was never black -- and at 0.35 of a
full-frame photo it buried the disk under an orange wash ("a giant sphere").
A captured ray is black, full stop; the background is a starfield with the
photo faint behind it; the Einstein ring sits at the ray's CLOSEST approach,
not its end point.  The horizon no longer pumps with the bass.

### Formations

`Fleet` moved as one rigid block: every craft now runs the path at its own
speed and phase, and every slot is pushed off its lattice point.  `FleetJump`
is a wedge seen from behind, which folds into a horizontal row; breaking that
needs scatter in y and z, not just x, and a per-craft size.  `RingStation`
took `spinP` literally, so the two instances the preset left at 0 stood still
-- they turn about their up axis now.  `GlassStack` summed fourteen bright
panes to a white slab that hid its core; fewer, thinner, darker panes, and no
more camera zoom on the level and the kick.

### On stylised "realistic" objects

`BuildUpRocketLaunch`, `PeacockTrainFan` and their kind draw a real object in
a 2D fragment shader, and it shows.  The mesh path (`geom="mesh"`) exists and
carries 171 models -- but the pack is spacecraft and stations; a rocket, a
bird, a ship's hull would have to be generated first.  Recommendation: keep
procedural for phenomena (waves, plasma, fields), go to meshes for anything
with a canonical silhouette.

## Mesh trial 04.09.2026: generated models instead of stylised 2D objects

The user's question after the feedback round was whether the "realistic"
scenes that draw a real object in a fragment shader (a rocket, a peacock)
would not be better served by generated 3D models. Answer by experiment:
three scenes built the same evening, each the mesh counterpart of a
procedural one -- `MeshRocketLaunch` (BuildUpRocketLaunch), `MeshPeacockDisplay`
(PeacockTrainFan), `MeshPipeOrgan` (PipeOrganChroma). Four assets came out of
the user's own 3D-Generator (`cli.bat --prompt ... --count 4 --name X --profile
model --specs-only`, the specs checked by hand, then `--resume`), about six
minutes each end to end, and one of them re-rolled. The models are
`OrbitalLaunchRocket`, `RocketLaunchPad`, `DisplayingPeacock`,
`BaroqueChurchOrgan` (not in the repository, like every model; 57 MB
together, for the next model pack).

The verdict on screen: yes. A rocket that IS a rocket, a peacock with a real
fan of eyespots, an organ whose silver pipes are pipes -- none of it reads
as a children's drawing, which was the complaint about the procedural ones.
The environment stays procedural (a night sky and floodlit ground, a dusk
garden with fireflies, a candlelit church with a rose window), and the music
goes where it always goes in a mesh scene: into the LIGHT, not the object.

What went wrong before it went right, in order:

- **The generator's models face +Z, and +Z points AWAY from our camera.**
  The first render showed the back of the fan and the organ's back panel.
  Every ground-based mesh scene needs a half turn about Y; the turntable
  families never noticed because they spin anyway.
- **The sun in the sky was behind the bird.** The camera looks toward +Z;
  a sun disc painted at +Z lights nothing the camera sees, so the peacock
  was a silhouette. The key light has to come from BEHIND the camera; the
  visible sun can only be the rim light.
- **`materialExposure` with its 0.20 target halves a mid-toned object.**
  It was tuned for near-black hulls (luma 0.14). A peacock measures 0.37,
  a white rocket 0.44: exposure 0.53 and 0.46, i.e. darker than the texture.
  These scenes use a 0.28 target clamped to 0.6..1.8.
- **"Brightest texels as lamps" is a hull trick, not a concrete trick.** On
  the pad it lit the concrete's own highlights red -- lava cracks all over
  the base. Removed.
- **The staged liftoff and the catalogue probe.** The launch runs on
  `sceneProgress`; the probe's section cut re-armed the scene around 18 s,
  and the C frame showed the rocket back on the pad. Liftoff now falls at
  34..46 % of the span so a scene cut short still launches. The C frame of a
  staged scene is not evidence of a bug (see the sweep notes above).
- **A pad prompt has to describe the COMPOSITION, not the parts.** "Launch
  gantry, concrete pedestal, flame deflector, hold-down arms" produced a
  hopper on a plinth. "A wide flat platform with an open flame-trench
  opening in the centre, a tower at ONE edge, the centre empty" produced a
  pad the rocket can stand on. Objects that have to FIT together need their
  relationship in the prompt.
- Two-model placement (`model=` pad, `model2=` rocket) is done in real
  proportions from `meshExtent`/`meshExtent2` -- both arrive as unit boxes --
  with the platform height, the offset across and into the pad as
  per-instance floats, tuned once against the actual model.

## 05.09.2026: the mesh rebuild -- nineteen object scenes replaced by generated models

After the trial above the user asked for the rest: every 2D scene whose
subject is a real object with a canonical silhouette, rebuilt on a
generated mesh. Sixteen more scenes in one night (three waves of models
from the 3D-Generator, 21 assets, 4 of them re-rolled), the nineteen
procedural originals retired: `AqueductArchesValley`, `TermiteMoundPlumes`,
`CoolingTowerPlumes`, `HeliostatSolarTower`, `TuningForkChoir`, `WindChimeTubes`,
`TempoGearwork`, `PendulumWaveTempo`, `BellTowerDownbeat`, `CandleForestBreath`,
`ServerRoomAisle`, `DominoCascadeWave`, `ZoetropeDrum`, `MetronomeForest`,
`SeismographDrum`, `FoundryPour`, and the three from the trial. Their mesh
counterparts carry the `Mesh` prefix. Git history keeps the old files.

Phenomena stayed procedural on purpose (waves, plasma, fields, fluids); a
fan of feathers or a row of bells is an object, a plume of steam is not --
so `MeshCoolingTowers` has real towers and painted steam, `MeshTermiteMound`
a real mound and painted heat.

### Instancing carries most of it

`instances="N"` turns one model into a row, a field or a crowd: twelve
tuning forks and twelve pendulums (each with its own period), seven gears,
four bells, sixteen server racks, 160 heliostats round one tower, 224
dominoes in serpentine lanes, 300 candles. Two rules learned the hard way:

- **A collapsed instance still costs its vertices.** `MeshHeliostatField`
  draws the tower only on instance 0 and collapses it on the other 159 --
  but the vertex stage still runs 290k vertices 159 times for nothing. The
  recording ran below real time until the tower got a 30k LOD. Anything in
  an instanced buffer, even the part only one instance shows, must be light.
- **Instanced models need a LOD.** `Tools/blender_lod.py` (Blender 5.2,
  collapse decimation, keeps UVs and the material, halves the textures)
  makes them: 4k faces for a heliostat, 2k for a candle, 500 for a domino.
  The engine draws one buffer N times, so faces times N is the budget.

### A long thing is a short thing instanced

"A complete aqueduct from end to end" came back from the generator as a
square arcade box -- a courtyard of arches. "One short segment, seen from
the side, cut off cleanly at both ends" came back right, and seven of them
end to end are the bridge (`MeshAqueduct`, `instances="7"`, scaled by
HEIGHT so the segment's own proportions set its length).

### What the generator's quality gate rejects, and how to get past it

- *Too small in the image* (under 10 % coverage): thin hanging things --
  the wind chime and the pendulum, three attempts each. Asking for "filling
  the frame" then produced *touches the border*. What passed: "occupying
  about two thirds of the frame height with clear empty margin on every
  side", and for the pendulum a heavier sphere on a shorter rod.
- *Base colour nearly black*: the server rack, because it was asked to be
  black. Ask for light grey aluminium; the scene lights it dark anyway.

### Orientation is a question of geometry, not of texture

The heliostat panels stayed dark blue through two attempts at picking the
glass out of the material (metallic map, then the object-space +Z face).
What works is the aiming normal itself: the panel is the face whose world
normal points where the mirror aims, `dot(n, vAim) > 0.55`. Then a real
reflection -- the sky shell sampled along the mirrored view -- lights the
whole field.

### The seismograph's trace is real

`MeshSeismograph` turns the paper drum on time and, for every point on the
paper, computes when it passed under the pen; the bass energy at that
moment comes from the spectrogram ring (`texSpectro`, `spectroHead - age`),
so the last revolution of the drum is the last eighteen seconds of the
song, drawn in ink. The drum's axle stays along X: laid along Z it is a
disc seen end-on and the paper is hidden.

### Two-model scenes and where the second model sits

`MeshMetronomes` uses the lab pendulum, upside down, as every metronome's
rod (a thin rod on its own would never pass the generator's coverage
gate). `MeshFoundryPour` paints the molten stream on the SHELL between the
ladle's lip and the mould's cup -- both positions come from the vertex
stage as varyings -- because everything the stream crosses on screen is
background. `MeshSeismograph` and `MeshMetronomes` place the second model
by fractions of the first's extents (`drumXP/YP`, `pivotP`, `frontP`), read
off the generator's preview images once.

### Housekeeping

The 21 new models are NOT in the repository (like every model): they need
a `models-v3` pack. Until it is published, a release build skips these 19
scenes on machines without the models. `Tools/make_model_pack.ps1` puts
them in the `objects` archive by its default rule.

## 14.09.2026: transitions that were "very, very fast", and a preset audit

### What "fast" turned out to be

`PresetEditor --transprofile` (new) sweeps every registered transition over
d = 0..1 with a pinned clock and reports how its change is distributed.
Three different kinds of fast, each with its own cause:

| kind | measured as | before | after |
|---|---|---|---|
| clock-driven motion | change per frame from the clock alone, scene A a still photo (`--scene Blit.frag`, drone profile) | sum 304, 35 transitions over 2/255 | sum 53, none over 1.5 |
| beat jolts | the same, sampled ON the preview's kick minus between beats | sum 649, 55 over 2 | 0 |
| sheer amount of change | total variation over the sweep (a cross-fade is 57) | up to 1650, at a four-beat 2 s fade | unchanged, but floored by minFade |

Causes, in the order they were found:

- 27 classic styles pushed their progress forward on every beat
  (`d + 0.05*sin(PI*d)*audioBeat`) and deepened the distortion with the
  level: a push, spin or zoom that jumps in time. Removed; `mid` follows the
  progress only.
- The 55-file physics series ran its clock at `time*0.4 + audioAdvance*0.2`
  and put `audioBass` on displacements, radii, spatial frequencies and
  angles. audioAdvance integrates flux, so every transient surge sped the
  motion up; bass on a frequency re-lays the whole pattern each kick.
- Even the slow swell broke things wherever it scaled a SCALE (a grating of
  frequency 60, a spiral pitch, a growth rate, a tile count) or an amplitude
  that grows like 1/r and is wrapped with fract(). Those are constants now.
- The clock rates themselves were scaled per file to a measured target
  (patch in two iterations: change per frame is linear in the rate only while
  it is small).
- GlitchPixelSort hashed the CONTINUOUS clock for its sparks: white noise
  every frame, at any rate.

### Fade floors

With a confident rhythm the scheduler clamps every scene fade to four beats
(2 s at 120 BPM). New:

- `minFade="..."` on a `<TransitionShader>`: the shortest fade this
  transition runs in, from the profile: max(tv / 120, steepest step * steps /
  320), capped at 10 s, written only from 2.5 s up. 52 of 110 carry one
  (NewtonRings 10 s, KaleidoSpin 6.5 s, SpinZoom 4 s, Polaroid 2.5 s).
- `timeSceneFadeMin="..."` on a preset: a floor for every natural fade.
  Ambient 5 s, SpaceAmbient 6 s (generator: `SCENE_FADE_MIN`). A preset with
  a floor also never hard-cuts on a detected drop.
- `KALEIDO_FADE_LOG=1` prints one line per fade (transition, duration,
  beat/config time, floor). Verified in the app with two probe presets and
  the 120-BPM test file: 1.89 s from the beat clamp, 5.00 s in the calm
  probe, the per-transition floors in both.

Seven transitions that stay visually wild after all of this (big brightness
flashes or a lot of turmoil) lost `calm`/`dreamy`, which takes them out of
Ambient, SpaceAmbient and Galerie: LogarithmicSpiral, HelicoidMinimalSurface,
AcousticChladniResonance, CosmicStringLensing, SuperfluidHe4Fountain,
ChromatographySeparation, GyroidMembraneMelt. Ambient now registers 43
transitions (was 50).

### The editor dropped every attribute it did not model

`PresetEditor`'s `Preset::save` wrote a fixed attribute list. `model=`,
`model2=`, `instances=`, `genPasses=`, `AudioFile=` were lost on every save
-- saving Komplett.xml from the editor would have stripped the model from all
264 mesh entries, and the engine then skips them. Proven with the released
v1.15.0 editor's `--roundtrip` (264 -> 0). `extraAttrs` now carries unknown
root and entry attributes through verbatim.

### Preset audit

Every one of the 1081 catalogue entries reaches at least one genre preset
(1056 reach two or more). Tags against measurement (catalogue frames) and
content:

- `bright` on a clearly dark picture (luma < 0.12) -> `dark` (81 entries,
  mostly space scenes and mesh families on black backdrops).
- `dark` and `bright` together -> the measurement decides at luma 0.28 (65).
- 12 `calm`+`aggressive` contradictions and 8 dark-tagged scenes that render
  bright, judged one by one on a contact sheet.
- `space` removed from a city flight and a bubble-chamber photograph, added
  to PhotoSphere.
- SpaceAmbient no longer takes `aggressive` scenes: 59 of its 257 were
  gamma-ray bursts, planetary collisions and racing flights. 198 remain.
- Single-genre mesh families that only carried `dark` got an honest
  runtime-neutral second tag (dreamy/psychedelic).

Deliberately NOT changed by rule: `psychedelic` and `dreamy` against colour
saturation (a monochrome fractal zoom is psychedelic), and the text search
for "rough" words in calm scenes (it matched warped, toward, hyperbolic).

## 29.09.2026: the same scenes three times in twelve minutes, and quilt colours that flip

Reported after a session: DamascusSteelEtch, SundialShadowSweep and
KilnGlazeCrystals each came more than three times within twelve minutes;
QuiltBlockPatchwork changed its colours abruptly; DamascusSteelEtch did not
visibly react at all.

### Repeats: a filter that only saw what had already played

All three are STAGED scenes (they read `sceneProgress`, an arc over the solo).
While the build-up rises the scheduler prefers staged scenes in the first half
of its search, so their climax can be bent onto the drop (`setClimaxIn`). But
`EffectShader::usesProgress()` answered "no" for every shader that was not yet
compiled -- and scenes compile lazily. The preferred pool was therefore the
handful of staged scenes that had ALREADY been on screen.

Second cause, found by measuring: the rule fired at `buildUp > 0.25`, which on
dance music is 77 % of all frames. With the compile bug fixed, 12 % of the
catalogue (126 staged entries in Allround) took 83 % of all changes.

Third: mesh families register one entry per model (ShipFlyby 29, Hologram 26,
Aperture 14 ...), Allround's 1080 entries are 865 shaders. "ShipFlyby with
another ship" is still ShipFlyby again.

Fixes:
- `usesProgress()` reads the source (fragment + Scene3D siblings, comments
  stripped, `uniform` line ignored) while the program is not compiled.
- The preference now uses the arc's own condition: `buildUp > 0.45` and a
  predicted phrase end 4..45 s away -- only then can a staged scene actually
  land its climax.
- A no-repeat window: the last min(40, entries/3) scenes, compared by SHADER
  basename, are refused in the first two thirds of the search. Section
  replays and manual picks bypass it.

Probe (Allround, solos pinned to 8-10 s so twelve minutes hold ~58 changes,
same looped music, old dist build vs new):

| | old | new |
|---|---|---|
| distinct scenes | 44 of 57 | 56 of 58 |
| repeats | 13 (one scene 4x) | 2 (43 and 53 changes apart) |
| staged share | 51 % | 14 % |

### Colour flips: a hue that wrapped, read as radians

The conditioner slewed the key hue around the circle but then wrapped it back
into [0, 1) and multiplied it by the presence gate. About 800 shaders use
`audioChromaHue` as an angle in RADIANS (`imgPalette`'s `ang = audioChromaHue
+ ...`, `hueRot(c, audioChromaHue)`, `sin(audioChromaHue)`), so every time the
key hue crossed C the palette turned by one radian (57 deg) in a single frame
-- and a key centred near C crosses back and forth. The uniform is now the
UNWRAPPED slewed value (continuous, no gate): radian users see a smooth angle,
turn users (`fract`, `cos(2*pi*h)`) the same colour as before. A census of all
944 files that read it found no linear use (no mix/step/clamp/index on it).

Proof: a synthetic pad alternating between a B and a C# centre every 6 s
(hue glides across 0), QuiltBlockPatchwork alone. The new build logged 11
crossings (feature log column `hue`, new); the old build's recording shows the
whole quilt switching palette between two frames at each of them (e.g. t=7.7 s:
yellow/violet -> red/cyan); 75 isolated frame-difference spikes old, 23 new --
the rest are the 120-BPM kick light and the probe's own artefact (a one-scene
preset re-activates itself on a section change, so its arc restarts).

### DamascusSteelEtch retired

A stylised 2D object (a blade drawn across a black frame) whose reactions
were a forge glow at the bottom edge, a hairline highlight and dust -- the
class the mesh rebuild of 05.09. retired. Removed from Komplett.xml and the
generated presets; the git history keeps the shader.

## 29.09.2026 (2): presets chosen by rated fit, no staged-scene preference

The build-up preference for staged scenes is gone from the scheduler: the
user finds those scenes (an object slowly assembling, a clock hand moving)
the dull ones, and picking them on purpose is the opposite of what a drop
wants. setClimaxIn() still bends the arc of a staged scene that happens to
be on screen.

Genre presets had to hold at least 400 distinct scenes; the mood rules gave
Club 372, Psychedelic 331, SpaceAmbient 114. Every one of the 865 scenes was
rated by hand from its contact-sheet row (the three catalogue frames), its
header and its measured luma/saturation/motion: fit 0..10 for each of the six
genre presets plus a genre-free interest 0..10. The table is
Tools/preset_fit.tsv; make_genre_configs.py ranks by
fit + 0.15 * (interest - 5) (SpaceAmbient adds 0.4 * (ambient fit - 5)),
takes everything ranked >= 6 and fills to 400 by rank, dull scenes
(interest <= 2) last, nothing below fit 3. Mesh families carry at most six of
their model variants in a genre preset (ShipFlyby has 29). FX, transitions and
unrated new scenes still follow the mood rules.

Result: 400 distinct scenes in each genre preset (Ambient 400, SpaceAmbient
400, Galerie 400, Noir 400, Club 400, Psychedelic 400); 92 scenes, almost all
rated interest 1..3, now appear only in Allround. Fewer than 400 scenes fit
any single preset well (fit >= 6: Ambient 177, SpaceAmbient 175, Club 238,
Noir 153, Psychedelic 260, Galerie 138), so the last hundred or two of every
preset are acceptable rather than ideal -- in SpaceAmbient down to scenes
that are merely dark and calm, not cosmic.

## 16.10.2026: shows that run for days

The brief: visualisations that run for hours, better days, without the same
scenes coming back -- with the 2D and 3D chain labs, in the genre presets.

### What a long run looked like

`Tools/long_run_sim.py` simulates the scheduler over days (no music: no
section or drop cuts, mood acceptance about 0.6, the complexity budget left
out). Before: about 41 scene changes an hour, every scene two or three times
a day, the first scene back after an hour or so, a tenth of all returns
within 100 minutes. The no-repeat window held min(40, a third of the preset)
scenes and was lost on every restart. The labs never run out -- millions of
2D chains, thousands of 3D worlds -- but each was one entry among 400 and
got under one percent of the time, and walked only when its morphP roll
came out at 0.5 or more.

### What changed

All four parts sit in `Source/LongRunVariety.h` (Qt- and GL-free, checked by
`Kaleidoscope.exe -q`) and the places that use it.

- **Lab share** (`labShare="0.35"` in the preset head; SceneScheduler
  `setLabShare`). The walking labs (EffectShader::isWalkingLab: the shader
  declares `uniform float walkHost` and lists its classes, the entry's
  morphP range starts at 0.5) leave the random pick. The lab clock
  (LabShareClock) books every scene's screen time -- lab time against all
  time, both decaying with a time constant of three hours -- and calls a lab
  when the labs are behind their share: never two labs in a row, never the
  same lab file twice in succession. Shares chosen by the user: Psychedelic
  50 %, SpaceAmbient and Club 40 %, Allround and Ambient 35 %, Noir 25 %,
  Galerie 20 % (generator: `LAB_SHARE`). Without the attribute nothing
  changes (Kettenlabor, Transformationen, the Test benches).
- **Genre variants of the labs** (generator: `LAB_FLAVOURS`, `LAB_STAY`).
  The plain lab entries are replaced by variants with the genre's knob
  ranges, each walking (morphP 0.5..1) and staying 4..18 minutes. The walk
  now keeps to the entry's ranges (EffectShader::resetChainWalk reads them,
  `walkTarget()` maps the music's target into them) -- before, a walk could
  leave the rolled range at its first step. The classes are sorted
  calm .. wild, so a range is a character:

  | variant | used in | ranges |
  |---|---|---|
  | calm | Ambient, SpaceAmbient (2D, tunnel) | chain stages the calmer 60..65 %, worlds 65..70 %, no glowing edges, speed below 0.4, always an afterglow |
  | wild | Club, Psychedelic (one 2D variant) | chain stages from 30..35 %, look from contour lines on, speed from 0.5, colour field |
  | colour | Psychedelic | full class ranges, palette from 0.35 toward the colour field, afterglow up to full |
  | space | SpaceAmbient (3D, slice) | full worlds, chain A to 75 %, slow (speed below 0.35) |
  | noir | Noir | photo/relief/contour looks, photo colours, grade fade/grey/sepia |
  | photo | Galerie (2D, 3D; no tunnel) | photo and relief look only, photo colours, sharp texture, the classes before the openings |
  | full | Allround | the master ranges |

- **Scene memory** (RecentScenes). Three quarters of the preset's hand-made
  scenes by shader file (at least two left free), refused during the first
  two thirds of the search as before. It survives a restart: RenderPipeline
  stores it under `[history]` in kaleidoscope_settings.ini, per preset,
  whenever a scene has come on screen, and hands it back before the first
  pick. Labs under a lab share stay out of it.
- **Class novelty** (`classNovelty()`). The walk draws three targets in the
  music's region and takes one with odds after the class's learnt taste
  times its novelty: 0.2 for a class on screen right now, rising linearly to
  1 after six hours (and for a class never seen). The classes on screen are
  stamped with the wall clock -- a new one at once, the others every 30 s --
  into `[classSeen]`, written with the scene memory. Shared by all labs
  (a class seen in the flat lab counts for the tunnel too).

A scripted run (`KALEIDO_SEED`, `KALEIDO_FREEZE_TIME`, `KALEIDO_SCENE_SWEEP`,
`KALEIDO_FX_SWEEP`) neither reads nor writes `[history]` and `[classSeen]` and
weighs no novelty: it must come out the same every time and must not change
what the viewer's show remembers.

### Result

`python Tools/long_run_sim.py` (72 h, seed 1; "first" is the first return of
any hand-made scene, "10 %" the gap below which a tenth of the returns fall):

| preset | first return before | after | 10 % before | after | median before | after | labs after |
|---|---|---|---|---|---|---|---|
| Ambient | 75 min | 709 min | 98 min | 698 min | 338 min | 811 min | 36.4 % |
| Club | 79 | 741 | 103 | 756 | 360 | 878 | 40.8 % |
| Noir | 61 | 604 | 93 | 609 | 318 | 709 | 26.4 % |
| Psychedelic | 83 | 1031 | 112 | 1020 | 415 | 1187 | 50.7 % |
| Galerie | 61 | 619 | 104 | 605 | 358 | 708 | 21.4 % |
| SpaceAmbient | 65 | 760 | 98 | 764 | 335 | 892 | 41.5 % |
| Allround | 129 | 2128 | 121 | 2083 | 625 | 2336 | 36.4 % |

A hand-made scene now returns after ten to seventeen hours instead of one
or two (Allround: a day and a half); the labs fill their share within one or
two points. The longest stretch without a lab is 16..39 minutes.

Checked in the app (Release, offline WAV, scene changes requested through
the web remote's /api/next, the settings file saved before and restored
after): Psychedelic alternated hand-made scene and lab with every lab file
different from the one before and the walk on in every activation; the
memory was written and came back on the next start ("9 stored"); in Ambient
all 12 lab walk targets stayed inside the calm ranges.

## 16.10.2026 (2): the music's hand on the picture, measured on drone and ambient

The question (user): is the mapping of the audio features onto the motion of
the shaders -- the chain labs above all -- reasonably complete, fitting, not
intrusive, and does it suit Ambient and SpaceAmbient with drone and ambient
music?

### How it was measured

`PresetEditor --features in.wav out.csv` (new) runs a WAV through the app's
analyzer and its AudioConditioner at ~100x real time and writes the raw and
the conditioned values every 50 ms; `Tools/audio_mapping_stats.py` turns that
into rotation and flow rates, the labs' colour tempo, pulse shares, sections
per minute and a model of the labs' walk.  Material: four ambient pieces
rendered by the AdditivAmbientSynth project (Dream, Seashore, Halo,
Premonition), a Berlin-school track (BerlinSchoolGenerator, Drift) and a
psytrance track (PsytranceGenerator), plus the two bench files.  The app
itself was run with the same files (`-w`, Ambient, SpaceAmbient, Psychedelic;
the settings file saved before and restored after).

### What was wrong, and what changed

| Finding | Before | After |
|---|---|---|
| The section detector fired on the cooldown grid with ambient music: the textures drift, the 2.5-s/18-s novelty sits at the fixed 0.20, and every re-anchoring restarts its climb.  Dance music came in echo pairs (a change that builds over bars fired twice, 12 s apart). | sections per track: Dream 25, Halo 12, Premonition 15, Seashore 2, Drift 15, psytrance 18 | 2, 1, 3, 0, 7, 10 -- every real change of the psytrance track kept, the echoes gone |
| A musical trigger (section, drop, harmonic change) was a forced change: the 0.8-s fade of a key press, without the calm presets' fade floor -- with the detector above, Ambient cut its scene every 12-15 s on ambient music. | 0.8 s fades | in a calm preset (timeSceneFadeMin) a musical trigger ends a scene only after 20 s and fades like a natural change (Premonition in Ambient: 21.5 s crossfade) |
| The audio rotation was level-dominated, and the level is AGC-normalised: a drone turned at 60 % of a psytrance track. | audioPhase 0.23-0.27 rad/s (drone), 0.40 (psytrance) | 0.14-0.19, 0.38 (motion = 0.25 a + 0.75 level (0.55 + 0.45 a)) |
| musicalMode was smoothed over 0.3 s, not the ~3 s its comment said (the chroma block runs every 10-ms block): 277 shaders tint by it, the chain labs turn their colour field by up to a third of the hue circle. | lab colour field p90 31-70 deg/s | 12-23 deg/s (median 7-10 in ambient) |
| spectralSpread (0.2 s) scaled warps and whole maps in 268 shaders, five global maps of the 2D lab among them. | 1-s wobble 0.010-0.040 | 0.003-0.005 (1.5-s average in the conditioner; the analysis keeps the fast one) |
| The kick detector compares against its own running average: on an ambient piece every swell of the bass was a kick, and 1050 shaders flash with audioKick. | kick > 0.3 for 13-34 % of the time (ambient) | 0 %; the drum onsets count 35 % without a steady rhythm, in full with one (psytrance 53 -> 51 %) |
| The labs' walk never rested in calm music, and a drone piled a fifth of its targets on the first class ('none'). | ambient: a fade running 68-99 % of the time | 1.6-2.4 walks a minute, a fade 40-60 % of the time (rest 24 (1 - energy)^2 after each fade; targets reflected at the ends, wider spread in calm music); psytrance 9.7 a minute |

What fits and stays: the labs' flow (audioAdvance), rotation (audioPhase),
light (kick, swell), tint (mode, valence, the key's hue), the structure that
the walk takes from sections, drops, phrases and returning sections, the
calm-camera rules and the 3D gaze that pans on the wall clock only.  In
Ambient with a drone the walk keeps to the calmer part of its range (targets
0.05..0.29 of the class lists inside the variants' 0..0.6) -- calm music,
calm classes; the novelty memory turns them over the days.

### Not changed here: the harmonic change was dead

harmonicChange (HCDF) was the frame-to-frame step of the tonal centroid of an
already smoothed chroma, and the frames became 10-ms blocks: it peaked at
0.055 on the ambient pieces and 0.17 on the psytrance track, against
thresholds of 0.5 (scheduler cut) and 0.55 (lab walk of B or C).  Neither had
ever fired on this material.  Revived in the round below, once the scenes
that would have jumped were rebuilt.

## 16.10.2026 (3): the harmonic change revived

The user's go-ahead for the round the review above left open.

### Measuring it

`Tools/make_chord_wav.py` (new) writes a track with KNOWN chord changes: a
drone (no change), ambient chords every 8 s with 1.5-s crossfades, pop chords
every 2 s under kick and hats, a held chord with a melody over it, and a key
change; the change times go to a `.changes.txt`.  Through
`PresetEditor --features` the analyzer's numbers were matched against that
truth and against the ambient, Berlin-school and psytrance tracks.

- The HCDF now measures how far the tonal centroid moved in the last 400 ms,
  on its own chroma averaged over ~0.4 s (a kick or a passing note averages
  out, a chord stays), scaled by 3.3: a typical chord change peaks at ~0.6, a
  strong one at 1; the drone reads ~0.02.  A melody moving over a held chord
  reads about half a chord change -- harmonic movement too; this simple
  measure cannot tell the two apart.
- AudioConditioner turns it into a soft envelope for the shaders and the
  labs' walk (`audioHarmChange`): the floor 0.3 cut, peak-hold with a ~1.2-s
  release, a ~0.4-s rise.  Integrated (÷0.83) it is the harmony's advance,
  `audioHarmAdvance` (new uniform): ~1 per typical chord change, monotonic.
- audioAdvance no longer takes the harmonic change (it would have pushed the
  3D labs' flight forward on every chord).
- The scheduler cuts on harmony only above 0.95 and at most every 45 s; the
  chord changes themselves go to the scenes and the walk.
- `Kaleidoscope.exe -q` checks it end to end: a held C major stays under the
  floor (peak 0.07), the change to F# major swells to 1 and advances the
  harmony by 1.6.

| Track | walk-level swells | harmony's advance | harmonic scene cuts |
|---|---|---|---|
| ambient (4 pieces) | 0..1.1 a minute | 1.0..4.4 a minute | none |
| Berlin school | 1.5 a minute | 4.7 a minute | none |
| psytrance | 2.3 a minute | 6.4 a minute | one in six minutes |
| chord test track | 25 of 38 changes | 0.8 per change (median) | 3 of 38 changes |

### The scenes

A pulse added to a time or a phase moves the picture forward on the chord
and snaps it back as the pulse decays.  Fourteen scenes did that (or worse):
they now add the harmony's advance with half their old coefficient, so each
chord change pushes the picture on and it stays -- AfKlintSpirals,
AlcoholInkBlooms, DelaunayDiscs, DroneDepths, FidenzaStrokes,
LiquidLightShow, LouisVeilPours, SymmetryBreathing, TextureCelticKnotwork,
TextureOpWaves (the direction sways on, still within its +-0.3 rad),
TextureSpillBloom and TruchetFlowWeave; CurvedMirrorKaleido scaled the whole
frame with the pulse -- a zoom pump on every chord (rule V7d) -- and turns on
by 0.12 rad per chord instead; TextureSuminagashiDrops doubled a swirl angle
(the ink twisted and untwisted) and now advances the swirl's sway.  The
generator sources (Tools/scenegen/src) carry the same change.  The scenes
that use the envelope for light, material or an object inside the scene
keep it: HarmonicChangeLightning, Kaleidoscope, RichterSqueegee,
RustBloomRoughness, Tonnetz, WallpaperGroupCycle, the Chladni sand and the
DNA helix (they now react at all).

Checked: the 14 scenes compile with the driver; shake_scan finds nothing;
temporal_budget knows audioHarmAdvance (ceiling 1.25/s) and puts the fastest
new term at 0.12 Hz; a probe recording of TextureCelticKnotwork on the chord
track (KALEIDO_SEED, `-r`) shows the frame change rising to 1.3..2.2 grey
levels after a chord change -- the size of a photo crossfade, part of it the
key colour following the new chord -- against 0.25 in between, and no jump.
(The probe's only two jumps were a single-scene preset changing to itself on a
section and a harmonic cut: the scene re-rolls its knobs at the end of such a
fade.  A real preset always changes to another scene.)

## 16.10.2026 (4): video export on a frame clock

The user's request: pick a preset and an audio file (wav, mp3, ogg, flac),
Full HD or 4K, 24/30/60/120 fps, and get a video of the show with the audio
in it -- as fast as possible, faster than real time where it can be, and with
a frame rate that never wavers.  `Kaleidoscope.exe -e` does it
(`Source/VideoExport.{h,cpp}`); `KaleidoscopeExport.exe` (`ExportTool/`) is
the small window around it.

### Why the recorder could not do it

The recorder captures what the screen shows.  It runs in real time, and a
slow frame -- a shader compile, a model upload, the NVIDIA link stall -- is a
frame the show really lost; the recorder turns measured durations into a
constant-rate file by holding frames.  That is right for a capture and wrong
for an export, which should neither stutter nor wait for real time.

### The frame clock

Every timer that decides what is SHOWN now reads `EngineClock`
(`coreclock.h`) instead of `std::chrono::steady_clock`: the scheduler's
solo/fade clocks, the photo cross-fade (`m_timeTexture`, was a
QElapsedTimer), the parameter interpolators and the kaleidoscope's power
state machine (both via `WallClock`), the lab walk and the 3D lab's flight,
the section age, the chain carry-over between labs, idle-lab retirement and
the class memory's stamps (`EngineClock::epochSeconds()`).  Live it IS the
steady clock.  The export switches it to virtual time once
(`startVirtual()`: the time point type is steady_clock's own, and virtual
time starts at the wall-clock moment of the switch, so earlier time points
stay comparable) and sets it per frame from the frame index
(`setVirtualSeconds( k / rate )`, never by adding a rounded period: an hour at
24 fps lands on the hour to the microsecond -- a self-test checks it).  The
pipeline's frame step is fixed the same way (`RenderPipeline::M_FrameStep`;
`readFrameClock()` returns it and leaves the fps-driven cube budget alone,
which would have read a 24 fps export as a struggling GPU).  What measures
real cost stays on the steady clock: compile and upload times in the logs,
the 150-ms pacing of background builds.

So frame n shows the show at exactly n / fps.  A frame that takes long costs
render time only; nothing is dropped, nothing held.  A fade waiting for its
model, held in SHOW time live, waits in RENDER time in the export
(`RenderPipeline::awaitIncomingMesh()`).

The analyzer runs on the render thread, never started: `AudioAnalyzer::feedBlock()`
takes one 480-frame block at a time, and the export feeds the track (decoded
once by ffmpeg to 48 kHz stereo PCM, so a block is exactly 10 ms) up to each
frame's time plus 25 ms -- the analysis lag, half the 2048-sample Hann window
plus half a block.  The live latency lead (`latencyLead`, loopback and
display delays) is 0: a file has neither.

### Per-frame things that were not per-second

The engine claimed motion was wall-clock based at any frame rate.  Two places
were not, and an export at 24 fps would have shown it: the feedback trail
decays per FRAME (`Feedback.frag`: `prv * decay`), and the GPU simulations
step per frame (reaction-diffusion 6 sub-steps, fluid and smoke 1, Physarum
2).  At 24 fps trails lasted five times as long and the simulations ran at a
fifth of the speed of the 120 Hz show.  Live nothing changes; in an export
`RenderPipeline::frameStepScale()` -- live frames per frame, `M_FrameStep *
LiveRefHz` with LiveRefHz = 120, the panel the look was tuned on -- raises the
decay to that power (`decaySteps` uniform) and multiplies the simulation steps.
Shaders that feed their own previous frame back (`texPrevFrame`) cannot be
corrected from outside; the motion-blur option renders at 120 Hz anyway.

**Motion blur** runs the engine at LiveRefHz and sums the sub-frames of each
output frame into an RGBA16F target (`Engine/Accumulate.frag`) -- a 360-degree
shutter.  The audio for sub-frame k is shifted back by half the exposure, so
the mean of a frame is centred on the frame's own time.

### Getting the frames out

- The pipeline renders into an RGBA16F target of the video size (its
  "default FBO" for the export), not the window: a minimised preview must not
  stop the export, and Qt does not paint a hidden widget.  The frames are
  driven from a zero-time timer in slices of ~50 ms; the window repaints a
  letterboxed preview in between.
- `Engine/ExportYuv.frag` converts on the GPU into NV12 -- BT.709, limited
  range, one R8 image of width x 1.5 height laid out exactly as the bytes
  leave `glReadPixels` (luma rows, then interleaved chroma rows, top line
  first).  1.5 bytes per pixel cross the bus instead of 4, and the hardware
  encoders take NV12 as it is.  Before the 8-bit store, triangular dither of
  one code value (pcg3d hash): the engine renders in float, and a dark glow
  bands into rings otherwise.  It costs 6 % file size on dark ambient
  material (71.9 against 67.7 MB).
- Three pixel-pack buffers in a ring: frame n is read back at n+2; the map
  waited 0.03-0.1 ms per frame in every run.
- A writer thread owns the ffmpeg process (QProcess is not thread-safe) and
  flushes each frame before taking the next; a bounded queue of four makes
  the render loop wait for the encoder instead of dropping a frame.  ffmpeg
  muxes the ORIGINAL audio file as AAC 320k, `-shortest`, `+faststart`,
  colour tags bt709/tv.
- Cancel (Esc, the window's close button, or `quit` on stdin -- the tool's
  button) closes the pipe: a playable file with the frames so far, exit code
  1.  stdin is read with the Win32 handle, not the C runtime's `fgets`: a
  thread blocked in it holds the stream lock that the runtime takes again at
  exit.

### The encoder: three traps, measured

Measured on export material (psychedelic presets at 1080p and 4K) with
`preset_bench.py`-style runs: raw NV12 from a real export, encoded, SSIM
against the source.

1. **NVENC's constant quality was not constant.**  Without a VBV ceiling
   (`-maxrate`) it caps the bitrate at what it picks for the level: at 1080p60
   41.5 Mbit/s for h264 and 16.6 for hevc.  Material below that is unaffected
   (a calm 5-s clip: cq 19 and 25 gave 20.8 and 9.9 MB), but on the busy
   psychedelic scenes every cq landed on the same size -- h264 at cq 19 and
   21 both 103.7 MB, hevc at cq 14, 16 and 18 all 41.5 MB at SSIM 0.941.
   With a ceiling cq works: hevc cq 18 is 79.7 MB at SSIM 0.988.  The
   recorder's NVENC settings have no ceiling either and were left alone here.
2. **The ceiling sets the level.**  400 Mbit/s made a Full HD file level 6.1,
   which televisions and phones refuse; 60 Mbit/s at 1080p60 gives level 4.2,
   which everything plays.  The ceiling scales with the pixel rate to the 3/4
   power (1080p60 60M, 4K30 101M, 4K60 169M, 4K120 285M).
3. **Spatial AQ cost 30 % of the encoder's speed** (228 against 321 fps at
   1080p) for 0.002 SSIM, and p5 another 12 % over p4 for 0.001.  The
   encoder is what limits an export, so: p4, no AQ, cq 21 (h264) / 23 (hevc)
   / 30 (av1), steps of -3 / +4 for "highest" / "compact".

**Split-frame encoding** (`-split_encode_mode`, ffmpeg 7.1+, HEVC/AV1 across
several NVENC units) took 4K from 115 to 149 fps when a separate process fed
the encoder, but made the export itself SLOWER (1.8x instead of 2.1x real
time at 4K60, twice each): the GPU is rendering the next frames at the same
time.  Not used.  HEVC's size advantage is small on this material at high
quality (65 against 68 MB at the same SSIM at 1080p) -- busy, noise-like
pictures leave little to predict -- so Full HD stays on h264, which plays
everywhere; "auto" switches to hevc above Full HD, where it halves the file.

### Speed

RTX 5090, the GPU shared with another compute job (~50 % SM) throughout:

| export | real time |
|---|---|
| 1080p30, Ambient | 5.3x |
| 1080p60, Psychedelic | 4.3x |
| 1080p120, Club | 1.6x (old encoder settings) |
| 4K30, SpaceAmbient | 2.7x (old encoder settings) |
| 4K60, Club | 2.1-2.2x |
| 1080p24 with motion blur (5 sub-frames) | 1.7x |
| 4K24 with motion blur, Kettenlabor | 0.9x |

The breakdown is printed with every export ("per frame: engine, GPU wait,
encoder wait, writer busy"): at 1080p the engine itself is the limit now
(~2.9 ms a frame), at 4K the encoder.  Start-up to the first frame is ~2 s
(decode 0.1, encoder probe 0.5, all presets 0.8, the pipeline 0.7).

### Nothing written back

An export counts as a scripted run (`scriptedRun()`): the scene memory is
neither read nor written, the settings are not saved on exit, the ini stays
byte-identical (checked by hash).  It renders the look the ini describes --
reactivity, trails, mood, light show -- minus what only means something live:
no stereo packing, no adaptive render scale, no auto-config, no now-playing,
lyrics, MIDI, remote, cue port or update check.

### Found on the way

A track change in the live show called `requestSceneChange()`, which is the
viewer's "next" -- and taught the scene on screen a taste malus (and its lab
classes one) when it had been up for less than ten seconds.  Every song
change in an evening punished whatever had just come on.  A track change now
asks for the cut without the verdict (`requestSceneChange( false )`).

## 16.10.2026 (5): what never reached the analysis

The first round of the vetted idea list (docs/proposals-2026-10-16-hauptprogramm.md): the analysis was missing
things the show had long been playing.

- **Paused players.** A paused player sends loopback packets flagged SILENT, and with no stream at all WASAPI sends
  none. Both were skipped, so the features froze on the last music block: the picture kept pulsing through the
  pause, the track-change detector (0.6 s of silence; a gap up to 3 s in beat music is a DJ stop by design) never
  armed, and a recording lost the pause. SILENT packets now go in as zeros, and after 30 ms without any packet the
  capture loop feeds one silent 10-ms block per 10 ms of wall time (at most 20 at once after a stall).
- **Events of one block.** isBeat, onsetStrength and trackChange held for one 10-ms block and were overwritten by
  the next, while the blocks arrive in bursts and the render thread reads once a frame. A self-test reading every
  second block saw 1 of 8 onsets through the flag. The analyzer now counts them (beatCount, onsetCount with
  onsetPeak, trackChangeCount); AudioEventLatch in the reader turns the counters back into the frame's events --
  8 of 8. The video export reads through the same latch (several blocks per frame there).
- **5.1 and 7.1.** The capture handed a six-channel buffer to the analysis as "two channels": it read the first
  third of every block, three times too slow. AudioAnalyzer::ingest() now mixes down to stereo by the speaker mask
  (centre and surrounds at -3 dB, LFE at -6 dB -- in upmixes the kick lives there), decimates 88.2..192 kHz to
  44.1/48 kHz with a 47-tap half-band FIR (at 192 kHz the 2048-point FFT had 94-Hz bins), and makes NaN, infinity
  and samples beyond +-4 safe (one log line a minute). Stereo at 44.1/48 kHz passes untouched, so the offline
  analysis stays bit-identical; -w/-x, the timeline, the export and PulseAudio go through the same stage.
- **A conditioner gone NaN** stayed NaN: every value there is an integrator. RenderPipeline checks the results that
  integrate (AudioConditioner::firstNonFinite()) and resets the conditioner, naming the value.
- **The default device.** A stream opened with IMMDevice::Activate does not follow a new default output: after
  switching to the headphones the analysis kept capturing the (now silent) speakers, despite a comment promising
  otherwise. An IMMNotificationClient (EndpointWatcher) now asks for a reconnect; a chosen source is kept in the
  ini (audioDevice, audioDeviceInput) and, while unplugged, the default stands in until it is back.
- **MIDI.** Unbound, "next" took ANY note, with a skip's taste malus; on this machine MIDI input 0 is a software
  arpeggiator, so every arpeggio note cut the scene and taught it a dislike. Only learned notes act now, and the old
  default CC 1-3 (a keyboard's modulation wheel turned the reactivity) count only once learned (midiLearned). The
  device is chosen by name (midiDevice), and the log lists the inputs.

`Kaleidoscope.exe -q` shows each old way failing beside the new one (93 checks).

## 16.10.2026 (6): what leaves the window, and how it moves

The second round of the idea list: the output, and four places where the picture jumped.

- **Spout sends the displayed frame.** It was sent before the present pass, at the render size: without the
  brightness limiter, the blackout, the grade, the stereo packing, titles and lyrics -- a projector fed through
  Spout bypassed the photosensitivity limiter, and 'b' left the Spout picture running. It now goes out after the
  present pass from the window's framebuffer at the display size (Spout's SendFbo). Checked end to end with a
  second instance receiving it (`-i Kaleidoscope`): the sender's blackout turns the receiver's picture black.
  `spoutSource=clean` in the ini sends the raw render, for a mixer that limits on its own. The 700-ms preset
  crossfade and the text overlays are painted later by QPainter and stay out of both.
- **The cube budget.** Fixed thresholds of 45 and 57 fps kept a 50-Hz panel at half detail for good after one slow
  phase and halved a 30-Hz one from the first frame; the switch made every 2nd cube vanish in one frame.
  RenderPipeline::stepCubeBudget() compares the frame rate with the panel's (below 75 % down, above 95 % up, the
  rate capped at 72 like the adaptive resolution) and glides half the range per second; the twelve cube shaders
  shrink every 2nd cube with smoothstep(0.5, 1, cubeBudget) and skip it only once it is gone. The geom="indirect"
  scenes no longer see the budget: a cut of their vertex count drops whichever triangles atomicAdd handed out last,
  a different set every frame, and none of them costs more than ~3 ms (.screen/scene-cost.json).
- **The stage lamps.** The chase stepped a quarter turn per onset, so one corner's light fell and the next rose in
  the same frame over a large area. It now glides there (about 200 ms, at most 1.25 turns/s, unwrapped so the wrap
  never runs backwards, at most half a turn queued). The mirror-ball dots sat on the centres of a 16x9 grid; each
  is now off its centre by up to 0.2 cell and has its own size, offset plus radius inside the cell so none is cut.
- **The recorder's NVENC** got the ceiling the export found (`-rc vbr -b:v 0 -maxrate -bufsize`, 60 Mbit/s at
  1080p60, scaled with the pixel rate to the 3/4 power): without it `-cq 20` was capped by the level -- a noisy
  1080p30 test came out at 20 Mbit/s, with it at the 41 Mbit/s the quality needs.
- **The key's hue on the circle of fifths.** chromaHue was the chroma's circular mean on the chromatic circle, where
  a key's notes spread around the whole wheel: I-IV-V moved the hue by up to 150 degrees, and in broadband music
  noise steered it more than the key. Pitch class i now sits at 2*pi * (7i mod 12) / 12 (the HCDF's fifths
  projection); related keys are neighbouring colours. The self-test plays C, F and G major: 53/23/86 degrees
  (computed 50/20/80), against a spread of 164 degrees on the chromatic circle. Every key has a new colour.

Found on the way: the chroma files tones below about 400 Hz under the wrong pitch class -- a 2048-point FFT's bin
(23 Hz at 48 kHz) is wider than a semitone there, and each bin goes whole to the class of its centre frequency. A C
major triad in octave 3 came out as C#, F# and A#. That is the later idea "chroma with semitone resolution in the
bass"; the self-test plays its chords in octave 5 until then.

`Kaleidoscope.exe -q`: 98 checks.

## 16.10.2026 (7): settings that stay, a log that can be read, builds that agree

The third round of the idea list: what the program writes, and where.

- **One settings path.** `Source/SettingsFile.h` is the only place that names `kaleidoscope_settings.ini` (it was
  written out fifteen times in three spellings); `KALEIDO_SETTINGS=<file>` points a run at another file.
  perf_labs, scene_snapshots, chain_regress, chain_class_stats, fps_probe, scan_scenes and ui_smoke now give every
  instance a fresh copy (`Tools/private_settings.py`) instead of backing the user's file up and copying it back,
  which overwrote whatever a show wrote in between and left `activeConfig=_snapN` behind when a run was stopped.
  Things that belong to the program (the master catalogue for "save marked") are found from
  `SettingsFile::rootDir()`, never from the settings file's folder. `Tools/check_settings_path.py` guards it.
- **Setup changes survive.** Every exit wrote every key from memory, so a change made in the Setup tool while the
  show ran was lost without a word. Each key is now remembered as the session started (after the command line and
  the start preset); an exit writes only the keys that differ (`SettingsFile::store()`); `k`, the menu's and the
  remote's "save as default" still write all. Side effect: `-c`, `-t` and `-s` of one run no longer become the next
  run's defaults -- the test tools had been writing `activeConfig=_catalog` and the like into the user's file.
  Tried live on a copy: lyricsMode and reactivity edited in the file meanwhile survived, the trails changed through
  the remote were written, `-c Komplett -t 18091` were not.
- **A folder that cannot be written** (an installation under Program Files without admin rights: settings, taste,
  scene memory, cache, recordings all failed silently) is checked at the start with a test file and said on screen
  for 15 s (`GLwidget::notify()`, a small fading box at the bottom, sized by the output's height -- the start of the
  on-screen feedback); a failed save says it too.
- **The installer** installs per user (`PrivilegesRequired=lowest`, i.e. `%LOCALAPPDATA%\Programs`). An older
  all-users installation is found by its uninstall key and offered for removal (its uninstaller asks for admin
  rights itself), so the automatic update does not leave two installations; its settings file comes along.
  Compiled with ISCC 7; the run on an account without admin rights is still to be done by hand.
- **deploy.ps1 stops only its own** `Release\` instances before a build (by `ExecutablePath`), and none at all
  before staging: an instance running from `dist\` stops the staging with a message, every other one is only named.
  Until now every Release build ended every Kaleidoscope.exe on the machine -- a show from an installation, a genre
  run out of `dist\`.
- **The build lists.** CMakeLists.txt lacked OsdMenu, ShaderForge, ShaderForgeMain, ShaderWorker and VideoExport
  (the Linux link could not succeed since 29.09.); Kaleidoscope.pro lacked 22 files and named one deleted in July.
  Both are complete again, and `Tools/check_build_lists.py` compares them with the vcxproj in release_check and CI.
  Built under WSL (Ubuntu 22.04, Qt 6.2.4, GCC) for the first time since 31.08.: two more breaks, both fixed -- a
  `static_cast` from `void *` to a function pointer (MSVC lets it through, GCC does not; `shader_setup.cpp`) and
  `QDomDocument::ParseResult`, which only exists from Qt 6.5. The Linux build then ran `-q` with 101 of 101.
- **Error messages that arrived nowhere.** `RenderPipeline::checkGLErrors()` passed gluErrorString()'s null to
  fputs -- a crash in exactly the KALEIDO_GL_DEBUG run started to find a GL error -- and reported one error of many;
  it now drains all with code and checkpoint. The framebuffer check wrote to stdout, which the Windows-subsystem
  build has nowhere. An unreadable preset ended the program with `exit(0)` (the watchdog reads that as a normal
  end), invalid XML vanished silently; both are now skipped with a line naming file, line and column, and a preset
  without a name is named when it is left out (rigs.xml excepted).
- **The log.** 25,451 of a start log's 25,598 lines were "Expr OK" (2.1 MB with `-l`). Formulas are now counted
  per preset ("Preset Club: 411 scenes, 1373 formulas compiled") and listed only with `KALEIDO_EXPR_LOG=1` (always
  in the editor). The chain labs' pass shaders are looked up in one listing of Engine/ChainPass instead of an
  fopen() per preset entry, and NowPlaying's "Settle" wait is said once per title. A start log is now 309 lines,
  6.9 KB; all 17 preset files are read in 0.47 s -- too little to be worth the risks of loading presets lazily.

`Kaleidoscope.exe -q`: 101 checks (the settings round trip and a read-only file among them).

## 16.10.2026 (8): the GPU's time, and what to do with it

The fourth round of the idea list: what the frame costs and who pays.

- **The phone's preview.** Read synchronously at full size, mirrored and smooth-scaled twice and JPEG-encoded
  twice in the render thread, it cost 31-45 ms (median 35) every 0.9 s while the remote page was open -- four
  frames lost at 120 Hz, once a second. Now the GPU halves the frame with blits (each an exact 2x2 box), takes one
  last linear step to 360 rows flipped upright, the picture goes into a pixel-pack buffer mapped two frames later,
  and a worker encodes it and the scene's thumbnail (`GLwidget::updateRemotePreview()`): 0.33 ms median in the
  render thread, 2 ms at most. Checked against full screenshots taken at the same moments. The preview's filter
  changed, so the scene_snapshots baseline has to be rendered anew.
- **The brightness limiter** (photosensitivity: the mean may rise 2.0 luma per second) read a small mip back with
  glGetTexImage, a sync, so it ran every 3rd frame and a flash could pass two frames unlimited (33 ms at 60 Hz).
  `Engine/SafetyLimit.comp` now computes it every frame on the GPU, into the auto-exposure buffer that Present.frag
  already read (`limScale`); the CPU path remains for a driver without compute (and `KALEIDO_LIMITER_CPU=1`).
  With the rate lowered to 0.05 for the test (`KALEIDO_LIMIT_RATE`) both paths limited the same way (CPU 51 % of
  samples, minimum scale 0.915; GPU 57 %, 0.912). No fps change on the RTX 5090 (the timer holds 125); the gain
  is the frames the limiter no longer skips.
- **Frame rate independence.** Trail decay and the GPU simulations were tuned per frame at 120 Hz: a 60-Hz panel
  had trails twice as long in seconds and the sims at half speed (only the export corrected it).
  `RenderPipeline::liveFrames(dt)` now drives both everywhere: the trails' `pow(keep, n)` (in a freeze on the
  wall clock, so they still settle onto the held picture), the reaction-diffusion as whole sub-steps with the
  remainder carried (six per 120-Hz frame), the smoke likewise (its plume rises one texel a step), the fluid and
  Physarum as scaled steps (displacement, fade, injection, speed, turn, deposit and decay per step length).
  Comparison runs keep their fixed 1/120 s step, so they integrate exactly as before. Left alone: the chain labs'
  afterglow (0.78 a frame, 2.8 frames' half-life -- 23 ms against 47 ms; it would take a new uniform through the
  generator for something barely visible).
- **Rest after silence** (`idleMinutes`, Setup tool and menu) and the **sleep timer** (menu): after digital
  silence (`AudioFeatures::rawLevel`, the band mix before the gain, under 0.02: about -60 dB) the output fades out
  through the blackout slew, no scene runs and the window redraws at 5 Hz; a second of sound, a key or a remote
  action wakes it, with the scenes' clocks restarted. `idleDisplayOff` lets the display sleep (off by default:
  projectors). Tried with a WAV of 14 s silence and music: fade after the (test) 5 s, rest at 5 fps, awake 1 s
  after the music began, 120 fps again.
- **`frameDivisor=2`**: swap interval and timer at every 2nd refresh; measured 60 fps steady on the 120-Hz panel,
  one frame over 20 ms in 25 s (the start).
- **Scene cost as GPU time.** `KALEIDO_COST_LOG` charged the CPU clock around draw(), which read about 2.5 ms for
  every scene; the query ring now charges each standing frame's GPU time too (`ms_gpu` in scene-cost.json, which
  sync_complexity.py prefers). Measured (the GPU shared with another job at 93-96 %): BioluminescentNebula 24.3 ms,
  VoidLeviathan 6.6, GasGiantAtmosphere 3.2 since its rebuild, the ordinary scenes 0.73-1.0.
- **BioluminescentNebula** ran up to 25 five-octave noise sums per step: the slow warp field now has three octaves
  (plus the mean of the missing two) and is renewed every 2nd step, the veins are worked out only where the gas is
  dense enough to show them (faded in), and 46 longer steps reach the same depth as 60, each carrying 1.3 times the
  gas. 24.3 -> 11.5 ms, the frozen comparison frame 1.4 apart, same structures, 8 % darker (the auto exposure takes
  that). A per-scene resolution attribute was not built: one scene does not justify it.
- **The adaptive resolution** decides by GPU time, not fps (vsync pins the fps at the panel's rate whatever the
  headroom): it remembers each scene's GPU time per pixel and, as a scene fades in, picks the largest scale whose
  predicted time stays under 80 % of one frame at the panel's rate (or half of it with frameDivisor; the 72-fps cap
  is gone). In the middle of a scene only an emergency step (90th percentile over 1.5 frames, measured from the
  fade's end -- a fade draws two scenes). The rate is taken again when the window moves to another screen. Tried:
  the nebula unknown -> 0.9, 0.8 under load; a light scene after it -> 1.0; the nebula again -> 0.8 as it fades in,
  120 fps; the next light scene -> 1.0. (Judged by the recent frames, as first built, a heavy scene leaving made
  the light one coarse.)

`Kaleidoscope.exe -q`: 102 checks.

## 16.10.2026 (9): what the analysis hears

The fifth round of the idea list: the analysis itself, each change measured before it stayed.

- **A regression for the analysis.** `Tools/analyzer_regress.py` renders the chord test track (truth: the chord
  changes), the structure track (truth: the drops) and `Tools/broadband120.wav`, runs `PresetEditor --features`
  over them and counts what the analysis found: chord changes seen (`harm_c` over 0.5 within -0.3..+1.0 s of a
  change), false alarms in the held stretches, drops within a bar, the tempo; and every feature's mean, 90th
  percentile and movement against `Tools/analyzer_baseline.json` (`--update` writes it after a change has been
  looked at). release_check runs it as the step `analyzer`.
- **The chroma** comes from an 8192-point FFT every 4th block (5.9 Hz a bin at 48 kHz, 2048 points had 23): the
  spectrum's peaks, each spread over its pitch class with a cos^2 window 4/3 of a semitone wide, compressed with
  log(1 + 10 a) (HPCP). Under 262 Hz the 2048-point bins had fallen on only six of the twelve classes. A C-major
  triad in octave 3 now reads C, E, G (a check in `-q`, as is the I-IV-V hue now played in octave 3), and the
  broadband track reads its A major. The harmonic change was re-gained (HcdfGain 1.3, one chord a harm advance of
  1.38): 24 of 38 changes seen with 4 false alarms, against 25 with 8 before.
- **The kick tempo** is the period that explains the last twelve kick intervals as multiples of 1, 1.5, 2, 2.5, 3
  or 4 beats (`AudioAnalyzer::ioiPeriod()`: hits, a small bonus for simple multiples and for staying near the
  previous period, the period refined by least squares), not the mean of eight intervals folded one by one.
  Boom-bap at 90 had read 110, two-step at 174 read 128; now 89.98, 173.9 and the four-to-the-floor 127.9 (three
  checks in `-q`). rhythm's kick part is the share of intervals the period explains, times recency, not one minus
  their spread (a boom-bap's 1- and 1.5-beat intervals are regular, the spread said they were not). The ring is
  emptied at a song boundary.
- **Melody voicing.** The pitch confidence was a 0/1 flag smoothed into something that moved on drums too. The
  voicing is now the harmonic product spectrum's peak over its median (in log units, smoothed, on above 10, off
  below 7): drum noise 0 % voiced, a tune 100 % (a check in `-q`). `audioMelodyConf` (new, 0..1) says it to the
  shaders; the pitch holds its last voiced value instead of sinking to 0, and the melody ring the conditioner
  publishes takes `melodyNote`, the median of the last five voiced pitches, 0 when nothing is voiced.
- **Song boundaries from two sources.** A new title in the media session (SMTC; artist|title, stable for 3 s, not
  the first one seen, only while music plays) or the analysis' own silence -- whichever comes first, the other
  within 5 s is the same boundary (`GLwidget::updateSongBoundary()`, "SONG: new song (title|silence)" in the log).
  A boundary empties the kick-interval ring, starts a new epoch for the section prints (a print of the last song
  is never matched, and its slots are the first to be reused), lets the gain control settle ten times faster for
  5 s, makes the scheduler forget its section-to-scene memory (`SceneScheduler::newSong()`; a remembered section
  now also has to be younger than 8 minutes) and the scenes their per-section looks, and asks for a natural scene
  change. Crossfading DJ mixes have no silence, so the title was the only boundary they could have.
  `KALEIDO_NP_FAKE="Artist|Title@0;Artist 2|Title 2@15"` scripts a media session for the test: the change came 3 s
  after the title, the scene followed.
- **The tempo autocorrelation lives again** (the section "Autocorrelation tempo" above explains why it was dead).
  The idea list's rule: a new onset function first, and only if it separates beat from drone. SuperFlux
  (Boeck & Widmer 2013: the log spectrum's rise over the previous frame widened by a maximum over three bins)
  measured with the gate forced open, once a second, medians per piece:

  | material | old flux, peak | SuperFlux peak | prominence | kurtosis |
  |---|---|---|---|---|
  | seven beat tracks, the structure and broadband tracks | 0.139 (The Prodigy) and up | 0.36-0.62 | 6.0-9.3 | 8-36 |
  | three Noctuary ambient renders | 0.13, **0.63, 0.72** | 0.11-0.30 | 5.1-5.8 | 3.3-4.6 |
  | synthetic drone with beating partials | 0.67 | **0.79** | 4.1 | 2.4 |
  | synthetic pad / held chord | 0.13 / 0.12 | 0.13 / 0.11 | 5.9 / 7.7 | 5.7 / 7.8 |

  The old function read a clearer period in two ambient pieces than in most beat tracks. SuperFlux's peak
  separates real ambient from beat; the beating drone needs the prominence. Then Harmonic Hours showed what the
  medians hid: a steady 0.34 s modulation (176.4 BPM, minutes long) that passed peak and prominence in 27 % of its
  seconds, and on the first try lifted its arousal from 0.01 to 0.28. A tremolo is periodic too; what it is not is
  impulsive -- drum onsets are spikes, a modulation is a smooth wave -- so the kurtosis of the onset function is
  the third bar. The gate (peak >= 0.30, prominence >= 5.0, kurtosis >= 8) passes the beat tracks in 47-100 % of
  their seconds, Harmonic Hours in 3 %, the other calm material in 0-7 % (the held chord's changes are spikes).
  acConf is the share of the last ~4 s that passed, evaluated ten times a second; the lag is picked under a
  log-Gaussian prior around 120 BPM (Ellis 2007), refined by a parabola, and a different tempo has to hold for
  2 s. Where the kicks explain their own intervals their tempo stands (the two-step 174 had been pulled to 116.6).
  Tempo medians before -> after: Around the World 176.0 -> 123.3, Breathe 160.1 -> 133.2, Thunderstruck
  136.1 -> 133.9, Kadafi 156.8 -> 129.3, Ironic 170.8 -> 164.6 (still the 1.5-fold), Astrix and DMT unchanged.
  rhythm rises on the beat tracks (0.40-0.74 -> 0.75-1.0), the ambient factor falls there, the three ambient
  renders stay where they were (rhythm 0.00-0.03, ambient 0.97-1.0). `KALEIDO_AC_DEBUG=1` prints the gate's view
  once a second. Stage 3 of the idea (a predictor carrying the phase over missing beats) was not built.
- **Two things the revival brought up.** The tempo estimate is never forgotten, and its arousal term counted it
  unweighted: an ambient piece after a beat track carried that track's tempo into its arousal (the corpus ran
  each clip from a fresh start and never saw it). The term now counts as far as there is a rhythm
  (`min(1, 2 rhythm)`; Harmonic Hours ends at 0.03). And rhythm now outlives a pause by its 4 s window, so the DJ
  stop, let go after 3 s as a track end, armed again in the same silence and claimed the restart (`-q` caught it):
  a stop now needs a collapse out of running music, not out of a silence already armed.
- **Not done: the valence anchors.** The key-clarity anchors (0.652/0.805) were measured on the 80-track mood
  corpus with the old chroma; the new one reads more clarity (valence +0.07..0.15 on the synthetic tracks). The
  corpus is not scripted and not on this machine, so they stay until it is measured again -- as does arousal,
  which now reads 0.01-0.15 higher on beat music (mostly about 0.1) through the rhythm term.

`Kaleidoscope.exe -q`: 108 checks. Linux (WSL, Qt 6.2.4): built, 108 of 108.

## 16.10.2026 (10): what the show does with its time

The sixth round of the idea list: the dramaturgy -- how long a scene stays, which photo comes, what a drop cuts to,
where a change lands.

- **Weights work again.** With the no-repeat memory the probability roll and the taste hardly changed how often a
  scene came (simulated: probability 0.7 against 0.25 3.2:1 without the memory, 1.6:1 with it; the strongest like
  1.26-fold, 1.08-fold), and 397 of 401 Club entries had no solo time of their own (20..90 s). The generator now
  gives every scene of a genre preset its solo time from its show value v = interest + 0.5 (fit - 7)
  (`solo_times()` in make_genre_configs.py): the mean doubles every 1.6 points, scaled per preset so the mean over
  its entries stays 55 s -- the same number of changes an hour; the range is 0.55..1.45 of the mean (Club: 8..20 s
  for the dullest, 88..232 s for the best). `Tools/long_run_sim.py` now compares the presets as committed with
  the working tree and reports `hi/lo`, the screen time of a scene of interest >= 8 against one of interest <= 5:
  0.95..1.04 before, 2.17..2.89 now in all seven genre presets, changes per hour and the first return unchanged
  (within the simulation's noise). The scheduler stretches a stay by the learned taste as well (the square root
  of 0.3..2.5, held in 0.7..1.5; not for a walking lab, whose stay is its share of the time).
- **The photo memory.** The loader drew five photos at random and took the best fit to the mood, with no memory:
  at about 48 photos an hour from 977, a repeat in the first hour was likely and about 30 % went unseen in a day.
  The photos shown last (half the library, at most n - 2) are now passed over, and never two of one family in a
  row (the file name up to its first '-'); after fifty tries any photo will do, so a small folder never stalls.
  The start pair were directory neighbours -- one family -- and are now drawn the same way. The memory is kept in
  the settings file (`[photoHistory]`, not in a scripted run or with KALEIDO_FIXED_PHOTO). Tried with
  `KALEIDO_PHOTO_SECS=1` (a photo stays and fades one second each): 30 photos without a repeat or two of a family
  in a row, and after a restart none of those 30 again.
- **The spectacle reserve.** A drop cut to whatever the last fade's end had rolled -- on average the preset's show
  value (Club 6.7). The generator now writes `interest` into every entry (`EffectShader::interest()`); on the
  build-up edge that predicts a drop (the same one the arc direction uses), the next scene is rolled anew from the
  hand-made 2D scenes of interest >= 8 (`SceneScheduler::pickSpectacle()`): in the solo only, not in a calm preset
  (it never cuts on a drop), not over a pending section replay or a remote jump, not while a walking lab is on.
  2D only, because a 3D or mesh scene is not prebuilt and its warm-up would hold the cut back by seconds. The
  first live run showed the catch: a section change 2.5 s before the drop -- the rule in dance music -- took the
  reserved scene, and the drop then cut to whatever came next. The reserve therefore holds until its drop: the
  scene rolled after such a cut is a spectacle again ("REGIE: Spektakel bleibt ..."). A window of the predicted
  time plus 3 s ran out first -- before a song's first drop the phrase grid is not anchored, and the drop came
  some 10 s after "in 7.9 s" -- so it holds for the prediction plus one phrase, or until the drop. Run again: the
  reserve passed through a natural change (TruchetFlowWeave, 8) and the section cut (ChromeDreams, 9), and the
  drop cut to DoyleSpiralTexture (8). The price: in the stretch before a drop every change goes to a spectacle,
  at most a phrase long. In the runs before the fix the structure track's drops cut to interest 8, 7, 8 and
  8, 6; the build-up edge fires only before the first drop there -- the later ones come with build-up values of
  0.34/0.37, under the arc's 0.45.
- **Changes on the phrase.** With a confident beat (rhythm > 0.55) and a phrase grid that a drop of this song
  anchored (at most 3 minutes ago -- it drifts with the tempo error; `newSong()` forgets the anchor), a natural
  change waits until its four-beat fade ends on the next 8-bar boundary: it starts with four beats left. At most
  one phrase of waiting, then as before; forced changes are not held. A check in `-q` drives the scheduler alone
  on the virtual engine clock at 120 BPM: with the anchor 7 of 7 natural changes start four beats before the
  boundary, without it 7 of 28 (chance). Photos are left out: a 20..80 s dissolve hides where it began.
- **Noir.** The catalogue had 62 scenes with a Noir fit of 7 or more, and the Noir preset filled up with 198
  colour-graded scenes. Six new ones after the origin criteria (endless and mirrorable, the whole frame moving,
  knobs, music in the structure, fed by the photo pool), drawn in hard light and dark: NoirBlindsLight (bars of
  light through blinds, bent over drifting smoke, in wandering pools), NoirSmokeBacklight (a lamp behind smoke
  made of the photo's masses, shafts gathered along the way to the lamp), NoirKaleidoscope (the original
  kaleidoscope as a silver-gelatin print, levelled to the photo's own exposure, a raking light and a sweeping
  beam), NoirTunnel (slits of light rushing past in a black bore, a lamp at its end), NoirSearchlights (beams from
  beyond the frame crossing in haze) and NoirSilverFlow (the photo as flowing liquid silver). Noir >= 7 in the
  catalogue: 68; graded fillers in the preset: 192. Their ratings are provisional until the app renders at the
  end of the idea list; SpaceAmbient got no scenes of its own this round.
- **Test hooks:** `KALEIDO_PHOTO_SECS=<s>` (photo solo and fade), `KALEIDO_LAB_SHARE=<0..1>` (overrides the
  preset's lab share -- a lab on screen walks on and takes the drops itself, which hid every scene change in the
  first test run).

`Kaleidoscope.exe -q`: 110 checks. Linux (WSL, Qt 6.2.4): built, 110 of 110.

## 16.10.2026 (11): a show nobody watches, and the time from outside

The seventh round of the idea list: live operation -- what happens when nobody is in the room, and who keeps the
time.

- **The web remote against other web pages.** Every route answered any GET -- blackout, recording, "save as
  default", "install update" -- so a page in a browser on the same network could fire them with an `<img>` tag,
  and a domain made to resolve to this PC (DNS rebinding) could read the state and the preview. An action now
  needs the header `X-Kaleido: 1`, which a foreign page cannot send without a preflight this server never
  answers; the page sends it from `cmd()`/`setv()`, and the Android app (the same page in a WebView) with it.
  Reading (`/`, state, snapshot, scenes, thumbnails) stays open. Every request must name this PC as its Host (an
  IP address, `localhost`, the computer's name or `<name>.local`). `chain_regress.py`, the one tool that calls an
  action (`/api/screenshot`), sends the header. Tried against the running app: reading without the header 200,
  an action without it 403 and with it 200, `Host: evil.example.com` 403, IP and localhost 200.
- **A crash leaves a report.** No handler, no dump, and the second restart overwrote the log of the first crash.
  An unhandled exception now writes `crash-<time>.dmp` (dbghelp, loaded only then) beside the log and a line
  "CRASH: exception 0x... at ..." into it, and ends the process at once with the exception's code -- returning
  "continue search" could leave Windows' error dialog waiting for a click before the watchdog sees the exit.
  The newest five dumps are kept; the log keeps three generations. Tried with `KALEIDO_CRASH_TEST=1`: exit code
  0xC0000005, a 429 KB dump, the log line with the address.
- **A hang ends itself.** Under the watchdog (which sets `KALEIDO_WATCHDOG`), a thread watches the render timer's
  heartbeat (`GLwidget::M_Heartbeat`, counted in timerEvent -- a covered window does not paint, its timer still
  ticks); a minute without a tick ends the process with exit code 3 and a "HANG:" line. Not in a debugger, not
  for a video export or a compile-all run, and only after the first tick. Tried with `KALEIDO_HANG_TEST=1` and
  `KALEIDO_HANG_SECS=5`: exit code 3 after five seconds of stillness. No hang in a running show has been
  observed; this is a precaution.
- **The watchdog no longer gives up.** It stopped after five quick crashes in a row -- right for a broken
  option, wrong for an installation that has to come back. It now waits longer each time (5 s, 15 s, 45 s,
  2 min 15 s, then 5 min) and starts over after a run of a minute or more, and writes every restart to
  `watchdog.log`. Run against a stand-in that exits at once: 5, 15, 45 s, as planned. The installer's
  fullscreen shortcut started the exe directly, without the watchdog and without `-l`; it now runs
  `watchdog.ps1` through a hidden PowerShell, and a new (unticked) task starts the show at sign-in.
- **The screen by name.** `screenName=<part of its name or model>` in the ini picks the fullscreen output (an
  index moves when screens come and go); `-m` still wins. When the screen the show was on is added again -- a
  projector switched off and on, a cable re-plugged -- the show goes back to it; Windows had moved it to the
  other screen, and there it stayed. Not tried live (it would have taken over a screen of this machine).
- **The time from outside.** `AudioAnalyzer::externalBeat()`: beat cues (`/phos/beat`) and MIDI clock set tempo
  and beat phase while they come, like a tap that keeps tapping; two seconds after the last beat the analysis
  keeps the time again, and a manual tap still wins. Cues are taken the moment they arrive (`ScoreCues`' beat
  listener) -- a frame later would have cost up to 8 ms of jitter. MIDI clock (0xF8, 24 a quarter) was dropped by
  the input; now every 24th tick queues a beat with its arrival time and the tempo over the last two beats (single
  tick intervals are too coarse at millisecond resolution), the phase counts once Start (0xFA) or a song position
  (0xF2) said where the song is, Stop (0xFC) silences it. Both arrive before the sound the loopback hears:
  `clockDelay` (0.06 s) places the beat that much later; `externalClock=false` switches it off. Checks in `-q`:
  five cues at 120 BPM give 120.0 BPM and the phase within 0.002 of a beat, the analysis takes over two seconds
  after the last one, and 49 real ticks after Start give two beats with the phase at 120.0 BPM. Nothing cuts on
  the clock and nothing moves the camera; only the time.
- **The show's state over OSC.** `/scene/name`, `/preset` and `/transition/start` (name and length) when they
  change, `/blackout` (the slewed level), and `/color/mean`: the picture's mean colour from the top mip, read
  into one of two pixel-pack buffers every 6th frame while OSC is on (the buffer filled 12 frames earlier is
  mapped, so nothing waits), times the blackout, at 10 Hz, rising at most 2 of 255 a second -- the brightness
  limiter's own rule, so a light that follows the picture never flashes where the picture may not. A host name
  in `oscHost` is now looked up once at the start (it fell back to 127.0.0.1 without looking). Tried with
  `oscHost=localhost` and a listening socket: the preset, three scenes, two transitions with their lengths, the
  blackout ramping both ways, the colour at 9 Hz; `KALEIDO_OSC_LOG=1` showed a real colour read (0.36 0.51 0.43)
  and the sent one rising at 2/255 a second.

`Kaleidoscope.exe -q`: 114 checks. Linux (WSL, Qt 6.2.4): built, 114 of 114.

## 16.10.2026 (12): what the viewer sees of the machine

The eighth round of the idea list: the user's side -- what a key did, where the remote is, what the taste has
learned, where a screenshot went, how the eyes are protected.

- **A word for every key that cannot be seen.** The windowed build has no console and `-l` is for kiosks, so
  `a`, `g`, `u`, `;`/`'`, `k`, `f`, `t`, `z`/`c`/`m`, `p`, `w`, `Shift+W`, `o`, `l` and `s` answered nowhere, and
  `n` said only in the log why it did nothing under a pin or a freeze. `GLwidget::feedback()` puts a short line at
  the bottom (the notice of round 3, 2.5 s, German and English from the string table; `keyFeedback=false` keeps
  it in the log). MIDI learn shows its target until it is learned or ended, then what it learned. Tried with a new
  test hook, `KALEIDO_KEYS="6000:A;6500:G;..."`, which posts the keys to the window as Qt events at the given
  milliseconds -- inside the app only; keys simulated through the system once went to the window the user was
  working in. Every notice came, and a screenshot showed the learn target standing.
- **The key help** was a fixed 480 x 908 px box in 12 pt Consolas: off the top and bottom of a 720-pixel-high
  window (a 1080p laptop at 150 %), small on a large output. It is now sized by the window like the on-screen
  menu, measures its columns, breaks into two when one does not fit the height, and elides what is still too
  wide. Shift+W, the double-click and the menus' type-to-filter were only in the README; they are in it now.
- **Where the remote is.** Its address was in the log only, and the port may have moved away from the one asked
  for. OSD Info now lists the addresses a phone reaches it at; OK on one shows a card with the address and its QR
  code, and the first start (no settings file) shows the card by itself. The QR encoder is our own
  (`Source/QrCode.cpp`: byte mode, level M, versions 1-10, Reed-Solomon, the eight masks with the standard's
  penalty) -- no library to take in for one function. OpenCV's ArUco decoder read back all 42 codes of a sweep over
  5..210 characters and every version; its classic decoder missed one (len 165) that the other read exactly, a
  detector's weakness, not the code's. Four matrices are pinned by hash in `-q`. On this machine the first address
  was a VPN tunnel's, and the QR code carries the first: only Ethernet and Wi-Fi adapters
  count now (`QNetworkInterface::type()`, plus a list of VPN and virtual-switch names), cable first. A screenshot
  of the card decoded to the cable adapter's address with the remote's own port. The pack counts in the installer
  and the Setup tool were an older cut (79 ships, 48 objects, 715/384 MB): 77, 30 and 62 models, 733/272/542 MB.
- **The taste, visible and correctable.** `v` shows the scene's learned taste and this song's cues; the remote's
  browser shows each scene's taste and its ban (`/api/scenes` carries both). New actions in the menu (Scene) and on
  the remote: never show again (`[banned]` in the ini, per preset; the scheduler's `setBannedCallback()` keeps it
  out of every roll, while a cue, a remote jump or a section replay may still show it -- they ask by name), undo the
  favourite (taste back to 1), forget this song's cues; the banned scenes are listed in the menu and dimmed in the
  browser, and one press allows a scene again. A ban that would leave fewer than max(12, a twentieth) of the
  preset's scenes is refused. Tried through the remote: favourite, the "taste x1.25" line, undo, ban (the scene
  went away at once), unban.
- **The screenshot** was `grabFramebuffer()`: the frame rendered again with every overlay on it (the menu waited
  150 ms to get itself out of the picture), saved under a relative name in `bin\`. Now the next frame is read at
  its clean point, before any overlay, opaque, and a worker saves it as
  `Pictures\Kaleidoscope\kaleidoscope_<time>_<scene>.png`; the log line chain_regress.py reads stays.
  `/api/lastshot` serves the last one and only that one, and the remote's button waits until `/api/state` names
  the new file (the PNG takes some 2.4 s at 2880 x 1620) before it shows it. Replays go to
  `Videos\Kaleidoscope\replays`; recordings stay where the tools expect them. `KALEIDO_SHOT_OVERLAYS=1` takes the
  window as it is, for checking overlays.
- **Flashing areas.** The limiter held the frame's MEAN to its rise rate -- two halves of the picture flashing
  against each other keep the mean where it is. `SafetyLimit.comp` now also reads a finer mip (long side at most
  8: 7 x 4 cells at 1080p, 5 x 3 here at 2880 x 1620) and counts, per cell, turns of at least 0.1 in luminance
  against the way it went (a rate decaying over a second); when a quarter of the cells or more turn six times a
  second -- three flashes, the guideline's threshold -- the picture dims to 60 % (in a quarter second) and the
  mean may rise at a quarter of the rate, until the share is under 15 % (released over three seconds). A scene
  fade is one change and is not counted. Tested with a temporary 4 x 4 checkerboard swapping at 5 Hz against
  itself (removed afterwards): the mean stayed at 0.498 and the old limiter at 1.0; after a second the dimming
  ran down to 0.60. Thirty seconds of Club: 1124 measurements, never on.
- **Strict light protection** (`lightProtectionStrict`, menu and Setup tool): the mean may rise at 1.0 a second
  instead of 2.0, the stage lamps keep a steady glow instead of a beat and onset pulse, the title has no beat glow.
- **A correction to round 7.** The OSC colour was rate-limited to 2 of 255 a second, believing the limiter's 2.0
  to be on a 0..255 scale; it is 2.0 of the full range a second. A light took two minutes to come up from black.
  It now rises exactly as fast as the picture's mean may (1.0 in the strict mode).

`Kaleidoscope.exe -q`: 118 checks. Linux (WSL, Qt 6.2.4): built, 118 of 118.

## 16.10.2026 (13): the checks, and the scene plan in the real code

The ninth round of the idea list: the tools -- one check before a release that runs what there is, and the scene
plan of a long run computed by the scheduler itself instead of a Python model of it.

- **release_check runs what there is.** Two new steps in front. `selftest` runs `Kaleidoscope.exe -q` (6 s).
  `rules` runs the standing rules in seconds: `temporal_budget.py`, `check_uniform_types.py`,
  `check_enum_tables.py`, `check_strings.py` and `check_mood_tags.py` -- all of them existed and none was run by
  anything -- and `shake_scan.py` against `Tools/shake_baseline.tsv`. The shake scan had no exit code and 74 hits
  that a person had looked at; `--baseline FILE` is red only for a new SHAKE, FRAME or STEP hit (a hit is known by
  its category, file and line text, not its line number), and `--write-baseline FILE` records today's.
  `check_mood_tags.py` was red: it compared every preset with Komplett.xml and called the generator's deliberate
  variants 294 "problems" (a lab's calm flavour in Ambient, its wild one in Club), and its `--sync` would have
  rewritten generated presets by hand. It now checks the source only -- every entry of a preset that is not
  generated carries a mood (1580 entries, green). `scene_snapshots.py` keeps what a scene's run complained about
  (`Expr [`, `OpenGL ERROR`, `FAILED`) as `<scene>.err.txt`; the comparison page lists them, and the snapshot
  step counts them. `verify.ps1` takes its presets from `Presets/*.xml` (a fixed list of seven missed
  SpaceAmbient, Kettenlabor and Transformationen).
- **The scene plan in the real code.** `Tools/long_run_sim.py` modelled `pickScene` in Python ("a model, not the
  app": no music, no complexity budget, no mood), and every change to the scheduler had to be made twice. Now
  `Kaleidoscope.exe --schedule <preset> <audio.wav|silence> <hours> <out.tsv>` (`Source/ScheduleSim.cpp`) loads the
  preset without a GL context and drives `RenderPipeline::simulateFrame()` -- the mood, the timing scale, the
  AudioConditioner, `SceneScheduler::tick()` and `tickFx()`, the chain labs' walk decision -- on the virtual
  engine clock at 60 frames a second, from the analysis of a WAV (looped; its counters go on counting, every loop
  a new track) or of silence. A day of silence takes 20 seconds. Neutral where the app is personal: no taste, no
  ban, no scene memory, no settings. The walk decision needs the program in the app (`walkHost` is a uniform
  location); without GL it is read from the shader source (`EffectShader::M_Headless`, `simulateWalk()`), so a
  lab stays its full solo and takes the drops as it does on screen. The scheduler now says why a change came and
  how the next scene was chosen (`changeWhy()`: timer, music, music-calm, drop, manual; `nextHow()`: roll,
  spectacle, section, forced, step; `changeOnPhrase()`, `changeHold()`), and the plan has one line per completed
  change with the planned and the actual times.
- **`Tools/check_schedule.py`** checks the plans of the seven genre presets -- 12 hours of silence and 6 of the
  structure track each, 26 seconds -- against the rules: the solo ranges the app read are the preset's; every
  planned solo is a roll of its entry; a change by the timer comes after its solo and at most the downbeat wait
  later (33 beats where the phrase held it), a change on the phrase with four beats left; a drop cuts after 2 s
  at the earliest, a section after 4 s, in a calm preset after 20 s and never as a cut; never two labs in a row;
  the lab share within 3 points; every natural fade at least the preset's floor and the transition's minFade.
  `--audio song.wav` puts a recording in; `--quick` is release_check's step `schedule`. Each rule was made to fail
  once (labShare 1 forced through `KALEIDO_LAB_SHARE`, and lines of a plan changed by hand). `long_run_sim.py
  --real` puts the app beside its model: the model changes some 8 % less often than the app and underrates the
  favourites' screen time (hi/lo 2.2..2.9 against 2.4..3.4); where they differ, the app is right.
- **What the plan showed, and what changed in the scheduler.**
  - *A section cut before every drop.* In the structure track the analyser names a new section 2.0..2.6 s before
    each drop -- the snare roll at the end of the build-up. That cut took the scene reserved for the drop, and the
    drop cut it away after the two-second minimum, to a random scene: 1 drop cut of 144 landed on a spectacle.
    While the tension rises (buildUp > 0.45) in the last half phrase before the predicted drop, a section or a
    harmonic jump no longer cuts -- the drop does; if none comes, the scene's own time ends it ("held for the
    drop" in the log).
  - *A section right after a change.* Since round 6 a natural change waits for the phrase and its fade ends on the
    8-bar boundary -- where sections begin. The analyser names the section a fraction of a second later, and the
    scene that had come for that boundary was cut away after 2 s: 20 of 47 section cuts. A section within 4 s
    after a fade ended was answered by that fade, as one during a fade already was. Music cuts in the structure
    track: 177 before, 33 after, none sooner than 4 s; drop cuts on a spectacle: 1 of 144 before, 41 of 120 after
    (the build-up edge comes too late for the reserve before most of that track's drops).
  - *Build-ups without drops.* On the screening track (`.screen/screen.wav` from `Tools/screen.py`: a 128-BPM
    groove that turns loud for four seconds out of eight -- a build-up each time, never a drop) every
    change in Club went to a spectacle and the labs got 0 % of their 40 %: the reserve was re-armed on every
    build-up edge, and its re-roll at a fade end overwrote the lab the clock had called. A lab waiting as the next
    scene now keeps its turn (a walking lab takes a drop itself), and after two predictions without a drop the
    reserve rests until a drop comes. Labs then: 40.6 %.
  - *The lab clock ran ahead.* Every preset showed more lab time than it asked for, +0.2 to +1.8 points: a lab is
    one big step (4..10 minutes), and called the moment the labs fall behind it carried them past the share each
    time. `LabShareClock::setLabStay()` gets the labs' mean stay, and a lab is called once the labs are behind by
    0.3 of the overshoot one stay makes. 0.3, not the half that the obvious argument gives: a simulation of the
    clock alone over labs of 120..900 s centred the share within 0.1 points at 0.3 and fell short by as much at
    0.5 as the old rule overshot -- and the app at 0.5 confirmed it (-0.0..-1.6). Now -1.0..+1.7 across the 21
    plans, mostly within 0.6; the two-day check in `-q` reads 35.0 % for 35 %.
- **Not done:** taking `processBlock()` apart (the second stage of the analysis proposal). Its first stage --
  the regression against known truth -- came in round 5, and the proposal itself rated only that stage.

`Kaleidoscope.exe -q`: 121 checks (the run-up, the answered section and the resting reserve, each seen failing
with its rule switched off). Linux (WSL, Qt 6.2.4): built, 121 of 121; `--schedule` runs there too (its rolls are
glibc's).

## 17.10.2026 (14): the end of the list, and batch runs that stopped waiting

The closing work of the idea list -- the package, the catalogue, the snapshot baseline, the screening -- and what
measuring the batch tools before running them showed: most of their hours were waiting.

- **Package and installer.** `deploy.ps1` and ISCC 7: 2110 entries, ZIP 35.5 MB, setup 23.5 MB; the smoke test from
  the unpacked ZIP (Club, private settings): no FATAL, no error line. A package built during a screening carried its
  thirteen chunk presets (`ZZScreen01.xml` ...): only the presets git tracks are packaged now (without git: the tools'
  name patterns). The hidden, gitignored TestMesh bench (`ZZMesh.xml`) is no longer packaged either.
- **The catalogue as an export.** `render_catalog_images.ps1` starts the app once per scene and waits 28 s of real
  time: measured 35.4 s a scene. The scene sweep (`KALEIDO_SCENE_SWEEP`) sat in `GLwidget::draw()`, the live path,
  which a video export bypasses; it is `stepSweeps(nowMs)` now -- the wall clock live (the screening's windows are
  unchanged), the frame clock in an export. `Tools/render_catalog_export.py` renders the scenes of a chunk in one export
  (1280 x 720, 24 fps), one 27-s window each with the catalogue track (quiet to 17 s, loud after), the frames at 8, 16
  and 21 s of the window, each checked against what the sweep logged on screen; two chunks side by side. 325 scenes
  -- the 319 without images since v1.17, the six Noir scenes -- in 6.7 min, about 2 s a scene. The catalogue: 1215
  scenes, 3923 images; the PDF 512 pages (portable Chrome). Darkest of the new: TexturePhosphorTrails (mean 1.3..2.5 of
  255) and ChainHexTunnel (2.6..4) -- candidates for a brighter look, not changed.
- **The snapshot baseline in a quarter of the time.** Measured, one scene took 9 s: 1.3 s to start, 5 s for the 600
  fixed steps -- held to the panel's 120 Hz by vsync and by the render timer, whatever the scene cost --, about 3 s
  fetching the remote preview (refreshed at most every 0.9 s) until two agreed. A comparison run now waits, standing
  still, until every program it asked for is there (`shaderForgePending()`, the driver's background builds) and then
  runs its steps without vsync and with the render timer at 0; `KALEIDO_FREEZE_SHOT=<file>` makes the app read its own
  frozen frame until two reads agree, write it (640 x 360) and end. 2.5 s a scene (the 3D lab 4..6 s: its forged
  programs), and two runs of the same scenes byte-identical. Baseline `2026-10-16-base`: 1430 scenes, 0 failed, 2
  unstable, in about 30 min beside other work.
- **The screening as an export.** `screen.py` recorded in real time: 1430 scenes x 8 s, over three hours. It renders
  each chunk as an export now (1920 x 1080 at 15 fps -- the measurement looks at 160 x 90 at 5 fps), and the cost log
  (`KALEIDO_COST_LOG`) works in the export: each frame's GPU time on a query ring, charged to the standing scene. The
  export ran ahead of the ShaderForge's helper -- an eight-second window was over before ChainLab3D had its program,
  and the window was empty -- so it waits for programs still being built (`shaderForgePoll()`); a real video export
  benefits too. 1214 scenes in 21.9 min -- 13 chunks of 112 at 1.6..1.9 min -- instead of over three hours. The GPU
  time at 1920 x 1080: median 0.41 ms a frame, 90 % under 0.60 ms, the most expensive DarkNebulaBokGlobules at 5.9 ms
  (about 13 ms at the 2880 x 1620 here: such scenes rely on the adaptive resolution). 60 suspicions from a single seed;
  against the September baseline three collapses, of which two (MobiusStripRollerDrive, OrbitalDrop) were rolls -- with
  three seeds back on it -- and one, SeifertSurfaceBraidKnot, stays at a third of its structure while its frozen
  frame is unchanged: open. `sync_complexity.py` would raise 45 scenes to complexity 8 or 10 and was **not applied**:
  `complexity` is also the busyness the mood match weighs against the arousal (SceneScheduler::moodAccept()), and a
  calm but expensive scene (DarkNebulaBokGlobules 3 -> 10, MonetLilyPond 3 -> 8) would read as busy. Cost and
  busyness want two attributes; that is a decision of its own.
- **Batch tools that leave other people's work alone.** `kill_orphans.ps1` stopped every Kaleidoscope.exe and ffmpeg on
  the machine (a foreign measurement went that way on 26.09.); it takes only this repository's batch windows whose
  starting script is gone, parentless ffmpeg and headless Edge naming this repository. `render_catalog_images.ps1` and
  `screen.py` ran their windows on the user's settings file; they get a private copy now (`KALEIDO_SETTINGS`).
  `screen.py` ended every window after a fixed 240 s -- a chunk of 112 scenes measured 28; the limit follows the WAV.
- **The Noir scenes in the app.** NoirSmokeBacklight was black a frame away from its lamp (mean 3..6 of 255): a wide
  glow of the lit haze and a faint backdrop. NoirBlindsLight's pools had vanished under the exposure (stripes edge to
  edge): deep between the pools again. Ratings after the renders: BlindsLight noir 8 / interest 6, SmokeBacklight 8/5,
  Searchlights interest 6; all six at 120 fps, full resolution.
- **Five scenes whose stereo never moved.** The snapshot run's error lines named five scenes with
  GL_INVALID_OPERATION before every frame; KHR_debug: "wrong component type or count". The engine sends audioStereoL/R
  as vec3 (low, mid, high band energy of each channel), BinauralTunnel, FluidInkMandala, StereoKaleidoscope,
  StereoSearchlights and StereoWidthCanyon declared floats -- the upload was rejected, their left/right light stood at
  0. They take the bands' mean now (as StereoSpectrum does). `check_uniform_types.py` (release_check's rules) checked
  only the preset's knobs; it now checks every shader file (1843) against the call the engine uses for each of its
  91 uniforms, read from EffectShader.cpp -- red on the five, green after.
- **The scene plan on real music.** Seven tracks lie in `.screen/music` (Astrix, Daft Punk, DMT, Infected Mushroom,
  Prodigy, "Ironic", "Thunderstruck"); round 9's rules were tried on the synthetic tracks only. Club, three hours each
  looped: every rule green, the labs at 39..41 %. One rule of round 9 was wrong for real music: the spectacle reserve
  rested after two predicted drops that did not come -- and a prediction a phrase or two early is the rule in long
  build-ups, so most drops came without their reserve. It counts misses only before the song's first drop now
  (music that never drops is what it was for): Prodigy 8 -> 25 of 39 drop cuts on a spectacle, Infected Mushroom
  7 -> 11 of 15. Astrix, Daft Punk and DMT stay at 0 of 65: the phrase grid predicts the drop one phrase early, a
  section cut there takes the reserved scene, and the drop gets a rolled one. Picking a compiled spectacle at the drop
  itself, instead of reserving one ahead, is the next step -- not done here.
- **What it taught.** The catalogue, the snapshots and the screening were waiting, not computing: 28 s of real time
  per catalogue scene, the panel's 120 Hz for 600 fixed steps, a preview refreshed once a second, a three-hour
  recording. Measured first, each took a fraction: 6.7 min for 325 catalogue scenes, half an hour for 1430 snapshots,
  22 min for the screening.

`Kaleidoscope.exe -q`: 121 checks. Linux (WSL, Qt 6.2.4): built, 121 of 121.

## 17.10.2026 (15): drops on their spectacle, the GPU time as its own value, restlessness measured

- **The drop picks its scene.** The spectacle reserve rolls a scene of interest >= 8 on the build-up edge, a phrase
  grid's prediction ahead; in long build-ups the grid predicts a phrase early, a section cut there took the reserved
  scene, and the drop got a rolled one -- 0 of 65 drops of Astrix, Daft Punk and DMT on a spectacle. A drop whose next
  scene is a plain roll now picks a spectacle itself (`SceneScheduler`, "REGIE: Drop -> Spektakel"), among the scenes
  whose program is built (`setReadyCallback()`: `isCompiled()` or the prebuild cache -- a cut waiting for a compile
  would miss the beat; in the scene plan run without GL: the scenes already shown), not over a section replay, a remote
  jump or a lab, not in a calm preset. A built scene is one shown before, and the no-repeat memory holds three quarters
  of the preset (some 11 hours), so the drop's pick may bring back a spectacle shown more than 30 scenes ago
  (`DropRepeatSpan`). Club, three hours of each real track: Astrix 0 -> 23 of 26, Daft Punk 0 -> 22 of 26, DMT 0 -> 13
  of 16, Infected Mushroom 11 -> 19 of 19, Prodigy 25 -> 38 of 38; every rule green. A check in `-q` (seen failing with
  the pick off).
- **The GPU time is its own value.** `gpuMs` on every scene entry: the measured GPU time a frame at 1920 x 1080 (the
  screening's export run; median 0.43 ms, the most expensive 6.05). The adaptive resolution knew a scene only after it
  had stood once -- an unknown heavy scene came in at full scale and stuttered until the emergency step; it now starts
  from `gpuMs` scaled to the window.
- **Restlessness measured.** `complexity` is what the mood match weighs against the arousal and the stacking budget
  sums; until now hand-set (and, for a few, the GPU cost). It is measured now (`Tools/sync_scene_measures.py`, which
  replaces sync_complexity.py): the screening's frame change on 32 x 18 blocks (60 %) and the edge strength of its
  160 x 90 frames (40 %), each relative to the brightness (+ 0.10), ranked, mapped onto the distribution the hand
  values had -- so the scheduler's thresholds keep their meaning. The first try, per-pixel change and the frozen
  frame's edges, ranked every sparkle field busiest; on 32 x 18 blocks single specks average out. Checked against the
  eye on 18 scenes: a dense snowfall and a sparkle field are busy (hard white specks everywhere), a slowly turning
  tile ball, a disco floor and soft colour clouds calm. Against the hand values: Spearman 0.02 -- they measured
  nothing in particular; 763 scenes changed (LaserArena 1 -> 10, MirrorShatterExplosion 4 -> 10, Rorschach and
  GasGiantAtmosphere 10 -> 2, BioluminescentNebula 10 -> 3, which was 10 for its cost). `screen.py` writes
  `motion_coarse` and `detail_mid` per window.
- **SeifertSurfaceBraidKnot** was not a regression: it was rebuilt from 3D to 2D on 29.09., after the screening baseline
  of 03.09. (616 scenes, live recordings) -- that baseline is out of date as a whole.
- **Brighter:** TexturePhosphorTrails (a wider beam, a faint afterglow on the tube face: mean 1..2.5 of 255 -> 10..13);
  the chain scenes' neon and isoline styles hold the photo at 16 % under their lines instead of 6 / 8 % (36 scenes;
  ChainHexTunnel was near black, 3 of 255, in a roll of those styles). `gen.py` today writes the chain scenes with
  some 2400 lines of library the committed shaders do not carry, so the change went into the shaders and their
  sources directly, not through a regeneration.

- **Restlessness spread evenly.** Mapped onto the hand values' distribution, three quarters of the scenes sat on 2 and
  3, and the match against the arousal told only the extremes apart. Spread over 1..10 now, a tenth on each step (the
  stacking budget holds: two scenes at 10 and the plain overlay sum to 22 of 28). Allround, four hours each, judged
  by the measured restlessness before and after: to ambient music (arousal 0.03) the calm scenes (1..3) went from 35
  to 47 % of the screen time and the busy ones (8..10) from 21 to 10 %; to Prodigy (0.74) the busy from 30 to 35 %
  and the calm from 30 to 22 %; to Berlin-school sequences (0.45) and Astrix (0.67) little changed. A lean, not a
  filter -- the mood match never excludes a scene. Drops: 24/25, 21/25, 13/16, 16/16, 37/37 on a spectacle.
- **One seed, one measurement.** Two screening runs with the same KALEIDO_SEED differed by up to a factor of ten in a
  photo scene's brightness: the photos (and the title style, the solo times) are drawn with `qrand()`, which the Qt6
  shim took from the engine-seeded `QRandomGenerator::global()` -- KALEIDO_SEED seeded only `rand()`. With
  KALEIDO_SEED set, `qrand()` now draws from a generator of its own seeded with it (`qt6compat.h`; `rand()` and so the
  parameter rolls stay as they were; normal use stays clock-seeded). 40 scenes, three seeds, run twice: 111 of 945
  values off by more than 20 % before, 2 after (one window of PulsarJet), half bit-identical, the rest within 7 %.
- **Screening side by side.** `screen.py --jobs N` runs every chunk and seed as a job of its own (own video, log and
  settings copy), N at a time: one renders while another measures, the measurement being CPU. Three seeds of 40
  scenes: 2.0 min alone, 0.9 min with `--jobs 3`. The GPU cost (KALEIDO_COST_LOG) only with `--jobs 1` -- windows side
  by side share the GPU and inflate each other's times. The new baseline (`docs/scene-baseline.json`, 17.10.2026): all
  1215 scenes, three seeds, 39 recordings, 19 min with `--jobs 6`; the old one held 616 scenes, measured live on
  03.09. Against it only SeifertSurfaceBraidKnot had collapsed -- rebuilt from 3D to 2D on 29.09, not a defect. The
  run-to-run scatter named in the screening section above (2 % calm, 20 % busy) predates the seeded `qrand()`.

`Kaleidoscope.exe -q`: 122 checks.

## 17.10.2026 (16): the 70 flagged scenes, looked at

The new baseline flagged 70 scenes (LEER, STARR, BLITZ). Each was rendered again as a 60-fps export -- three seeds,
the screening WAV and real music (Prodigy, Infected Mushroom, Astrix) -- and looked at as a contact sheet; the
flashes were counted the way the guidelines count them (WCAG 2.3.1, ITU-R BT.1702: swings of at least 0.1 in
relative luminance, the darker state under 0.8, in a quarter of the frame, more than three flashes in any one
second), which the 5-fps BLITZ figure cannot: it is the largest single step against the typical one, and above
2.5 Hz it sees nothing.

- **The flash limiter never came on.** `SafetyLimit.comp` counted each cell's reversals as a sum decaying over a
  second and waited for six. Flashing in bursts, the way music flashes, kept that sum under six: VolumetricFire
  flashed 3.5 times a second over Infected Mushroom in all three seeds, VolcanicLightningPlume and HarmonicRings
  too, and replayed on the same frames the hazard was on in 1 % of VolumetricFire's frames and in none of the
  others' (the 16.10 test was a steady 5-Hz checkerboard, which a decaying sum does reach). Now each cell keeps the
  ages of its last eight reversals and counts those of the last second. Same music, same seeds: the highest count
  is 3.0 (the limiter comes on at six reversals, three flashes, which the guideline still allows), VolumetricFire
  and VolcanicLightningPlume 3.5 -> 3.0, HarmonicRings 3.5 -> 2.5; the dimming was on in about 0.2 % of the frames.
- **The screening's windows sat 2.6 s late in one recording.** `screen.py` estimated the offset between log and
  video from the cuts; the screening WAV's loud/quiet edge recurs every 4 s, in step with the 8-s windows, and in
  one of six recordings it won -- every window then held the first 1.6 s of the next scene and its cut, which reads
  as BLITZ. An export runs on the frame clock, so the offset is known (a scene shows 0.2 .. 1.35 s after its
  `[sweep]` line): 0.2 now. The baseline's 39 recordings were not affected (no recording with BLITZ throughout).
- **The generators' sceneTime ran hundreds of seconds below zero.** Since 03.09 a compute generator gets
  `sceneTime` as `time - m_activationTime` -- the raw time against an activation stamped in the varied time
  (`m_timeOffset + time * m_speedFactor`, an offset of up to 900 s per activation). GalaxyMergerNBody re-seeded its
  32,768 stars in every frame (`sceneTime < 0.06`) and never drew one -- two dots on a black sky in every catalogue
  image since. The generator now gets the value the render stages got (`m_lastSceneTime`). Of the 82 generators
  that read it, 32 frozen snapshots changed against the 16.10 base; all 32 were looked at: other moments of the
  same motion, nothing broken, the merging galaxies now there.
- **PillarsOfCreationFlight** had no pillars: its density (sin x cos z + sin y + 1.5 fbm) was above the threshold
  almost everywhere, the camera stood in the dust and saw a flat fog after three steps; and it flew on `time` and
  `audioAdvance`, counted since the program started, where its sine hashes lost their precision. Now columns on a
  loose lattice (thicker at the base, capped, bright rims), the camera in a lane between two rows, on the scene's
  own clocks, sine-free hashes, the newborn stars round (they were lit 0.2-unit cells: squares).
- **OrbitalSunrise** followed the engine's 280-s day cycle, night 42 % of the time -- the screening found it at
  night in every seed. The sun now rises over the scene's screen time (`sceneProgress`).
- **AccretionDiskToroidVortex** drew its square grid's corners as a tilted plate: cut at the unit circle, the gas
  thinning out toward it, and somewhat brighter (it measured 0.005 .. 0.02).
- **RunwayApproachLights** looked at a 45-m runway from 900 m with a wide lens: 64 pixels, one line of lights.
  Now 480 .. 60 m, focal 2.0, the lamps' glare 1.2 m.
- **InterstellarNebulaWarpCruise** drew concentric arcs: its protostar sparkle was sin(dot(p, k))^32 -- parallel
  planes, cut by the view into arcs -- over a fixed step without jitter. Now round cores in a half-unit cell, a
  start offset per pixel, the scene's clocks; the kick lifts the gas by 60 % (it tripled it, the whole frame
  flashing), and the background photo repeats mirrored (fract() cut it into tiles).
- **VolumetricSupernova**: its shock radius was 0.45 + mod(..., 2.4) + kick -- it snapped back every 13 s, grew
  past the camera (the whole frame white) and jumped on every kick -- and the camera rode the swell (a zoom on the
  music). Now the shell grows to inside the camera's distance and fades out before it starts anew, the camera
  stands, the front is narrow and the ejecta have contrast (fbm^3.5 was 0.09 under a shell of 1.6).
- **The auto exposure never brightened past 1.35.** On 30.08 its range was measured -- the dark catalogue wanted
  a gain of 1.8, and CfxHistogram got maxGain 1.8 -- but Present.frag clamped the gain to 0.72 .. 1.35, the range
  written before the pass ever ran, and the table had been computed from the percentiles offline, past that clamp.
  The ceiling is 1.8 now (the floor stays at 0.72: bright scenes were never the complaint). Over real music the
  dark scenes came out 1.5 times as bright in the median (linear luminance), bright ones unchanged or a little
  darker. SafetyLimit.comp measures the frame at the current gain (the previous frame's, from the shared buffer),
  so the limiter sees what the viewer sees: a swing of 0.06 in a dark scene reaches the screen as 0.11.
- **The hazard dimming comes on within a few frames** (0.06 s, was 0.25 s): with the brighter exposure,
  ShipFlyby's close pass of a pale hull measured 3.5 flashes a second -- the limiter came on at the sixth reversal,
  and the seventh still came through at full strength.
- **Twenty-four dark scenes brighter, each by its measured shortfall.** The screen's average (sRGB, after the
  auto exposure) was 0.010 .. 0.044 against a catalogue median of about 0.15; each got a factor aimed at about
  0.055 -- still night -- between 1.25 and 2.5, noted in the shader with the value it was measured at:
  LEDRainCurtain (whose tubes and drops also glow on their own now: a tube was 0.05, a drop 0.12 without its pitch
  class), MayflyStreetLamps, StarStreakTunnel, HartungScratches, KuramotoRings, SmokeColourCollide,
  WeatherRadarSweep, SpirographGearDraw, KintsugiGoldSeams, TextureDelaunayLightNet, HologramGauze,
  TextureLaserGrid, CoronagraphSpeckleField, TextureBioluminescentField, UVMineralsGlow, TextureSmokeChamber,
  TextureGlowVines, TidalDisruptionEvent, CarbonNanotubeChiralityArmchairZigzag, PlasmaFilamentTornado,
  NebulaCloud, MeshSeismograph, MeshZoetrope and EndOfTheUniverse (1.6 only: its embers are meant to be dim).
- **The limiter looks at finer cells and at quarter windows.** Its cells came from the mip whose long side is at
  most 8 texels -- 7 x 4 at 1080p, 5 x 2 at 720p (the render size, which the adaptive resolution lowers): a cell
  spanned half the picture's height, and ShipFlyby's flashing band across the middle was averaged away with the
  calm half. Now up to 16 texels (15 x 8 at 1080p, 10 x 5 at 720p, at most 128 cells). And cell by cell, concentric
  rings flash each cell at its own moment and never a quarter of the cells at once, while the quarter as a whole
  flashed 3.5 times a second (HarmonicRings): the nine quarter windows (half the width and height, at 0, 1/4 and
  1/2) now count their mean luminance's reversals too -- the way the guideline and the screening measure an area
  -- and any one of them at six switches the hazard on, next to the share of hot cells.

## 17.10.2026 (17): the whole catalogue looked at

All 1430 entries as 60-fps exports over real music (13 recordings, each its own stretch of the music, 15 min with
`--jobs 6`), flashes counted per entry, a contact sheet per entry, every sheet looked at; plus a run with the clocks
a day ahead (`--time-start 86400`, `KALEIDO_ADVANCE_START=5000`, a new test hook that adds to the music's advance and
rotation phase what a long show gathers).

- **The limiter counts in relative luminance.** It counted swings of 0.1 in display (sRGB) values; in a bright
  picture a swing of 0.1 in relative luminance is some 0.05 there, and MonarchRoostTree and a ShipFlyby flashed 3.5
  times a second under its threshold. It now decodes to relative luminance with the darker state under 0.8, the
  guideline's and the screening's own terms. Over real music, three seeds, the 30 scenes that came near: none above
  3.0 flashes a second on a quarter of the frame. On a sixteenth of it some reach 4.0 .. 4.5 (ShipFlyby,
  PrismaticLaserVault, SpectrumRadial, PulsarLighthouse) -- the strict mode's business.
- **Camera shakes on the kick** in CryosleepChamber, CyborgHiveShip and XenobiologicalBioship (random camera jumps
  on every kick), and CyberpunkSynthGridHighwayFly's camera height on the swell: removed -- the camera never follows
  the audio.
- **ChladniAcousticPlate's mode numbers** were floor(mod(...)) of the mid and bass envelopes: the figure could jump
  several times a second. They glide now (a triangle wave over the music's advance). JellyfishBioluminescenceAbyss's
  tentacle pulse no longer jumps on the kick; BioluminescentDeepSeaTrenchDive's plankton are round specks (they were
  sine stripes sweeping the frame).
- **Seven scenes collapsed after a day** (structure 3 to 15 times below the baseline): CalabiYauManifold,
  CollatzFractalTreeAbyss, DeepSpaceArmada, NoirBlindsLight, SupermassiveBlackHoleOrbit, SupernovaRemnant,
  WaxDripCascade -- their flights on `time` and `audioAdvance`; now on the scene clocks.
- **The clocks survive a long show.** `RenderPipeline::m_globaltime` was a float advanced by each frame's dt: after
  six hours at 60 Hz it ran 5 % fast, after four days in 31-ms steps at 1.9 times the speed, after eight days it
  stood still (at 120 Hz: four days). The music's accumulators likewise -- the advance at 16000 (some days of
  quiet music) took no step any more. They are doubles now (AudioFeatures carries `audioAdvanceD`,
  `audioRotPhaseD`, `harmAdvanceD` next to the floats), and every effect -- scene, overlay, transition -- sees
  `time`, `audioAdvance`, `audioPhase` and `harmAdvance` relative to its own activation plus a base rolled per
  activation (0..600 s, 0..40, 0..100 rad; hashed from the shader, the activation count and a run salt, not drawn
  with rand(), which would have shifted every parameter roll): small and exact however long the show, a fresh
  moment at every activation as before. A comparison run keeps its frozen moment. A 3D scene's generator gets the
  render stages' values. Tested: 20 scenes, two seeds, normally and with the clocks eight days ahead
  (`KALEIDO_TIME_START=691200`, `KALEIDO_ADVANCE_START=50000`): 18 identical to the last digit, two apart by a
  photo change (which follows the program clock). The doc comment of `time` in 1594 files says so now.
- **Point sprites scale with the render size.** 13 point-sprite scenes sized their sprites in pixels alone,
  tuned at 1080p; at 720p -- where the adaptive resolution goes when the GPU is busy, and where the inspection
  renders -- they covered 2.25 times the picture and ran into a flat grey sheet (SpinGlassFrustrationLattice,
  RydbergAtomQuantumSimulatorArray, WignerCrystalElectronLattice: structure 0.46 .. 0.55 of flat grey). They now
  multiply by the render height over 1080, as 32 others already did (those were left alone).
- **The atan cut, searched for everywhere.** An angle from atan() jumps by 2*pi on one half axis; every use has to
  be periodic in 2*pi there (see "Two horizons" above for the rule). Measured in the picture first: in all 1430
  catalogue windows the step across each half axis through the centre against the steps beside it -- 17 stood out,
  five of them cuts (the rest horizons, grid lines, geometry): Aperture (the photo sampled through fract(a / pi),
  and the photo does not tile), DiamondFireMacro (facet numbers floor(a / sector) jumped by N at the cut, so the
  facets there took other facets' colours), OortCloudDrift (5 * 1.7^n cells per radian: the cell grid did not
  close), HyperbolicPoincareTunnel (8 * branchP sectors, a rolled non-integer), GammaRayBurst (four noises of the
  angle itself). Then in the code, because a centre that moves (AbandonedStarGate's ring drifts with the camera)
  never sits on the picture's axes: every noise or hash whose argument holds the raw angle -- 33 scenes, 50 calls,
  the Mesh family's sky domes among them (noise of the azimuth). Those calls now blend, in a narrow wedge before the
  cut, into the same noise of a - 2*pi (`seamW()`): at the cut both sides meet exactly, the rest of the circle is
  untouched. The photo sampled by angle is mirrored round the circle instead of wrapped (Aperture,
  PhyllotaxisZoom, SporeReleaseGills); the sector and cell counts are whole numbers; GammaRayBurst samples its
  noises on a circle (cos, sin). Measured again: Aperture 12.9 -> 1.6, DiamondFireMacro 8.4 -> 0.6,
  HyperbolicPoincareTunnel 6.3 -> 1.1, OortCloudDrift 2.7 -> 1.4, GammaRayBurst 4.1 -> 2.4 (a value-noise crease
  on the vertical axis, not a step). EndOfTheUniverse's noiseP was already periodic.
- **Seven more cuts**, found with a sharper measurement: the step profile across the 33 lines around each half axis
  (a cut need not sit on the centre line to the pixel), one line on ONE half standing out while the other half is
  quiet there (a horizon or a frame edge runs through both), and only scenes that use atan -- 45 suspects, looked
  at one by one, seven of them cuts. KluverFormConstants (a fractional spiral arm count and a wrapped photo),
  SuperradiantBlackHoleBomb (a rolled azimuthal mode number: now whole), EventHorizonSingularityPlunge (an arm count
  gliding with the brightness: now a blend of the two whole counts around it; and a photo wrapped at the horizontal
  axis), KarmanVortexStreet (the angle as the dye's lateral coordinate: now mirrored, abs(a)), and the two spirals
  whose comments said the cut could not go -- LogarithmicSpiralChamberZoom and InfinitePsychedelicDrosteVortex: the
  twist glides with the music and cannot be whole, so near the cut the whole vortex is mixed into the same vortex a
  turn back (`vortexAt( a - 2 pi )`, computed only in that wedge). A mirrored photo coordinate across the angle
  needs period 1 in a / 2 pi to meet itself after a turn.
- **Flat grey where white clipped.** A new measure over the catalogue: the share of the frame that is bright,
  colourless and flat (luma over 0.42, chroma under 0.07, no gradient) -- white that clipped to one plateau, which the
  soft knee (1.0 / 1.35 = 0.74) and the auto exposure (down to 0.72 for a bright frame) turn into a flat grey. 50
  scenes had more than 8 % of it, up to 75 %. Three causes: point sprites in pixels (fixed above), a highlight
  level the clamp cut off, and the glow idiom `min( vec3( 1.3, 1.1, 1.8 ) * glow, vec3( 0.85 ) )`, which clips every
  channel to 0.85 -- neutral white -- so every bright band lost its hue. The idiom is now `glowSat( tint, glow, cap )`
  (33 calls, 22 scenes): as bright as before while faint, then toward the tint at full strength, the brightest
  channel at the cap. And 34 scenes carry a highlight gain `HiK` (0.45 .. 0.8, measured, noted with the share it
  was set against) before their final clamp: what clipped keeps its gradation, and the auto exposure lifts the frame
  back. Measured again: none above 8 % but SlotMachineReels and KluverFormConstants, whose white is the design.

## 17.10.2026 (18): the defects one by one -- liquid metal, a tune where none is heard

- **LiquidMetal was a gas.** `CfxMetalStep.comp` repelled with `( h - r ) / r` -- a stiffness of thousands per step
  -- and capped the speed at a quarter of the picture per frame, so every particle jumped past its neighbours each
  frame and the population boiled: the picture was one even, rippled sheet of noise, whatever the radii. Now the
  physics is written in canvas heights and steps: linear springs (0.08 per neighbour and unit of overlap, about six
  neighbours, stable), XSPH viscosity, a speed limit of 0.0015 heights per step, and a square metric (x times the
  canvas aspect) so drops are round on screen. The particles start in seven drops of different sizes (a sunflower
  spiral at the rest spacing, `mode == 2`); a slow flow carries them -- the curl of a periodic stream function of six
  waves, so it moves, stretches and folds the metal but never piles it up. Two lessons on the way:
  - **A pairwise attraction makes sponges.** A Lennard-Jones-like band (attract beyond the rest spacing) pulls the
    inside of a drop as well; under that tension the drops cavitated into porous clumps, and a stronger attraction
    made more holes. The cohesion is now a pull toward the neighbours' centroid: zero inside the metal, inward at its
    rim -- a surface tension that rounds the drops and puts their insides under a little pressure, so holes close.
  - **Read the old state, write the new.** The step read its neighbours from the buffer it wrote: half of them had
    already moved this step, by up to a fifth of the spacing in the flow, and that noise tore holes too. The buffer
    has two halves now (`src`, the canvas's step counter).
  The display (`LiquidMetal.frag`) no longer takes the raw density's gradient (the particles' grain) as the normal:
  the canvas gets mipmaps, the coverage is read pre-averaged (level 2.5) and averaged over a disc into a height with
  a liquid rim (square root: steep at the edge, flat on top). The reflection is the photo mirrored and magnified about
  the middle -- a flat top showed a hole cut into the background -- with a chrome horizon, a dark outline and a shadow.
  Over 3.5 minutes the drops stretch into strands, break and merge again; engine 0.75 ms a frame at 960x540.
- **A tune where the detector hears none.** The melody tracker finds a tune in 2 % (Thunderstruck) to 55 % (Ironic)
  of a track; the six melody scenes drew an empty page through the rest. After 2 s without a melody the history now
  carries the harmony: the strongest pitch class of the chroma (while it has a clear peak, over twice its mean), in
  the octave above middle C, held until another class is a quarter stronger -- two near-equal classes swapped every
  80 ms and drew needles into MelodyRidgeline. Gaps between phrases (under 2 s) stay pen-up.
- **Smaller things.** MelodyConstellation's stars x2 and struts x1.5 (the frame averaged 0.01 .. 0.04);
  MelodyRidgeline's rock photo mirrored (fract() cut a seam at x = 0.5, clamp() smeared the bottom row into
  vertical stripes) and its ridge edge covered over a pixel; TwomblyScribble's lines twice as wide on a quieter board;
  SpiralPhoto 28 .. 60 turns (40 .. 100 was finer than a pixel at 720p: grey moire); TextureIronFilings coarser
  filings, darker ink and a lamp's pool of light on the paper. The paper stays grey-ish: a frame that is mostly bright
  is pulled down by the present pass (`pow( c * 0.78, 1.25 )`, the auto exposure down to 0.72) -- by design.
- **Dark in quiet music.** The screening WAV alternates loud (drums, bass) and quiet (bed and lead at -12 dB) every
  4 s, so a scene's darkest and brightest frame tell how far it falls without drums. 36 scenes fell under a quarter
  and under 0.04; rendered again, five did so in both seeds. The causes: a floor too low under an audio term.
  VolumetricFire's fuel was 0.20 + kick, bass and drop (brightness goes with about its square: 0.02 against 0.39;
  now 0.70 .. 1.6, 0.75 of the loud brightness); HarmonicRings' rings were 0.007 wide at a third of their brightness
  without energy (now wider and at 0.7: 0.27 .. 0.38); SolidLightCones' beams 0.3 .. 1.5 (now 0.9 .. 1.4 at two
  thirds the gain, which also ends the flat white wedges of the loud half: 0.35); CoronagraphSpeckleField's halo
  0.3 .. 1.2 with the swell (now 0.6 .. 1.2: 0.45); TextureSmokeChamber's smoke and beams (0.4). FireflyForestSync's
  dark half is its own rhythm -- a flash wave, then a pause -- whose glimmer is now twice as bright.
- **Defects from the catalogue review, one by one.** CurlAurora had no curtain -- a vertical gradient times
  low-contrast noise; now three hanging sheets, each a winding lower edge with rays standing up from it, green at the
  edge, magenta toward the fringe. BioluminescentOceanSwell's water was a 16 x 10 patch whose far edge stood as a row
  of crests mid-frame with black above, and its crest glow started above what the crests ever reached: the rows now
  run out to the horizon (denser near, calmer and fogged far), the glow starts lower, plankton glints drift with the
  water, and the hue knob tints the glow instead of turning the whole sea green or purple. OpalStructuralColour's
  milky body outshone its play of colour (one grey disc): a darker body, striations of the Bragg angle inside each
  domain, and only the domains near the match flash. ClothDrape's gravity asked for a sag of 16 against a clamp of
  1.5 -- the lower fifth read one row of the photo (stripes); now about 0.08. IndustrialStation's asteroid field was
  a hard threshold of an fbm (flat tan camouflage); now round, lit rocks in two layers. GasGiantCloudCity lit its
  lightning in rectangles switched four times a second (floor( x ), floor( 4 t )), swapped its structures at every
  whole step of the drift, and hashed its noise with n = x + 57 y + 113 z, which slides the pattern along y as z
  (the flight) advances: vertical streaks; now soft storm cells on the kick, fading generations and a lattice hash.
  Starfield and KleinianLimitSetAbyss tiled the photo with fract() (rotated rectangles with hard seams; the
  Kleinian's translation fold mod( x + 1, 2 ) - 1 too): mirrored now, and Starfield's stars are sized on the screen
  (a fifth of a cell made the nearest layer's stars soft ovals a quarter of the frame wide).

## 17.10.2026 (19): spacecraft that know where their nose is, and a fleet under way

- **Which end is the nose.** Every ship scene guessed a craft's direction of travel from its longest bounding-box axis
  and never knew which end led. On this asset set that fails four ways: the sign (half the craft flew stern first,
  Fleet's engine glow sat on the bow); hulls modelled at an angle (FuelTankerStarship, GsvNoMoreMrNiceGuy,
  MerchantersLuck lie 40 .. 50 degrees off the axes and flew crabwise); generator needles -- many models carry
  hair-thin geometry (antenna wires, rigging, debris) up to the full model size, which set the box, so the "longest
  axis" became the vertical and the craft flew upright, shrunk by the false size (UnionCruiserNorway's box is
  0.32 x 1.0 x 1.0, its hull 0.30 x 0.68 x 0.98); and ties (BelterMiningTug's masts make it as tall as it is long).
  `Tools/model_orient.py` measures each craft of the ship scenes without them: the hull's direction is the main axis
  of its surface in the horizontal plane (area-weighted), the nose the narrower end -- overridden by hand where the
  aligned views (`--views`) say otherwise, with the reason -- and the size the 0.5 .. 99.5 % range of the surface.
  It writes `Engine/model_orient.tsv`; Scene3DShader hands a listed model's rotation (nose +Z, up +Y), extents and
  centre to the shaders as `meshOrient`, `meshOrientExtent`, `meshOrientCenter`, `meshOriented` (and `...2` for
  model2). Only a shader that asks for them sees them: the other families that share these models (Hologram,
  CrossSection, Assembly ...) are unchanged.
- **The fleet.** Fleet flew head-on at the camera as one lattice -- wedge, column or shell -- every craft at the same
  distance and nearly the same speed: a flat band or an even cloud of fronts. Now it is squadrons of five or six,
  each in its own formation (wedge, echelon and line abreast only for small groups, column, loose), spacing, size class
  (the leader a size up) and speed (0.82 .. 1.18), a degree or two off one course; each craft off its slot and
  keeping station with a slow drift of its own. The fleet passes the camera's shoulder and heads into the depth,
  three-quarters from behind: near squadrons sweep past, far ones creep toward the vanishing point and fade into the
  nebula before the far plane (220). Every craft wraps on its own (behind the camera, and fogged out at 205), so a
  squadron keeps its formation and the stream covers any scene length. Lighting uses world-space normals now (the
  old ones only knew the roll); the engine glow sits on the stern faces at the stern end of the hull (it lit every
  aft-facing panel: seen from behind, the whole craft glowed), and the running light is a sheen, no longer a
  flat glowing silhouette. BelterMiningTug -- a seagoing tug whose rigging reads as rain in space -- gave its Fleet
  entry to JumpDriveTug; the three fleets of 30 and 36 craft have 48.
- **Black rain.** The "needles" were more: many generated models carry hair-thin vertical threads -- strings of tiny
  triangles hanging from the hull to the model's full height, up to a quarter of the surface (UnionDestroyer),
  black lines on screen. `Tools/model_orient.py` finds them by two rules (thin geometry in a column with empty
  neighbour columns over a run; slivers chained up a column free of the body), measures the craft without them
  (area-weighted extents, and for a model with threads the hull's own height from the footprint per layer) and writes
  the share into the table; the loader (`removeThreads`, the same rules) takes them out of nine models at load, and
  ShipFlyby cuts what is left beyond the hull's height (`meshOriented` 2). A hull whose side pods pull the spread
  across turns a quarter (AsteroidTugboat flew sideways).
- **The pass covers the stay.** `sceneProgress` ran over the solo rolled from the config; the scheduler's stay is
  that over the music's timing scale (up to 2.6) and times the taste (0.7 .. 1.5) -- ShipFlyby's pass was cut off
  at 40 %, or the ship left long before the scene. `EffectShader::setStayIn()` bends the ramp at the start of each
  solo to end with it (continuously, like setClimaxIn), for every staged scene -- the docking manoeuvres too. A review
  bench with a fixed span keeps that span.
- **ShipFlyby** is a straight run at constant speed and heading -- in from the distance on one side (the course 20
  degrees toward the camera, its vanishing point off screen), past the camera, out at the other side -- the bow
  entering at one edge as the scene opens and the stern leaving the other as it closes; the side per activation.
  The ship had followed a parabola (crabbing, then turning with it) and came within 0.95 hull lengths of the lens;
  now the hull fills at most about 60 % of the frame as it leaves. **Spaceship** turned the dreadnought like a model
  on a turntable (a full turn every 14 s against a fixed sky); now the camera orbits it, about once a minute, and the
  sky and the star turn with the view. **ShipDocking**'s ship flew with its nose away from the camera while it came
  toward it (the yaw's sign), and every docking station spun about its object Z -- TradePromenadeStation's cylinder
  and MegastructureCentralHub's ring (round about Y) turned end over end. The stations take `spinAxisP` now;
  HyperspaceRelayStation (a box) no longer spins, DoubleRingResearchStation spins about its rings' axis (Z, not Y).
- **Oriented by looking (17.10.2026).** The rules (main axis, taper) were wrong for ten craft, which flew engines first.
  Each craft of the ship scenes was looked at in textured views of its craft frame -- side, top, bow and stern --
  and decided by its engines (nozzle clusters, exhaust rings, glowing cones trail), its bow (spikes, raked stems,
  bulbous bows, scoops, windshields lead) and its family (UnionDestroyer carries the stern tubes of its sister
  UnionCruiserNorway): UnionDestroyer, RouKillingTime, SuperlifterBringerOfThings, CommsRelayShip, OrbitalTugboat,
  SystemShuttleCutter and ModularContainerShip turned round (the last one's earlier hand flip was wrong: its eight
  nozzles led); LsvPureIntent, an arch, turned a quarter about its beam to fly horns first like its sister LsvZealot
  (`POSE` in the tool). Six whose bow could not be told -- AllianceCarrierEurope (nearly square), SuperlifterHeavyBurden
  (a fan at both ends), FleetReplenishmentOiler, MerchanterFinitysEnd (boxes with hatches at both ends),
  CommandCitadelStation (a station) and FuelTankerStarship (bridge windows facing aft, hull pointed forward) -- are no
  longer flybys but orbits: Spaceship.frag, the camera going round the craft.
- **FireWhirlTornado** read as a hairy spiral of the photo: the photo at 0.7 filled the frame, the flame was a faint
  tint over it, the whole palette turned with the hue knob (green fire), the noise of atan() cut a seam down the
  funnel, and a fourth power of a coarse fbm at kick x 3 lit glowing blobs over the whole frame on every beat. Now
  the noise twists in a rotating frame, the photo is a dim smoky ground, the flame saturates (a wide funnel had gone
  one flat white), the knob only tints, and the sparks rise around the funnel. **PillarHall**'s emissive bands went
  from 0.55 to 3.85 on every kick -- hard bright blocks on the near pillars; now 0.7 .. 1.2, and the pillars breathe
  4 % on the kick instead of hopping 12 %. CalabiYauManifoldKaleido looked right on a second look.
- **Mesh scenes small and dark.** Measured as object coverage (pixels over 0.06) and the object's own brightness:
  most objects were bright enough but small, in a black room. Fifteen more models of other families carry generator
  threads (ScienceLabStation 8 %, VerschlungenerKnoten 6 %, a curtain over ErstarrteWelle ...); the table lists them
  too (identity frame) with their box without the threads in the model's own frame, and the loader removes their
  threads and sizes them by that box -- every scene that fits a model by meshExtent shows it at its true size. The six
  station families fit the hull's longest side (without threads) to 44 units, centred, where they took the raw box at
  32 (a sixth of the frame's height); ShatterSculpture's statue is 42 units (was 30); MeshSeismograph 19 (was 14), its
  trace wider and found on darker paper; the Mesh* desk lamps light 0.75 .. 1.25 with the swell (were 0.45 .. 1.05).
  Hologram and ShatterSculpture turned on audioAdvance -- speeding up on every kick, against the standing rule; now on
  time alone.
- **Scenes that stood still.** EuropaChaosTerrain only let its rafts drift: now the camera glides over the ice (the
  surface slides toward it on time). HologramGauze's dancer held one pose, arms raised, for the whole scene and turned
  once in three minutes: her arms now sweep and bend about the shoulders, out of step, and she turns once a minute.
  HoneyFold (0.05 -> 0.12), EpoxyWaves (0.15 -> 0.3) and HurricaneEyeWall (0.025 -> 0.06) run faster on time.

## 17.10.2026 (20): a calmer chain lab

The 2D chain lab looked too colourful and too fast in its colours, against the rest of the program -- most of all
in relief, glowing edges and contour lines. Measured (Tools-free, a scratch script: pinned looks x two palettes x
three chains against a sample of 169 catalogue scenes), per frame over the coloured pixels: the share of coloured
pixels was 0.80 .. 1.00 (catalogue median 0.47, p90 0.94), the hue change across the picture 0.12 .. 0.53 rad per
4 px (catalogue median 0.09, p75 0.17), and over time 0.09 .. 0.22 rad per 1/6 s (median 0.07). The cause: the
colour field's hue ran through 0.9 + 0.6 turns per unit of the chain's coordinates plus a quarter turn with the
photo's luma, at 0.6 .. 0.95 saturation -- in a kaleidoscope or a tiling every cell the whole rainbow -- and the
glow of edges and contour lines was that field, or the photo, pushed to neon (`neonOf`, `glowColour`'s cubed photo
colour). Now one base hue that wanders with the music, a soft swing of +-0.13 turns over the chain (sines of the
mirrored coordinates, so it stays seamless), saturation 0.38 .. 0.6, the photo's own colours raised 1.1 instead of
1.4, and the glow drawn from the base hue with a little of the photo's own colour. In ChainLab2D, FxChain and the
tunnel (sources Tools/scenegen/src, make_chainlabtunnel.py; the frags and Engine/ChainPass regenerated): the hue
change across the picture 0.06 .. 0.16, over time 0.04 .. 0.12 -- the catalogue's range.

The 3D chain labs had the same colour field: ChainLab3D, ChainSlice3D and the five Chain3D scenes colour their
surfaces with a 2D chain projected on three planes (`chainPlane`, from Tools/scenegen/make_chains3d.py), raised the
surface colour's saturation 1.5 again, glowed their rims with `glowColour` (an fbm hue field over the screen, the
photo's colour cubed into neon) and fogged in the palette's complementary hue. Measured the same way (pinned looks x
two palettes x three worlds, and the five scenes): the hue change across the picture 0.24 .. 0.40 in the slice lab and
the Chain3D scenes, over time 0.12 .. 0.30. Now the same base hue and +-0.13 swing as the 2D lab (`chainHue0`), the
surface saturation raised 1.1, rims and fog in `calmGlow` (the base hue with a little of the surface's own colour) and
the fog a neighbour of the surfaces' hue: across the picture 0.08 .. 0.17, over time 0.07 .. 0.12. The generators were
checked first to reproduce the committed sources exactly (make_chains3d -> make_chainlab3d -> make_chainslice3d ->
gen.py, which writes the chain passes too); make_chainlab3d now cuts the lab's main at the palette helpers.

**The photo's colours back in the lines.** The first calm version gave every glowing edge, contour line and rim one
hue -- calm, but monochrome, and the photos themselves are rarely colourful; the unrest came from the neon push.
Now the glow takes the photo's own colour where the line runs: its broad colour (a coarse mip, level 5: the colour of
the region, not of every grain), at the photo's own saturation, brought up to full brightness; the chroma measured over
a brightness floor (0.25), because brought up to full brightness a dark patch's noise turns into strong random hues --
the first try without it measured more restless (edges up to 0.18 across the picture, up to 0.15 over time). Where the photo is grey, the field's hue tints the glow;
the palette knob leans it there. The photo's share in the photo and relief looks rose too (field 0.15 .. 0.6, was
0.2 .. 0.75). 2D lab measured: across the picture 0.07 .. 0.20 (edges 0.08, contour lines 0.16 .. 0.20, flow 0.14;
originally 0.15 .. 0.33, 0.12 .. 0.53, 0.32 .. 0.39), over time 0.05 .. 0.11. The 3D labs' rims and fog (`calmGlow`) the same way.

**Not washed out.** The calm palette looked washed out (asked 17.10.2026): measured as the mean saturation of the
lit pixels, 0.32 .. 0.49 against the catalogue's median 0.43 and upper quartile 0.59 (the rainbow version had
0.44 .. 0.82). Now the field at 0.55 .. 0.8 saturation, the photo's colours raised 1.35 and its tones spread (darks
a little darker, lights brighter), the relief's light stronger, the glow's photo colour a little purer: 0.39 .. 0.60
-- up to the catalogue's upper quartile -- while the hue change across the picture stays 0.06 .. 0.21.

(The numbers in this section were corrected the same day: the measuring script had read every sweep window as the
entry after it -- the sweep's scene 0 is a copy of the seeded first scene.  The ranges moved by up to 0.05; the
conclusions stand.)

## 17.10.2026 (21): the 3D chain worlds from a little further away

The 3D chain scenes often looked like random huge, alike faces (asked 17.10.2026). The camera flew a tube of radius
0.4 .. 0.55 through worlds whose cells are 1.2 .. 1.7 wide with bodies nearly as large: out of a side window (77
degrees across the flight), slanted 45 degrees down or up, or in the orthographic gaze (a cross-section sliding past)
the picture was one wall of the world; only the gaze straight ahead had depth. A probe of the lab's 9680 world
classes (one PresetEditor frame, each pixel a class: the share of points 0.6 .. 2.5 from the flight inside matter)
found the worlds porous, not full -- median 4 %, p90 28 % -- so the wall look came from fine structure seen up close
and from the gazes across the flight.

* **Scale** (`gWorldK`, 2 in all seven scenes): `fieldD` and the slice's `fieldS` evaluate `field3(p * k) / k`, the
  structures half as large around the same camera, tube and near carve. The Droste worlds centre on `gCam * k`, the
  texture's mip level follows `t * k`, and the path winds `1 / k` as far (`gPathAmp`), so the worlds round the flight
  axis (polar ring, helix, roll) keep the camera inside their rings as before.
* **A free space that is not cut** (`gThin` 0.25): toward the flight the matter is eroded, its surface moved inward by
  up to 0.25, fading out within 1.4 -- bodies near the camera thin out and open the view instead of being cut into
  broad faces by a wider tube. It ends inside the axial worlds' rings.
* **Gazes that keep the depth**: ahead-right and ahead-left at 46 degrees (were 77), slanted 29 degrees (were 45),
  floating sways +-57 degrees (turned all round), and gaze 6 is ahead-right and up -- the orthographic gaze is gone
  (`gOrtho`, `gAxis`, the slab carve). The vanishing point stays just outside the picture.
* **Depth by light**: the fog a little brighter and denser (a sparse world's void is no longer black), a lamp at
  the camera beside the key light (falling off with the distance), and broad light and shade drifting through the
  world (a slow wave over its coordinates), so a field of fine structure is no single even tone.
* **The torus wrap** (space class 10) wrapped the world round one ring at the origin; the camera starts anywhere on
  z 0 .. 500, where the wrapped world was stretched into streaks. The flight axis is folded into one ring's reach.
* **The same views in every run** (EffectShader): the camera's random stream (flight start, hold times) is seeded per
  activation from the hash the clocks use -- pinned under KALEIDO_SEED, from the clock in the show -- instead of the
  wall clock, so two shader versions can be compared picture by picture.

Measured with the old and new shaders on the same binary and camera (24 rolls of the lab, four of each other scene,
960 x 540): GPU time per frame lab 0.57 -> 0.60 ms, the others -6 .. +13 %; the temporal flicker lab 0.104 -> 0.090,
KifsTetra 0.161 -> 0.119, the others lower or within 0.004; mean luma 0.154 -> 0.156, the share of near-black pixels
0.20 -> 0.17. Looked at side by side: the walls became corridors, fields and rows with depth (OctaGyroid shows its
holes instead of one surface filling the picture, PolarTunnelBoxes rows of boxes); a few axial worlds seen from
ahead-left show mostly haze.

## 17.10.2026 (22): only the photos in the chain labs

The colours of the chain labs still did not please (asked 17.10.2026): the user's call was to drop edges, contour
lines and rims and keep only the original textures, then the relief too. One switch, `PHOTO_ONLY` in
Tools/scenegen/chain_classes.py, which gen.py writes into every shader with a chain as `const bool chainPhotoOnly`:

* 2D lab and FX chain: the look is the photo -- no selection at all, so the look's walk uniform (`walkS`) drops out
  of the program and the app no longer walks the look (EffectShader finds the stages by their uniform locations); the
  class list the app reads (`// @chainclasses styleP`) is `photo` only. The photo keeps its own colours (no 1.35 push,
  the tone spread stays), no colour field, no kick glints along the edges, no cool/warm grade with the mode.
* Tunnel: no glowing crests, no colour field, white light, the fog the photo's broad colour instead of the palette's
  complementary hue.  The wall relief stays: it is the tunnel's geometry.
* 3D lab, slice and Chain3D scenes: no glowing rims (also not the faint rim on the surface look), no relief bumps, no
  colour field on the surfaces (`chainPal()`), white light, the fog the photo's own colour; the slice without its
  contour lines (`isoP`). The photo a little brighter (x1.9 instead of x1.5): without the rims and the field, which had
  lifted dark photos, the 3D lab measured a third darker (mean luma 0.153 -> 0.104, now 0.124).

The looks' code stays; `PHOTO_ONLY = False` brings it all back. Measured on the same rolls (old | new): 2D lab hue
change across the picture 0.098 -> 0.072, over time 0.066 -> 0.042; the 3D scenes' saturation 0.38 .. 0.50 ->
0.40 .. 0.63 (the photos' own colours, where the field had greyed them).

**OctaGyroid less flat.** Asked the same day: the scene with surfaces and round holes still looked flat. It is one
gyroid sheet; even at half size its smooth saddles filled the picture. Tried on the same six rolls: the world at a
third (k 3) -- more of the same sheets; the sheet perforated by the pockets of a gyroid three times finer (where that
gyroid exceeds 0.55, `max(sheet, (g - 0.55) / (1.8 * 7.5))`) -- a coral-like lacework with the large forms kept;
both together -- too busy. Taken: the perforation at k 2. Frame-to-frame luma change 0.006 -> 0.010 (the finer
structure moving), no sparkle in consecutive frames.

**PolarTunnelBoxes less flat.** Its ring of blocks sat in a smooth cylinder (radius 3) that filled the picture with
one even wall. Now that cylinder is a shell 0.3 thick with rows of round windows (16 round, every 0.8 along the
flight, between the block rings), and a far wall at 5.5 behind it: the wall has depth and light and shade.

## 17.10.2026 (23): the 3D lab keeps off its poor worlds

The 3D lab rolls its world from three stages -- space (20 classes), fold core (22), body (22): 9680 worlds -- and many
looked poor from its camera: mostly haze, or a fine-grained carpet (surfaces turning at pixel scale everywhere).
`Tools/chain3d_world_probe.py` measures every world in one PresetEditor frame (every pixel a world): rays like the
lab's camera from twelve positions along 450 units of the flight (every other one as from a side window), 8
directions each in the gazes' cone, each with a neighbour 5 px away, marched through the lab's own `fieldK` with the
world scale, tube, thinning and near carve. Per world: `miss` (rays into the haze), `bump` (neighbour pixels on one
surface whose normals differ by more than 37 degrees: the carpet), `dark` (the worst camera position's miss share);
poorness = max(miss, bump, dark - 0.25), poor above 0.5. Checked against 24 rolls looked at by eye: the empty, dark
ones had miss 0.41 .. 0.83, the carpets bump 0.35 .. 0.75, the corridors, blob fields and crystals 0 .. 0.34. Poor:
43 % of the worlds -- above all the Kleinian folds (84 %), the hyperbolic honeycomb (79 %), the Menger sponge (63 %),
and thin bodies (pills, rings, crosses, chain links ~70 %), which the folds grind to dust.

`Engine/chain3d_worlds.tsv` holds the measure; EffectShader reads it (`worldPoorness()`): a poor roll moves one
structure stage, tried in an order hashed from the rolled knobs (no draw from the scene's stream), to the first world
clearly good (below 0.35), else the best one tried -- the first one just below 0.5 often still read as a carpet; a
structure walk draws a poor target again (a dozen times at most). ChainLab3D only (the slice cuts the worlds, its
camera does not fly them); `KALEIDO_NO_WORLD_FILTER` switches it off. Of the 24 rolls 9 were poor; their replacements
looked as good or better in all nine (the carpet of pills became bold blobs, the empty Droste a lattice of tori, the
half-space's dark chain links a dense braid).

On the way: the worlds rolled or Droste-folded round the flight axis (rolled world, log-cylindrical Droste) are
singular on it -- where the path came near the axis the march stood still and the picture sank into the haze. A core
round the axis now stays free. Written first as an if-chain on the space class, it broke the specialised variants:
the converter turns such chains into `#if` selections and took the following `return` for the last branch, so the
rolled-world variants had no return, did not compile, and the export fell back to the whole lab at 17 s a frame. Now
an expression.

The probe used to start the editor once per space class -- twenty windows in a row in front of the user. The editor's
command-line render now shows its window off the screen, without a taskbar button and without taking the focus, and
the probe is one render.

**KifsTetra calmer.** The Sierpinski tetrahedron ran four rounds of folds (sixteen-fold detail, the blocks at half
size besides) and textured every block with the chain at its own folded coordinates -- a restless rubble of striped
blocks. Compared on six rolls: three rounds (larger blocks), three rounds at a world scale of 1.4 (closer), the
texture taken before the folds (one photo laid over the whole structure), both. Taken: three rounds and the
continuous texture -- readable blocks, calm faces.

**The 36 named chain scenes too.** The fixed chains (Tools/scenegen/make_chains.py: ChainSpiralKaleido ..
ChainSquareChirikov) blend photo, relief, glowing edges and contour lines with styleP, push the photo's colours 1.4,
glint along the edges on the kick and tint with the mode. Under the same switch they show the photo in its own
colours only. Regenerated through gen.py, their frags carry the whole current chain library (the committed ones had
an older, smaller one); the compiler drops what a chain does not call.

## 17.10.2026 (24): the flat labs' chains, measured

The 2D lab (and the FX chain) rolls four stages -- A 58 classes, B 23, C 18, D 20 -- in one of 24 orders: far too
many chains to try them all. Twenty-four rolls looked at showed what a poor 2D chain is: not a carpet as in 3D but a
picture mapped to one colour -- the photo mip-averaged where the chain shrinks it many times over, or blurred where it
magnifies one patch. `Tools/chain2d_probe.py` tries 16384 random chains in four invisible PresetEditor frames: at
8 x 5 screen points the Jacobian of the chain's mirrored photo coordinate in photo pixels per screen pixel; `mush`
the share shrunk more than 8x in every direction, `flat` magnified more than 6.7x. A third measure, streaks (one
direction compressed, the other stretched), was dropped: the twelve highest chains by it were nearly all calm
flowing bands. By mush the twelve highest were 8 times poor, by flat 6 times.

Far fewer chains are poor than 3D worlds: 4.4 % above 0.7 (3D: 43 %). Mush is close to additive in the classes
(R^2 0.70; flat 0.30) and comes mostly from a few: the sphere kaleidoscope (0.76), the Apollonian inversion fold
(0.67), the theta wave (0.51), the Newton and Julia maps. `Engine/chain2d_classes.tsv` holds a ridge fit -- an
intercept and a term per class and measure -- and `EffectShader::chainPoorness()` sums it for a chain; the roll repair
and the walk of the 3D lab's world filter now serve both (stages A..D for ChainLab2D and FxChain, never onto an
opening; `KALEIDO_NO_CHAIN_FILTER`). It flags 6.3 % of the chains, about half of them poor, and catches 71 % of the
poor ones; a wrong catch only moves one stage. Over six seeds the app moved four chains.

**The 3D line checked again.** 24 fresh rolls, rolled and as the filter shows them: 11 moved, nine of them visibly
better (a black frame became a red tunnel with holes, a grey carpet coral), two about the same; but poor rolls slipped
through just below the line (0.38 .. 0.48). Over all 48 rolls looked at (19 poor, 16 good): the line 0.5 caught 12 poor
ones and moved 2 good ones, 0.4 caught 16 and moved 4 -- a good world moved only meets another good one. The 3D line is
now 0.4 (`WorldLine`, clearly good below 0.3), 57 % of the worlds above it; the flat labs keep 0.5.

**Leftovers.** The tunnel lab needs no chain filter: the classes that make mush (sphere kaleidoscope, theta wave,
Newton and Julia maps, Apollonian inversion fold) are already left out of it for speed, and its highest possible
prediction is 0.38. Of the three 3D rolls that still looked poor after the filter, one was the filter's (now caught
at 0.4), one a bubbly Mandelbulb carpet at 0.38 (left: a lower line moves too many good worlds), and one a world with
structure under a dark photo -- with only the photo's own colours nothing lifted it any more. The 3D scenes now bring
a dark photo's mean brightness (its last mip) toward 0.32, at most 1.8 times (`photoGain()`): the darkest of 24 fresh
rolls 0.067 -> 0.086 mean luma, the mean 0.175 -> 0.178.

## 17.10.2026 (25): a scene with a memory of its own

The 200 abstract ideas (`docs/proposals-2026-10-17-abstrakt-200.md`) bring whole families that a pure function of
the time cannot draw: cellular automata, pattern-forming equations (Swift-Hohenberg, Gray-Scott on a flow, Cahn-
Hilliard), a photo carried by a flow. Each needs the field of the frame before. The engine now gives every scene one,
by convention in the scene itself and with no new file:

- A scene that declares `uniform sampler2D texState; uniform int statePass;` (and optionally `stateFrame`,
  `stateRes`) and a line `// @state W H RATE` -- the field's size and its steps per second -- carries a state.
  `EffectShader::usesState()` finds the two uniforms per program and reads the line (no size: half the render size).
- `EffectShader::stepState()` keeps a ping-pong pair of RGBA16F textures (repeat, linear) and, before the frame,
  draws the same program into the newer one with `statePass = 1`, reading the older one on unit 37: as many steps as
  `RATE` asks for since the last frame, counted on `sceneTime` (in a video export the frame clock), at most eight a
  frame, none while the picture is frozen, none to catch up after a pause. Then the frame is drawn as always with
  `statePass = 0` and `texState` holding the newest field. Both passes see the same uniforms, photos and music, so a
  step reacts to the beat the frame shows.
- `stateFrame` counts the steps since the activation; 0 is the seed. A scene activation (`resetParameters()`), a
  new program or a new size seeds the field anew.
- The scene generator writes the uniforms and the line from `//@state W H RATE` in the source; the shader's main
  branches on `statePass` (`Tools/scenegen/src/CyclicAutomatonSpirals.glsl` is the pattern). The PresetEditor's
  preview runs no state pass: such scenes are judged in app renders.

**The first: CyclicAutomatonSpirals.** Griffeath's cyclic automaton on a 480 x 270 field at 120 steps a second: a
cell moves on to the next of N states when enough neighbours already show it. Six classic rules (Mirek's
Cellebration: Griffeath's demons, cyclic spirals R3/T5/C8, perfect spirals, squarish spirals, 313, turbulent phase);
`ruleP` picks the first, a new section of the music the next. The state is kept as an angle (cosine, sine), so
the linear filter draws the field smoothly between the cells and a blend shows as a darker seam. Two traps on the way:
a per-cell random pace (cells skipping steps on their own) broke every spiral into noise -- the pace is now one global
choice per step (`audioSwell` how many are taken); and the first R1/T3/C8 and N14 rules stayed noise for eight
seconds -- the cyclic-spirals rule is the R3/T5 one of the literature, and demons need their seconds (they form by
the third). Onsets seed a small noise patch every 40 steps, where new cores grow; the phase reads a ring through the
photo and lights the band fronts, the kick flashes the fresh ones.

## 17.10.2026 (26): the automata (ideas 38-50)

Thirteen scenes of family C, all but one on the state pass: GreenbergHastingsWaves (an excitable medium; a disc of
radius 2 gives round fronts, onsets set a short arc whose open ends curl into a pair of spirals), LangtonTurmiteHighways
(hundreds of generalised ants, gathered: a cell asks its four neighbours whose ant steps onto it),
ElementaryRuleTapestry (a ring buffer of rows, the newest on the centre line, `stateFrac` moving the rows between
two steps), WireworldCircuitry (the photo's contour lines as one-cell traces), BriansBrainStorm, LifeRuleMorph (eight
Life-like rules, a section the next), SandpileIdentityMandala, MargolusBilliardGas, ForestFireCriticality,
QuantumWalkCones, KPZGrowthFronts (ballistic deposition, every cell carrying its column's height), RotorRouterAggregate
and TilingSubstitutionAutomaton (stateless: chair and table substitution, one zoom octave one generation).

**The state pass grew three things.** `// @state W H RATE 32` asks for RGBA32F (chip counts, unwrapped heights);
`stateFrac` is the share of the next step already due; and the cap on steps a frame follows the field's size (8 for
512K cells, up to 64 for a small field: the sandpile runs 960 steps a second on 144 x 144). The generator adds a
small library to every state scene (`STATE_LIB`: `stWrap`, `stAt`, `stRand` per cell and step, `stRandStep`,
`stLin`, two Laplacians, `stView`).

**`%` on a negative int is undefined in GLSL.** The first `stAt()` wrapped with `(ip % s + s) % s`; on NVIDIA
`-1 % 200` read a cell in the middle of the field, so every scene read wrong neighbours along two field edges. It
showed only in the rotor-router: one source grew four discs, the ones at the half-period offsets reached the
probe cell that stops the feed, and the disc stalled at radius 17. A numpy port of the shader grew one disc; a probe
scene that spreads a marker with `(ip + d + s) % s` (no negative operand) was right -- the difference was the
operand's sign. `stWrap()` now wraps with floor.

**The sandpile identity by burning.** The burning configuration (one grain per edge to the sink) is equivalent to
adding nothing, so (k beta) stabilised is the identity once it is recurrent -- and by Dhar's burning test a
stabilisation in which every cell has toppled ends recurrent. The scene feeds four betas a step at the border until
the centre cell (the last to burn) has toppled, then lets the pile settle; a drop or a phrase start adds one beta
more, every cell topples exactly once, and the same mandala forms again. A fixed span of 3 max(w, h) steps had left
the middle empty.

**The reversible gas runs back exactly.** The Margolus block map (two balls on a diagonal mirrored left-right, every
other block turned 180 degrees) is an involution, so the backward run applies it with the partitions in reverse
order; the light and the dark half of the photo, as two gases, mix and un-mix to the step. No audio may touch the
dynamics here -- a skipped step forward and a taken one backward would break it.

**Looking at state scenes.** Their first seconds differ from their minutes, and the screening WAV's loud/quiet cycle
makes the scheduler cut away inside a window (the sweep puts the scene back once, which reseeds the field). The
review sheets now take their frames only where the wanted scene is on screen (the `[shown]` lines) and mark the
coverage.

## 17.10.2026 (27): pattern formation (ideas 19-36)

Eighteen scenes of family B. Thirteen integrate a pattern-forming equation on the state pass, explicitly, with the
time step held under the stability limit of their stiffest term:
- **Fourth order:** the 13-point biharmonic, at dt 0.006..0.01 with cells 0.75..0.8 apart. These are
  SwiftHohenbergMorph, KuramotoSivashinskyCells (damped, on a 32-bit field, so the mean stays bounded),
  CahnHilliardQuench and PhaseFieldCrystalGrains (the hexagonal Swift-Hohenberg phase grown from turned seeds, with
  a heat band that melts and refreezes it).
- **Second order:** a 5- or 9-point Laplacian, with 8 D dt < 2. These are GinzburgLandauDefects (complex,
  (1 + a^2) dt < 0.5), the Brusselator in TuringHopfBlinkers, FitzHugh-Nagumo in BistableLabyrinths, Gray-Scott in
  PhotoGuidedTuringStripes and ReactionDiffusionOnFlow, and RockPaperScissorsSpirals.
- **Spins and oscillators:** IsingCriticalField (checkerboard Metropolis), XYVortexGas (Langevin) and
  ChemicalOscillatorLattice (nonlocal Kuramoto sampled on two rings).
- **WilliamsDomainsElectroconvection:** an anisotropic Swift-Hohenberg whose square of the directional operator is
  taken one step behind: D u is kept in a channel, and D^2 u is D of the last step's D u.

Five are stateless: GranularOscillons (jittered round grains on a pattern that climbs the stability diagram with
the bass), FaradayQuasipattern (8-, 10- or 12-fold plane-wave sums, crossfaded on a section), SmecticFocalConicMosaic,
HerringboneWrinkles and the display halves of the rest.

**What the first renders showed.**
- **Turing-Hopf strobed.** At the codimension-two point the Hopf mode won: the whole field blinked at once, which is
  a strobe. With D_v / D_u = 5 the Turing threshold sits below the Hopf point; the spots form first and blink locally.
- **Rock-paper-scissors coexisted.** With equal growth and predation the species settled into a uniform blend.
  Predation 2.5 times the growth gives the heteroclinic cycle, and big spirals.
- **The photo-guided stripes were spots.** Their Gray-Scott pair lay in the spot regime. The knob now runs from maze
  (F 0.029, k 0.057) to coral (F 0.0545, k 0.062), and the stripes lie along the photo's contours.
- **The XY field was invisible as a displacement.** Seen between crossed polarisers -- sin^2(2 (theta - phi)), the
  Schlieren texture of a nematic -- every vortex sprouts four dark brushes.
- **Herringbone turned on the stereo width.** That is a rotation on the audio, which the standing rule forbids. The
  direction now swings on time only; the compression follows the swell, not the level.

## 17.10.2026 (28): the photo as a fluid (ideas 1-18)

Eighteen scenes of family A. Twelve carry the photo on the state pass. The state library gained three helpers for
that:
- `stCarry(vel, fresh)` moves the field one step.
- `stUV(cc)` gives the photo coordinate the frame shows.
- `stLod(cc, cellPx)` gives the mip level that matches the map's stretching, so strands finer than a pixel are
  averaged rather than aliased.

The field holds the **displacement** D = uv - x / H of the photo coordinate, not uv itself. uv is not periodic: the
plain coordinate jumps by the field's width at the torus seam, and linear filtering across the seam mixed the two
sides. D is periodic, and the semi-Lagrangian step becomes D_new(x) = D(x - v) - v / H. A small `fresh` share pulls
D back toward zero every step, so a fresh photo flows back in and the strands never fold finer than the screen can
show.

The velocity fields are kinematic, written down rather than solved:
- **Stirring:** rods dragging the fluid along a braid, a circle or a figure eight (ChaoticTaffyMixer); a hierarchy
  of 32 point vortices that merge pairwise in five stages (VortexMergerCascade). Each group's centre is the mean of
  its first-generation vortices, so a merged pair starts the next stage where it ended, and the sign belongs to the
  hierarchy's half, so no merge flips a vortex.
- **Gyres and jets:** the double gyre, mirrored into a field that holds exactly one period (LagrangianRidgeTransport);
  meandering Kolmogorov jets (KolmogorovMeanders); zonal jets with vortex chains (ZonalJetBelts); a sliding cellular
  lattice (CellularFlowMixing).
- **Eddies and patches:** a curl-noise eddy field with a marker for two water masses (SurfaceQGFronts); slow modes
  for elastic turbulence (ElasticTurbulenceRibbons); rotating elliptical patches whose marker re-forms slowly
  (ContourDynamicsPatches).

Every structural switch crossfades two velocity fields: a section over its first four seconds, a change of harmony
over the fractional part of `audioHarmAdvance`.

Six scenes are stateless:
- **ArnoldCatRecurrence:** the cat map on 89, 144 or 377 tiles, whose periods are 22, 12 and 14. One period lasts
  one phrase, so the photo is whole on the phrase's one. The partial step slides whole rows of tiles in the map's
  two shears, so every step lands exactly on the integer map.
- **BakerHorseshoeFold:** each change of harmony rolls one more tent-baker fold across the frame.
- **ReversibleStokesUnmix:** the Couette profile, wound out and back over a phrase.
- **RotatingPolygonVortex:** a lattice of polygon vortices, gaining a corner with each change of harmony.
- **OrszagTangPlasma:** field lines and current sheets of a bent Orszag-Tang potential.
- **RichtmyerMeshkovSpikes:** layered interfaces hit by a shock every phrase.
- **DoubleDiffusiveStaircase:** a mirrored staircase with swaying fingers.

**RayleighTaylorBlend began as a state scene.** Rising and sinking columns carried a marker, but the closed cells
only wound each tile up: marbled squares, no plumes. It is now procedural: the tips travel over the phrase, and
the fluid around each tip rolls up, the two sides turning opposite ways, into mushroom caps.

## 17.10.2026 (29): chaos fields and fractals (ideas 51-68)

Eighteen scenes of family D. Every pixel runs its own orbit, so the cost lay in the iteration counts. All
eighteen stayed below 0.6 ms of GPU time in the 960 x 540 export: the double pendulum takes 250 semi-implicit
steps, the magnetic pendulum 160, Henon-Heiles 260 leapfrog steps, Mandelbrot 200 iterations. The scenes:
- **Flip times and basins:** DoublePendulumFlipFractal (time to the first flip over the square of starting angles),
  MagneticPendulumBasins (3..6 magnets, one more per change of harmony, growing in), HenonHeilesEscape (Wada basins
  of the three exits).
- **Rotation numbers:** ArnoldTonguesField, CircleMapDevilStairs.
- **Orbit statistics:** LogisticVeils (orbit density per column), StandardMapIslands (the orbit's mean and spread
  split islands from the chaotic sea), DeJongNebula.
- **Fractal sets:** OrbitTrapStalks (Pickover stalks), NewtonRelaxedBloom, KleinianQuasiFuchsian (a Schottky
  necklace pushed off orthogonality), MandelbrotCardioidUnwrap.
- **Tilings and cascades:** RauzyFractalTiles, TwinDragonRepTile, FordCirclesCascade.
- **Flows, billiards, mirrors:** LyapunovVectorHair (finite-time Cauchy-Green eigenvectors), HyperbolicBilliardChaos
  (stadium and Sinai), ChaoticScatteringFractal (three or four mirror spheres, the photo as sky).

**Membership by bounded search.** The Rauzy fractal and the twin dragon are sets of digit expansions. A greedy
descent (take the nearest preimage) classified only 84 % of sampled points right; a depth-first search that keeps
every preimage inside the bounding disc, capped at 120 nodes, got 99 %. The Rauzy fractal tiles the plane by the
projected lattice pi(e1 - e2), pi(e1 - e3) of the tribonacci matrix. Tested on 300 000 sampled points, the overlap
was 0.3 %; 1 - alpha and other guesses overlapped 29 %. The twin dragon tiles by the Gaussian integers, and its
supertiles follow from the parity of the coordinates (g = b g1 + d).

**A seamless infinite zoom from the modular group.** FordCirclesCascade flows toward the golden ratio along the
one-parameter group of z -> (2z + 1) / (z + 1): in u = (z - phi) / (z - phi') the map is u -> phi^-4 u, so a
fraction t of it is u -> phi^(-4t) u. After t = 1 the picture is the same set of circles again, exactly. A pixel's
Ford circle comes from the reduction to the fundamental domain: the circle of the cusp M^-1(infinity) holds the
point when Im(M z) > 1.

**The first renders' lessons.**
- **Windows too timid:** the logistic window lay in the period doublings (four lines); the tongues' window sat on the
  0/1 tongue (one diamond); the standard map's kick was below the break-up of the last tori.
- **Photo too dark:** basins coloured through a dark photo's palette did not part. The basin's tone is now taken
  at full brightness, and every basin gets its own level.
- **Branch derivatives:** the derivatives for the basin edges are taken outside the branches (see
  fwidth-divergent-branch-grid-lines).

## 17.10.2026 (30): waves, modes, interference (ideas 69-86)

Eighteen stateless scenes of family E, each the analytic or semi-analytic field of a wave phenomenon.
- **Propagated fields:** TalbotCarpet (a slit grating's Fresnel series, 25 orders), BeamformingLobes (a steered
  phased array), AiryBeamCurves (accelerating Airy lobes healing behind a drifting obstacle), BesselRingWeave.
- **Modes:** QuantumScarBilliard (Berry random waves plus a scar along one of four stadium orbits),
  SphericalHarmonicBloom (a raymarched sphere swollen by a Y_lm-like pattern, the mode crossfading on a change of
  harmony), StandingWaveMosaic (4 to 12 standing directions cut into tile levels), ScarredMembraneDrum (an
  irregular rim, modes chosen by the smoothed melody).
- **Water and surfaces:** SolitonGasCollisions (KP-like line solitons with raised crossings), CnoidalWaveLattice,
  DispersiveWaveTrain (Kelvin wakes), WaveTurbulenceSpectrum (the analyser's 32 bands as eight octaves of capillary
  ripples).
- **Quantum:** WavePacketKaleido (free Schroedinger packets with their mirror images in a kaleidoscope's wedge),
  QuantumRevivalRing (the rotor's fractional revivals as a circular carpet), HarmonicOscillatorCoherent (Wigner
  functions, cat states with negative fringes).
- **The rest:** ParametricResonanceTongues (the Mathieu chart by one-period Floquet traces),
  HolographicReconstruction, WaveFrontFolding (offset curves of a wavy source, caustics where branches meet).

**Two that needed another way.**
- **The Kelvin wake as a direction sum stayed invisible.** Its stationary points need far more than 24 samples. It
  now comes from Kelvin's crest lines: x = A cos t (1 + sin^2 t), y = A cos^2 t sin t. A point inside the 19.5
  degree wedge lies on one transverse and one divergent crest, each found by bisection on y / x, and it is lit
  where A is near a whole number of wavelengths.
- **The melody chose the drum's mode note by note**, which made the pattern jump with every note. It now averages
  the newest 16 samples of the melody ring (`audioMelody[96]`, 80 ms apart), weighted by a triangle and without
  the samples that hold no pitch, and blends the two neighbouring semitones' modes.

**The packets were outside the kaleidoscope.** WavePacketKaleido folds the plane into a mirrored wedge, and packets
started anywhere in the plane were rarely seen inside it. They now start inside the wedge, and each is summed with
its images in the wedge's two mirrors, so it bounces off them and interferes with itself.

## 17.10.2026 (31): light, abstract (ideas 87-100)

Fourteen scenes of family F.
- **CausticWeb:** caustics without a pool, from the refraction map's Jacobian: the light density is
  1 / |det(I + D Hess h)|, summed over two to five drifting sheets. On a change of harmony the layer count fades in
  and out, both ways across its wrap.
- **The photo split by colour or wavelength:** DispersivePrismField (a triangular field of turning prisms, seven
  wavelengths each bent further), ChromaticAberrationVortex (the red, green and blue channels twisted by different
  amounts), SpectralSynthesisGlow (eight bands, each displaced further).
- **Optics on the photo:** LightFieldParallaxLattice (a hexagonal microlens sheet, the photo's brightness as depth
  layers), PolarizationRotatorField (optical rotation growing as 1 / lambda^2 between crossed polarisers),
  GrinLensDrift (fish-eye and Luneburg lenses), InfiniteMirrorCorridorsAbstract (two mirrors at an angle that does
  not close the circle), FresnelLensWarp (a magnifier collapsed into ring facets).
- **Light over the photo:** CoherentSpeckleBloom (random speckle ordering into rosettes with the swell),
  VolumetricShaftsAbstract (beams gathered by marching toward a wandering light through the photo's dark masses),
  LightLeakChoreography (leaks sweeping arcs over a phrase, screen-blended).
- **Two on the state pass:**
  - AfterimageField keeps the eye's slow memory of the moving photo and shows the opponent colour wherever the
    memory is brighter than what is seen now.
  - KerrSelfFocusingFilaments is a ring buffer of a saturable 1D nonlinear Schroedinger beam, one row a step,
    shown as the beam's history from the centre line.

**Leapfrog and diffusion do not mix.** The Kerr beam is advanced by leapfrog: A_new = A_old + 2 dz i (D A_xx + N A),
which holds for this dispersive equation while dz (4 D + N) < 1. A little real diffusion was added to damp the
grid's own noise, and taken from the current row it made the scheme blow up within seconds; leapfrog is unstable for
any diffusion on the middle level. Taken from the older row it is stable (DuFort-Frankel style, 8 nu dz < 1). A
gentle pump, A *= 1 + 0.004 (1 - |A|^2), keeps the mean power from starving or running away. A slow sideways shift
of both earlier rows lets the filaments wander.


## 17.10.2026 (32): tilings in motion (ideas 101-118)

Eighteen scenes of family G.
- **Symmetry groups:**
  - WallpaperGroupMorph folds the plane by eight wallpaper groups (pmm, p2, p4, p4m, p3, p6m, cmm, pg). A change of
    harmony crossfades to the next group.
  - ApeirogonalTiling folds the Poincare disc by {p, q} with p from 7 to 20, and the polygons alternate light and
    dark.
  - ModularTessellationFlow reduces a point to the modular group's fundamental domain. It is shown in the disc
    model, and its triangles are light and dark like Klein's picture. The flow is elliptic, hyperbolic or
    parabolic, chosen by the harmony. The parabolic shift wraps after eight, and the word hash treats n and n + 8
    alike, so the wrap does not show.
- **Escher's methods:**
  - ConwayCriterionTiles bends a hexagonal tiling's edges by a periodic displacement.
  - IsohedralTileMorph bends square tilings of the TTTT, rotation and brick types. Every tile holds the same motif,
    taken in its own bent cell.
  - GirihStrapwork uses Hankin's polygons in contact over squares or hexagons.
  - HexToTriMorph slides three line families between triangles, kagome and hexagons.
- **Folding and cutting:**
  - MiuraFoldField folds and unfolds on an integrated clock and draws together as it folds. The swell only deepens
    the light and shade.
  - YoshimuraBuckling, KirigamiExpansion (opening on the phrase clock), NetsOfPolytopes (cube nets folding, seen
    from straight above) and HoberSphereLattice.
- **Others:**
  - QuasiperiodicDualGrid (de Bruijn grids of 5 to 13 families).
  - SpiderwebTessellation (log-polar).
  - CirclePatternFlow (a circle packing on the log plane).
  - PolyominoFlow: three rows or columns slide per beat, and a round of moves is undone in reverse. The beats are
    counted on the state pass. The three lines of a step are distinct and on one axis, so they commute and glide
    together.
  - ShearingMosaic (whole tiles slid by row and column shears).

**A seamless flight into the Sierpinski carpet.**
- Every hole holds a carpet of its own. The view grows by 3 / brc per generation, where brc is the middle hole's
  fixed size; only the other holes breathe. The zoom is wrapped and shows the same picture one generation on.
- Three things keep the wrap invisible:
  - Each hole opens by its size on screen, not by its level.
  - The hash seed is kept when the flight passes through a middle hole and changed only in the side holes.
  - The light and dark turns follow the absolute generation, floor(z) plus the holes entered.

## 17.10.2026 (33): spaces and topology (ideas 119-134)

Sixteen scenes of family H, most of them ray-marched.
- **Four-dimensional polytopes by Coxeter folding.**
  - The point is projected stereographically onto S^3, turned in two planes and folded into the chamber of the
    symmetry group. The folding repeats the reflections until the point lies on their positive sides.
  - Polytope600CellShadow uses H4, which needs 15 passes. TwentyFourCellBreathing uses F4, which needs 6.
  - The corner is the Wythoff point: it lies on all mirrors but one. H4 with the end node ringed has 120 corners,
    which is the 600-cell. F4 with either end node ringed has 24, which is the 24-cell and its dual. All of this was
    checked in Python by counting the orbit.
  - The distance to a half-edge on the sphere is the angle to the projection onto the plane (corner, mirror normal).
    It is scaled to space by (1 + r^2) / 2.
  - With the eye inside a tube, the march is negated and runs to the tube's inner wall.
- **Quotient spaces.**
  - LensSpaceInterior marches along great circles of S^3. It folds by arg z1 and checks the copies k and k +- 1.
  - PoincareDodecahedralSpace is a portal trace. It leaves through the nearest face plane and comes in at
    R(n, 36 deg)(e - 2n), which lands on the opposite face because -F = R(36 deg)(F - 2n) as a set.
  - ThreeTorusFlight is a mirrored cubic crystal.
  - NilGeometryHelix folds by the Heisenberg action, (x, y, z) ~ (x + 1, y, z + y). Its rays curl about the vertical
    as Nil's geodesics do. Only x-steps shear, so the eye stays near x = 0.
- **SolGeometryTunnel** draws bead slices of the lattice in the cat map's eigenbasis, stretched by (e^z, e^-z). It
  repeats itself after ln(phi^2), and the beads are coloured by X * Y, which the stretch keeps.
- **HyperbolicDodecahedronFlight** works in the Poincare ball.
  - It folds by the icosahedral mirrors and inverts in the face sphere, with D = 1.3157 and R = 0.8550 for a
    dihedral angle of 72 degrees. The edge is the face sphere's circle in the mirror y = 0.
  - It flies by a hyperbolic translation along a 5-fold axis. This wraps after 4 inradii (3.9855), because the two
    reflections in opposite faces compose to that translation.
- **Infinite zooms:**
  - AntoineNecklaceZoom flies toward the fixed point of "into link 0", q* = e1 / (1 - a). It renders from two
    levels up, and a level fades by its depth relative to the zoom, so the wrap is unseen.
  - AlexanderHornedSphere is a binary tree of linked rings. Each child is turned into the parent's xz-plane and a
    quarter within its own plane.
- **The rest:**
  - SphereEversionLoop: both sheets r = R(u) and r = -R(-u). The side shown is chosen by which sheet was hit.
  - CostaSurfaceTunnel: (r - R(y)) sin(pi y / P) - eps cos(2 phi) near each waist.
  - RiemannSurfaceSheets: helicoid ramps of n sheets, or endless for the logarithm.
  - SL2RFlowField: an exact exp(tau X) Moebius flow in two phases.
  - ProjectivePlaneRoll: Steiner's Roman surface.
  - FlatTorusUnfold: the Clifford torus turned once a phrase.

## 17.10.2026 (34): the photo as raw material (ideas 135-154)

Twenty scenes of family I. All of them are single-pass image processing on the mip chain.

**Only one photo.** tex1 holds the preloaded next image. It changes at every photo swap, after the crossfade, so a
scene that used it as "the second photo" would jump. The ideas for two photos therefore cut two pictures from the
same photo: the second is turned by about 2 to 4 radians and shifted. Both drift with sceneTime and audioAdvance.

**The methods:**
- **Pyramids:**
  - LaplacianPyramidEqualizer: band k = L_k - L_{k+1}. Each band's gain comes from audioSubBass .. audioRolloff,
    carried across the frame by a slow wave of its own.
  - PoissonGradientRemix: the first picture's bands above a cut-off level, the second's L_cut below it.
  - PhotoFourierPhaseSwap: the monogenic signal per band. The Riesz pair is the band's slope at its own scale; the
    amplitude of A is multiplied by cos(phase of B).
- **Local filters:**
  - KuwaharaFlowPainting: an anisotropic Kuwahara filter with 8 sectors x 6 taps along the structure direction.
    The weight is 1 / (1 + (300 var)^4).
  - BilateralDreamGrid: 7 x 7 taps.
  - PhotoMeanShiftBlooms: 5 mean-shift steps over 8 taps.
  - MorphologicalBreath: opening and closing, each the max of mins (or the min of maxes) over two rings.
  - ToneMappingTide: L / L_avg with the surroundings pulled toward a key.
- **Searches along a line:**
  - PixelSortCascade: a run between two luma thresholds is found by marching up to 48 steps each way. Twelve
    samples of the run are insertion-sorted, and the pixel reads the sorted run at its own place.
  - SeamCarvingBreath: 24 busyness samples per row and per column (L at 4.5 minus L at 7), with weight
    1 + kappa (0.5 - e). The inverse of the cumulative sum maps the frame onto the photo. Finer busyness levels
    made neighbouring rows disagree and the picture zig-zag.
- **Distributions:**
  - HistogramFlowMatch: 16 samples per picture. Each channel's soft rank in A is mapped to B's sorted value.
  - ColorTransferTide: Reinhard's transfer in l-alpha-beta, with the mean and spread from 16 samples.
- **Synthesis:**
  - TextureSynthesisGrowth: by-example noise on a triangle lattice with variance-preserving blending (Heitz and
    Neyret). The seed is the harmony's integer, so a crossfade's end state is the next one's start.
  - PatchShuffleKaleido: PatchMatch-lite. A plan of the photo's broad colours folded six times, and for each square
    the best of 3 to 8 random candidates by mean colour.
- **Fields from the photo:**
  - SuperpixelMosaicFlow: SLIC-style assignment to 9 moving seeds by place and colour.
  - DistanceFieldEcho: the first-order distance to the nearest luma step, |L - level| / |grad L|. Rings run at
    2 pi (d / lambda - audioBeatPhase) and push the photo along the gradient.
  - StructureTensorLens: the structure tensor's orientation and coherence decide the pull.
  - PhotoSpectralWarp: 10 steps back along each hue's direction.
  - DepthFromFocusLayers: a parallax march over a sharpness height field.
  - PhotoWatershedFlood: 14 steps of gradient descent to the basin's floor, which gives the basin's colour.

## 17.10.2026 (35): swarms and particles, round and space-filling (ideas 155-168)

Fourteen scenes of family J. The engine has no general particle simulation, so there are three ways in.
- **A few actors on the state pass, the rest drawn per pixel:**
  - SPHVortexDance: 8 point vortices, each moved by the others' Lamb-Oseen velocity.
  - SwarmalatorRings: 144 swarmalators, after O'Keeffe, Ha and Strogatz.
  - ThomsonProblemShells: 4 x 48 charges on spheres. Each charge's presence fades toward whether the chord
    counts it, so charges never pop.
  - MagneticDipoleSwarm: 1 cell that only smooths the bass, so rings and chains glide.
- **A field on the state pass, with particles scattered over it:**
  - ActiveBrownianClusters: Cahn-Hilliard plus Oono's term -eps (c - mean), which keeps the clusters finite, plus
    noise.
  - FlockingPhaseTransition: a Vicsek heading field, carried along itself, aligned 3 x 3 and shaken by eta.
  - GranularGasCooling: density drawn up the gradient of its own blurred image, as in Keller-Segel. It is unstable
    while drawIn x rho > warm; drawIn = 0.3 (1 - e) + 0.04 and warm = 0.02 + 0.12 e, so loud, elastic passages melt
    the clusters. A first try with velocity, pressure and loss never clustered.
  - BrownianTreeRain: a diffusing rain fed from the top that evaporates (x 0.995 per step), so it stays thin.
    Cells with one or two tree neighbours stick with a chance proportional to rain^2. There is no growth across the
    top and bottom edges: the periodic wrap had grown a second forest down from the top.
- **Particles traced back through a flow** (SPHVortexDance, VortexLatticeParticles, Stokesian clouds):
  - Each drop is traced back along the stream to where it came from, in two phases half a life apart.
  - Its distance is measured back on screen through the inverse of the flow map's Jacobian (two neighbouring
    traces). So the drops stay round even where the flow stretches.
- **Analytic:**
  - ChargedDustCrystal: hexagonal sites, with trembling and wandering that grow with the temperature.
  - CoulombExplosionBloom: r(r0, t) from the charge inside r0 for a Gaussian cloud. The starting radii that land
    on a pixel are found by scanning 28 of them for sign changes; more than one lands inside the shell.
  - ElectrohydroDropletRain: metaballs stretched along the field, splitting into two lobes when stretched far.
  - LiquidCrystalOfBubbles: a power diagram of domes whose radii follow audioSpectrum.

**screenP() is one unit high** (-0.5 .. 0.5), not two. The particle scenes are scaled to that. The earlier families
were checked by eye and their scales stand.

## 17.10.2026 (36): music as geometry (ideas 169-182)

Fourteen scenes of family K. Most of them keep a small state of their own, so that what the music decides changes
smoothly.
- **Counters:** the beats (EuclideanRhythmMandala, PolyrhythmLissajousLattice, TempoFieldWarp: wraps of
  audioBeatPhase plus the phase itself, so rings and seams turn without a jump).
- **Smoothing:** the chroma (ChromaVectorField, IntervalInterference), the spectrum (TimbreSculpture), the stereo
  levels (StereoFieldCurtains), the roughness (DissonanceRoughnessTerrain) and the onset density (Euclidean rings).
- **Musical analysis on the state pass:**
  - CadenceGravity finds the key by correlating the chroma with the 24 Krumhansl-Kessler profiles. It keeps the key
    unless another wins by 8 %. The tension is 1 - (tonic triad / half the chroma sum). The wells' angle glides the
    short way round to a new key.
  - IntervalInterference takes the two strongest smoothed pitch classes, and the just ratio of their interval glides
    (3:2, 5:4, 16:15, 45:32 and the rest).
  - SongFormRings counts the section changes and stores each ring's section label. A recurring section wears the
    same cut of the photo, so the form reads in the rings. The growth glides toward count + age / 40, and the
    scale keeps the newest ring at 0.46.
  - OnsetCrystalSeeds keeps a ring of 64 seeds, one per onset (at most four a second). The newest crystal whose
    polygonal front has reached a pixel is on top, so an overwritten slot is always long overgrown.
- **Pure geometry:**
  - EuclideanRhythmMandala: a hit where floor((s + 1) k / n) - floor(s k / n) = 1. The hit count crossfades between
    k and k + 1.
  - PolyrhythmLissajousLattice: a Lissajous table, with the curve drawn as joined segments. Sampled points showed
    as dots.
  - KeySpiralArray: Chew's spiral array, pitch class = 7 k mod 12. The centre of effect is the chroma-weighted mean
    under a soft window along the line of fifths; a hard window jumped as the eye moved on.
  - HarmonicLatticeFlight: the just lattice, pitch class = 7a + 4b + 10c.
  - TimbreSculpture: 32 wave trains, one per band.
  - MelodyGeodesics: paths bent by the hills' slopes. The photo is traced back without blur, then given a short
    streak.

## 17.10.2026 (37): less abstract, but filling the frame (ideas 183-200)

Eighteen scenes of family L. These are nature pieces built as fields that fill the frame.
- **Fields of the same thing:** each cell of a lattice draws one creature, and neighbours are checked so that
  overlaps stay right.
  - CoralPolypField: a hexagonal carpet from two interleaved lattices.
  - SeaAnemoneMeadow: a point is bent back against the current, more toward the tip, before the tentacle sectors
    are tested.
  - DiatomKaleidoField: centric and pennate shells, with symmetry and mix crossfaded by the harmony.
  - RadiolarianSwarm: Fibonacci-sphere pore lattices. The bar is where the nearest and second-nearest points are
    close; three depth layers.
  - SilkMothScales: overlapping rows with thin-film colour, 0.5 + 0.5 cos(2 pi (tilt x 1.6 + rgb)).
  - PollenStormMacro: three layers with focus blur; only the middle layer is sharp.
  - GlassMarbleCascade: hexagonal packing; each marble inverts and shrinks the photo behind it.
- **Small state-pass agendas:**
  - SporeCloudBloom: 16 puffs, released on drops or every 1.2 to 4 s. The motes sit on a fixed lattice where the
    puff began and are measured back on screen. A first version tied the lattice to the swelling, and the motes
    slid.
  - CloudChamberField: 32 tracks from onsets, straight or curved by kind.
  - NeuronForestFiring: an excitable medium that onsets strike. The glow spreads from the soma along the dendrites.
  - MagmaConvectionTop: a clock integrating the bass, so the plates never jump.
  - SilkSpinningLoom: the beat counter; the weave is crossfaded by section.
- **SnowflakeFieldGrowth** is Gravner and Griffeath's model on a hexagonal lattice in offset coordinates. Diffusion
  reflects off ice; freezing uses kappa; attachment uses beta for one or two neighbours, alpha and theta for three,
  and always for four. Melting uses mu and gamma. Ice ages and sublimes, and new seeds appear in the vapour, so
  the field keeps renewing. The render maps a cell to 1 / 0.866 of a row.
- **Advection and noise:** PhytoplanktonSpirals (16 back-steps through drifting eddies), MurmurationOfLeaves
  (tumbling discs inside a folding density), SolarGranulationField (Worley with wandering centres),
  NebulaDustPillarsField (columns with rims facing the wind).
- **TidalFlatChannels:** creeks are narrow valleys, smoothstep(0, 0.3, |2n - 1|) per octave. The tide floods the
  main creeks first and the fine ones last. With sqrt valleys the flat stayed dry.

With family L all 200 ideas of docs/proposals-2026-10-17-abstrakt-200.md are built.

## 17.10.2026 (38): catalogue and measurements of the 200

**Catalogue frames.** Tools/render_catalog_export.py rendered all 200 scenes as 600 frames in 3.6 min, with three
jobs. make_catalog.py now holds 1415 scenes and 4523 pictures. Portable Chrome printed the PDF in 24 s (586 pages,
47 MB).

**What the frames showed:**
- GreenbergHastingsWaves lit its own arc only when stateFrame was a multiple of both 30 and 400, that is every 1200
  steps (30 s), so quiet passages went dark. It is now every 300 steps.
- HarmonicLatticeFlight's eye flew through nodes on an irrational heading. It now flies along x through the cells'
  middles, where no node or rod comes nearer than a third of a cell.
- WireworldCircuitry, which the screening flagged as empty, got a brighter board and four times the spontaneous
  electrons.

**Screening.** Tools/screen.py measured the 200 scenes as 200 windows in 3.0 min.
- It overwrites .screen/metrics.json and scene-cost.json with only what it measured. Both were saved first and the
  new rows merged into them, so the full set covers 1415 scenes again.
- GPU time a frame at 1920 x 1080: 0.43 to 1.65 ms, median 0.51. The dearest are LensSpaceInterior,
  AntoineNecklaceZoom and TwinDragonRepTile. (The commit message 400bc1b4 said 0.12 for the lower end; that was
  wrong.)
- There were no drops against the baseline. The baseline itself was not re-saved: the new scenes have one seed
  each, not three.
- sync_scene_measures.py wrote gpuMs and the measured restlessness as complexity (Spearman 0.91 against the
  hand-set values). The ranks spread over all scenes, so 292 entries moved.
- check_schedule.py --quick: 14 plans, no violations.

**Two faults the snapshots showed:**
- A comparison run (KALEIDO_FREEZE_TIME) sets EffectShader::M_Frozen from its first frame, so the state pass only
  ever ran its seed step. Every scene with a field of its own was snapshotted in its starting state, some of them
  black. RenderPipeline now hands the fixed frames' step to EffectShader::M_FixedDt: 1/120 s per counted frame,
  and 0 while waiting for programs. stepState() takes that step, so the field evolves exactly the same in every
  run. Two runs of six such scenes compared with 0 changed and 0 unstable. Flat or dark frames among the 200 went
  from 39 to 31, and none is black.
- gen.py declared every audio uniform as float. The engine sets audioStereoL and audioStereoR as vec3 (per band),
  and glUniform3f on a float is GL_INVALID_OPERATION, so StereoFieldCurtains never heard left and right. The
  VEC3_AUDIO table now types them, and the curtains take the mean of the three bands.

The snapshot set 2026-10-17-base200 holds 2026-10-17-base plus the 200 (1630 frames). release_check still compares
against Tools/snapshot_baseline.txt (2026-10-03-night); naming a new baseline is the release's decision.

## 17.10.2026 (39): a real second photo, and the 3D scenes that cut the photo hard

**The question.** Why did the photo change abruptly, when the photos used to fade? The fade itself never went away.
img() and every hand-written img() helper mix the two slots, interpolation · tex0 + (1 − interpolation) · tex1, with
interpolation falling from 1 to 0 over the fade. At its end RenderPipeline swaps the slots and sets interpolation
back to 1, so the mix shows the same photo before and after the swap. The loader then refills tex1 while its weight
is 0, which nobody sees.

**What did cut hard.** Eleven 3D shaders sampled tex0 alone:
- BillboardCity, GalleryHall, KaleidoDome, MosaicWave, PhotoCarousel, PhotoShatter, PhotoTunnel, SilkPhoto,
  StainedGlassRosette and Wormhole (fragment stage);
- VideoRelief.vert, whose relief height comes from the photo.

During the whole fade tex0 still holds the old photo, and at the swap it becomes the new one from one frame to the
next. They now declare tex1 and interpolation and read the photo through the same img() helper as the other 3D
scenes. Their frozen snapshots are unchanged (16 compared, 0 changed), since a snapshot is taken outside a fade. A
search over every tracked shader finds no other photo read without interpolation.

**The second photo (imgB).** The four scenes that set two pictures against each other used two crops of one photo:
PhotoFourierPhaseSwap, HistogramFlowMatch, PoissonGradientRemix and ColorTransferTide. The hidden slot cannot serve
as the second picture, because it is refilled hard. They now get a store of their own:
- RenderPipeline keeps two more 1024 × 1024 textures (m_photoBTex), bound on units 38 and 39
  (EffectShader::PhotoBUnit), with the uniforms texPhotoB0, texPhotoB1 and photoBMix.
- At every photo swap takePhotoB() blits the photo that has just faded out into the slot not shown. It uses
  glBlitFramebuffer through two framebuffers of its own; the GL loader has no glCopyImageSubData. The copy happens
  before the loader overwrites that photo. It then regenerates the slot's mipmaps and lets photoBMix glide to it
  over 5 s of frame time. A swap during a running glide finishes it first.
- So the second photo is always the one shown before the current one, and it never jumps.
- At the start it is the photo half the list away from the first one. Nothing is rolled for it, so seeded runs keep
  their rolls.
- A live input stands in for both slots, as for the photos.
- gen.py adds imgB(uv, lod) and its three uniforms only to sources that call imgB(). It mirrors the coordinate like
  imgLod() and mixes the slots with a smoothstep of photoBMix.
- The PresetEditor preview binds its second sample image to both slots.

A probe scene (photo left, second photo right, photoBMix and interpolation as bars) was rendered for 150 s with
several swaps. The second photo held still between swaps and glided over in about 5 s after each one, always
differing from the first. The probe was removed again. A GL-debug snapshot run of the four scenes showed no errors.
Their catalogue frames were rendered anew, and their snapshots in 2026-10-17-base200 replaced.

## 17.10.2026 (40): the 200 in the genre presets, and the old tags against the measured restlessness

**The ratings of the 200 were too high.** Each was rated by eye while it was built: seven columns in
Tools/preset_fit.tsv, from which make_genre_configs.py picks every genre's scenes. Against the 1214 older rows their
scale had slipped:

| | interest | psychedelic | galerie | space |
|---|---|---|---|---|
| older rows, mean | 5.8 | 4.6 | 5.0 | 3.7 |
| the 200 at build time | 6.5 | 6.2 | 6.1 | 3.4 |
| the 200 re-rated | 4.8 | 4.9 | 4.7 | 1.7 |

The genres are capped at 400 scenes each. The inflated ratings had pushed out up to 42 older scenes per genre (Noir
28, Club 32, SpaceAmbient 42). All 200 were rated again from sheets of their catalogue frames, after first
calibrating on older scenes with known ratings. Now 12 to 32 come into the capped genres and push out as many.
Psychedelic (518) and Galerie (465) have no cap pressure and simply grow. Tunnel, Kaleidoscope and
SymmetryBreathing (interest 9, fit 5) stay out of Ambient and Club even so: the rule ranks fit before interest.

The `space` tag of 38 new scenes came off. These are abstract scenes on a dark ground, such as waves, light,
tilings and lattices. Calibration showed that the older rows keep that tag for a cosmic subject: of 154 tagged older
scenes, 138 have a space fit of 6 or more. Two new scenes lost `calm`.

**The old tags against the measured restlessness.** Since 17.10. `complexity` is the measured restlessness, spread
evenly over 1 to 10. The scheduler matches it against the music's arousal; the mood tags add their own pull. 144
scenes contradicted themselves:
- `calm` but measured at 9 or 10;
- `aggressive` but measured at 1 or 2;
- rated a calm fit of 7 or more but measured at 9 or 10;
- rated club 7 or more but measured at 1 or 2.

All 144 were rendered by ns_sample.py (6 s each, four frames per scene) and looked at in motion. A sheet of still
frames cannot show restlessness.
- **Measurement right, tag wrong.**
  - 43 lost `calm`, for example FlowingWires, SolarSailArmada and TunnelPlain.
  - 16 lost `aggressive`: HaboobDustWall, HurricaneEyeWall, ShelfCloudPrairie, FortressStation and other slow,
    still scenes.
  - Seven 2D chain scenes, BoogieWoogieGrid and NeonFluidDynamics came down from club 7 to 5. They drift slowly;
    they are psychedelic, not club.
  - Eleven other fits were corrected by hand.
  - A shader left without any mood is tagged `dreamy`.
- **Measurement fooled, tag kept.** These measure busy only because of many small moving things on a dark ground,
  which the eye reads as a calm drift: SnowDrift, Jellyfish, KelpForest, TempleLanternHall, TextureLanternField,
  RainOnWater, Ocean and others. The same effect was noted when the measurement was introduced: a dense snowfall
  ranks busy.

Left after the review: 51 `calm` scenes measured at 9 or 10, all looked at and kept; 3 `aggressive` scenes measured at
1 or 2 (BuildUpAvalanche, VolcanicLightningPlume and TaikoSilhouettes, whose bursts and strikes the median
misses); 1 club-rated scene
at 1 or 2. check_schedule.py --quick: 14 plans, no violations.

## 17.10.2026 (41): a genre preset Electronic

Electronic is for techno and electronica. Its picture is the synthetic look: grids, lasers, neon, spectrum analysers,
data streams, tunnels, hard geometry.

**The rating column.** Tools/preset_fit.tsv has a new column, `electronic`, appended after `interest`. All 1415
scenes were rated from sheets of their three catalogue frames, twelve scenes to a sheet. Top marks (9 and 10) went
to CyberGridCity, SynthTerrain, TronCycles, LaserArena, DiscoGodrays, NeonSignAlley, StereoSpectrum and the like.
Landscapes, animals, painting and nature macros got 0 to 2. The column ranks scenes like `club` (Spearman 0.78), but
it keeps out the natural spectacles a club takes and takes in the data, spectrum and grid scenes that are not
aggressive.

**The preset.**
- make_genre_configs.py picks the scenes by that column, like the other genres: 401 distinct scenes, 273 of them
  ranked 6 or more. 283 are also in Club and 260 in Psychedelic, against 47 in Ambient.
- Overlays and transitions follow the rule aggressive, energetic, bright or psychedelic, never calm: 15 overlays,
  76 transitions.
- Labs take 30 % of the screen time, the wild half of the chain classes. The 2D lab's colours run past the photo's
  own (paletteP 0.4 to 1). Each lab stays 240 to 600 s.
- No scene-fade floor: with a beat, fades follow four beats, as in Club.

A row shorter than the header now counts as unrated in its missing columns, so the mood rule decides there. That
keeps rows written with seven values valid. finish_block.py now takes eight values per rating row, ending with
`electronic`.

check_schedule.py and long_run_sim.py list the new genre. check_schedule.py --quick: 16 plans, no violations.
Electronic over 6 h of structure128.wav makes 489 changes, with labs at 31.1 % of the screen time.

## 18.10.2026 (42): ten genre presets -- Psytrance, Cinematic, Downtempo; the benches go

**Three new genres, each with its own rating column.** Tools/preset_fit.tsv has three more columns after
`electronic`: `psytrance`, `cinematic` and `downtempo`. All 1415 scenes were rated from sheets of their catalogue
frames, with psychedelic, ambient, galerie and electronic shown as anchors.
- **Psytrance** is the driving psychedelic look: tunnels, fractal flights, kaleidoscopes, hard patterns. 360 scenes
  rate 6 or more. Overlays and transitions are psychedelic, aggressive or energetic, never calm. Labs take 45 % of the
  screen time, from the wild half of the chain classes in full colour. 359 of its 401 scenes are also in Psychedelic
  (518), which has no cap pressure. The difference lies in the transitions (72 against 57), the labs and the faster
  drop cuts.
- **Cinematic** is for classical, film music and piano: landscapes, architecture, painting and slow flights. Only
  160 scenes rate 6 or more, so the preset fills up to 400 with fits of 4 and 5. Overlays follow the old Galerie
  rule (calm, bright or dreamy, never aggressive or psychedelic). Scenes average 80 s instead of 55 (SOLO_MEAN_BY),
  photos stay 50 to 140 s, fades take at least 6 s, and labs get 15 % in the photo look. One point is left: in a
  calm preset a section change may end a scene after 20 s. On the structure track this gives Cinematic 355 musical
  changes in 6 h, more than Ambient (185), so its scenes average about 44 s there.
- **Downtempo** is the slow beat: chillout, trip-hop, lounge. It is warm, flowing and colourful. Its overlays and
  transitions are calm, dreamy or bright, never aggressive. Fades take at least 4 s, and labs get 30 % in the calm
  classes with colour. 214 of its 401 scenes are also in Ambient, which stays the preset for music without a beat.

The app's automatic preset choice sends calm music with a beat (arousal below 0.33, ambient factor at most 0.6) to
Downtempo instead of Galerie.

**Retired (user's request):**
- Galerie: Cinematic takes its overlay rule and its lab variants.
- Kettenlabor and Transformationen: the labs run in every genre preset with their own share of the screen time.
  The named chains run in the genre presets their ratings fit, and all of them in Allround.
- The hidden benches TestAlle, TestModified, TestNeu, TestAufgemoebelt and TestNiedrigerSchauwert. The engine's
  review mode stays: a preset named `Test...` still walks every scene in a fixed order, 25 s each.

make_genre_configs.py lost the bench lists (MODIFIED_SCENES, RECENT_SCENES, IMPROVED_SCENES), the
review-audio handling and the two chain presets' special knobs. finish_block.py no longer adds new scenes to a
TestNeu list. The package no longer carries Tools/review128.wav, which only the bench needed. The measuring tools
keep using it from the repository.

Komplett stays the hidden master. A saved `activeConfig` that names a retired preset falls back to the first
preset, Allround, with the usual "not found" line.

check_schedule.py --quick: 20 plans (10 presets, silence and the structure track), no violations.

## 22.10.2026 (43): neon flights through endless spaces (400 list, family A)

Twenty-five scenes of family A of docs/proposals-2026-10-22-abstrakt-400.md. All of them gather glow along the ray,
like the nine-point flights, but with motifs the collection did not have.
- **One colour family (the list's rule 9):** gen.py has a new FAMILY_LIB with famHue(), famCol(h, t) and
  famLight(h, t, w). famHue() takes the hue of a slowly wandering, broad patch of the photo; when the photo is
  grey it falls back to hueP. famCol() keeps every shade within +-0.05 of that hue, and famLight() mixes it toward
  warm white. Lattice places and depths choose a shade, never a hue of their own.
- **Morphing between shapes crossfades the light, not the distance.** Blending two distance fields
  (a (2,3) and a (3,5) knot, a cuboctahedron and an icosidodecahedron) gives a curve between them that is near
  neither, and in the middle of the blend the picture went black. TrefoilKnotCorridor, NestedPlatonicGlow,
  ZoetropeRingCorridor, ArchimedeanCageLights, RuledSurfaceStrings and LightThreadWeave3D now glow
  (1 - m) g_A + m g_B and step by min(d_A, d_B).
- **Lattices askew to the flight:** a camera flying along a plane between lattice cells sees the empty gap edge-on
  as a dark band. LemniscateLightLoops, StellatedStarFlight, ConicSectionDance and RuledSurfaceStrings turn the
  lattice by a fixed rotation (SKEW) against the flight. Cells are also stepped no further than their wall.
- **Folding onto one edge:** the dodecahedron, its stellations and the icosidodecahedron are folded by the
  icosahedral mirrors (six rounds of abs(xy) and a reflection; checked on 20 000 random points). After that half of
  one edge is left: (0, 0, phi)-(1/phi, 0, phi) for the dodecahedron, the spike from the face tip to the corner
  (1/phi, 0, phi), and (0, 0, phi)-(0.405, 0.25, 1.464) for the icosidodecahedron. The cuboctahedron sorts
  x >= y >= z >= 0 and keeps (1, 1, 0)-(1, 0.5, 0.5). The opening cages trim that half edge from the corner end.
- **Lattices:**
  - NeonTrussNave: the octet truss folds into [0, 0.5]^3, with six bars. The eye glides along the face diagonal
    at (0.5, 0, 0.175), the widest free line (clearance 0.175 cells, found numerically).
  - SpinNetworkGlow: the nearest diamond node is the nearest point of two face-centred lattices, rounded as D3
    (Conway-Sloane). The packets run from the first lattice's nodes to the second's. The eye flies down the
    (1, 1, 0) channel at (0.5, 0, 0.125), with clearance 0.286.
  - FresnelSphereLattice: the same D3 rounding, with rays passing through every sphere so the rims glow.
- **HilbertConduit3D:** Skilling's transposed Gray code turns the index into the cell and back. Checked in Python
  for order 4: 4096 cells, every step adjacent, the inverse exact. The curve ends at (15, 0, 0), so blocks set
  along x join into one endless line. The ride is a cubic B-spline through the cell centres. Sections crossfade
  to the order-3 curve.
- **PhyllotaxisSphereNest:** Keinert's inverse spherical Fibonacci mapping finds the nearest point on every shell a
  ray meets. The shells have radii exp(0.36 (e + u)), so the sinking is self-similar. A harmony-driven twist
  phi + beta z makes the spirals lean.
- **StarNestKaliFlight:** Kali's fold p <- |p| / (p.p) - c, with light where the magnitude barely changes between
  steps. Four fixed probe rays measure how bright the current stretch is and lift sparse stretches, so the flight
  does not run into black.
- **Melody as a shape:** AuroraRibbonVolume reads eight triangle-smoothed ages of audioMelody[96] into two vec4s, not
  a float array (NVIDIA array trap). The curtains' hems follow that curve, mirrored so it has no seam.
- **Music never moves far things fast:** a term like twist(audio) * z, with z the world depth, would spin the far
  field. Twists and tilts are bounded waves (TwistedFiberRope, TetrahelixStrands) or are laid out per cell
  (ConicSectionDance). TorusKnotInterior keeps the path near the eye fixed and reshapes only the bends ahead, so
  the view never turns on the music.

## 22.10.2026 (44): fractals of light (400 list, family B)

Twenty-five scenes of family B. These fractals are not lit bodies: they are drawn as glowing density, orbits or
edges.
- **Densities gathered in the state field.** BuddhabrotNebulaFlight, IFSFlameVolume and AttractorLightRibbons need
  points scattered onto the screen, which a fragment shader cannot write. They gather instead: every step each
  state cell counts the points of a fresh orbit that fall near it, adds that to its faded old value, and the
  frame reads the field. All cells see the same orbit, because its random numbers come from stRandStep().
  - BuddhabrotNebulaFlight draws its sixteen parameters per step near the Mandelbrot rim, on the cardioid and the
    period-2 bulb, where the orbits are long. The escape time is the depth, so the nebula is three-dimensional.
    Three exposures give three shades.
  - IFSFlameVolume: three 3D affine maps, each blended with the sinusoidal, spherical and swirl variations. Every
    point carries the flame's colour coordinate.
  - AttractorLightRibbons keeps 384 particles in the field's two bottom rows: where each one is now and where it
    was one step ago. All other cells gather the segments between the two places, so the ribbons are
    continuous. When a section changes the attractor, each particle's display scale eases toward the new one
    and nothing jumps. Halvorsen particles seeded at radius 6 escaped, so seeds now start at radius 1.5.
- **Exact self-similar zooms that wrap:**
  - SierpinskiDustSpace zooms about a corner by a factor of two, while the next level's dust fades in.
  - QuasiFractalGlowTiles zooms by phi^4. Numerically, the Robinson-triangle configuration round the centre
    repeats after four splits with no turn; after two it is turned by 36 degrees.
  - HyperbolicLightLace streams by twice the distance to an edge's middle. For even p this translation is a
    symmetry of the tiling.
  - GoldenSpiralNebula works in log-polar coordinates. There the sinking is a shift, and the dust grains stay
    round because the map is conformal. The grain divides a full turn, so the angle closes without a seam.
- **Escape and survival counts as light:**
  - HenonOrbitDust uses backward Henon steps, which run away from everything but the attractor.
  - ChaosGameLight pulls a point back toward its nearest corner. The jump ratio
    1 / (2 (1 + sum of cos(2 pi k / n))) makes the copies just touch. A point near the fractal survives about
    eight pulls more than its neighbours, so the light is smoothstep(1.5, 9, count).
  - NewtonBasinLight uses the steps until a root is reached.
- **Distance estimates as thin glow:** KleinianLightNecklace (Jos Leys' Maskit algorithm with the derivative
  carried), TricornGlowFilaments (the Burning Ship's antenna and the Tricorn's left spike; their views were picked
  numerically for filament cover), ApollonianGlowWeb, PickoverStalksField and RecursiveCircleInversion (the
  inversions' stretch carried).
- **poincareFold in gen.py is not idempotent.** Its abs(mod(an, 2a) - a) maps [0, a] onto itself reversed, so each
  round mirrors the point across a/2, and that is no mirror of the tiling. A numpy render showed broken edges.
  HyperbolicLightLace uses a - abs(mod(an, 2a) - a), which draws a clean {4,5}. The shared helper is left as it was
  for now; changing it changes the scenes that already use it.
- **The fractal tree turned the wrong way:** rot2(a) turns by -a, so the branch tilted inward and the tree folded
  onto itself, and the picture was black. A Python port of the distance found it (minimum 0.36 instead of 0).

## 22.10.2026 (45): real mirror optics (400 list, family C)

Twenty-five scenes of family C. These kaleidoscopes and mirror rooms are worked out as optics, not as a fold of
the screen.
- **Folding a view ray back:**
  - Triangle kaleidoscopes (ObjectCell, OilCell, KaleidoCylinderBrass, TriangularPrismKaleido) reflect the point
    across whichever side it lies beyond and count the bounces. Every bounce costs a tenth of the light, and the
    mirrors' meeting lines are fine dark seams.
  - FourMirrorCorridor folds the landing point on the tube's end plane. All the images lie in that plane, as in a
    real square tube.
  - HexMirrorHive walks back to the centre cell across each wall it crosses. Six mirrors round a hexagon form no
    closed mirror group, so the walks disagree at seams, as they do in a real tube.
- **Polyhedral groups:** TaperedMirrorSphere folds the view direction into one spherical triangle of the
  tetrahedral, octahedral or icosahedral group. Its chambers are x >= y >= |z|, x >= y >= z >= 0, and x, y >= 0 with
  the plane (-0.809, -0.5, 0.309); 15 000 random directions converge.
  - The first version computed all three wall sides once per round and then reflected. After the first reflection
    the other two were stale, and half the screen stayed black. Each side is now measured right before its
    reflection.
- **Two mirrors at any angle:** TwoMirrorAngleSweep counts images anticlockwise from one mirror and clockwise from
  the other. Behind the hinge the two meet, and unless the angle divides the circle, they overlap there as ghosts.
  The old sector count jumped whenever 2 pi / a passed a whole number.
- **Corners and rooms:**
  - CornerCubeTunnel traces in the unfolded space (abs of the coordinates) and counts sign flips.
  - InfinityCubeRoom unfolds a mirror cube into a lattice of cubes. The bounces are the sum of the cell's offsets.
  - MirrorBallInterior reflects the view at facets on a latitude-longitude grid, each facet tilted by its own small
    angle.
- **Surfaces:**
  - LiquidMirrorPool reflects off a quicksilver height field (Fresnel 0.7 + 0.3 (1 - cos)^5) up to a photo
    kaleidoscope.
  - CausticMirrorCeiling shows 1 / |det(I + 2 H Hess h)| straight from the waves' second derivatives.
  - PolarizerStackRoom uses sin^2(2 phi) sin^2(pi Gamma / lambda) for three wavelengths, but keeps only the
    brightness and a small shift of shade, so the colours stay in the family.
  - BeamSplitterLattice uses binomial random-walk shares, C(i + j, j) / 2^(i + j), through Stirling.
- **Panoramas without a seam:** a photo read round the full circle by longitude has a seam at +-pi. CornerCube,
  MirrorBallInterior, ConvexMirrorArray and MagicLanternSlides read |angle| / pi, mirrored, instead.
- **Shake scan:** MirrorScaleField first ran its tilt waves on audioBeatPhase, with the reflection shifted by up to
  a screen unit. That moves the whole picture on the beat, and the scan flagged it. The waves now run on the
  integrated drive, with a third of the shift.

## 22.10.2026 (46): photo kaleidoscopes with depth (400 list, family D)

Twenty-five scenes of family D. They are kaleidoscopes like Kaleidoscope and the chains, but built in ways the
collection lacked: several planes, real depth, kaleidoscopes on curved surfaces.
- **The colour rule for photo scenes:** a shared tone() keeps 55 % of the photo's own colour and pulls 45 % toward
  the colour family (famCol by brightness). The photo still shows, but no scene turns into a rainbow.
- **Log-polar coordinates (log r, angle) make endless motion a shift:**
  - KaleidoHelixTower: the ramp is a straight strip.
  - SpiralArmKaleido: the angle is sheared by pitch * log r, which turns the spiral mirrors radial.
  - ConformalKaleidoBloom: with w = (z - a) / (z - b), the source maps to 0 and the sink to infinity.
  - KaleidoSandMandala: rings are born at the rim and blow away at the middle.
  - The rings are mirrored in u, so the shift never shows a seam.
- **Folds on curved surfaces:**
  - KaleidoSphereInterior uses the icosahedral chamber, as in family C.
  - KaleidoTorusFlight folds both torus angles by mirrors. Its tube cell count is even, so the mirrored cells close
    round the tube. The winding is a wave of the ring angle, so it also closes round the ring.
  - KaleidoMoebiusBand: the band's cross direction turns by pi over L. The fold across flips sign after a round,
    which is the band's own mirror. Rays that miss the band see a dim kaleidoscope, never black.
  - GoldbergKaleidoShell: cells of a spherical Fibonacci lattice, found by Keinert's inverse mapping. The search
    looks at the 3 x 3 lattice cells round the estimate, because the edge needs the second-nearest point.
    Subdivisions are cross-faded in steps of 20 points.
  - HyperbolicKaleidoRoom: the {5,3,5} honeycomb of family A's flight, with a five-fold photo kaleidoscope on each
    face, read in the face's fixed frame.
- **Planes and depth:** ParallaxKaleidoStack, CrystallographicKaleido3D (three space-group-like pane rules,
  cross-faded per section), KaleidoSphereChain (reflected direction folded per sphere) and KaleidoBubbleSwarm.
- **KaleidoTimeEcho** keeps the last eight frames of a turning kaleidoscope as eight tiles of a 1536 x 144 state
  field. Each step overwrites the oldest tile, and the frame shows them as rings, newest outermost, so motion
  spirals into the depth.
- **KaleidoCubeUnfold:** cube nets (crosses) tile the plane on the lattice (2, 1), (-1, 2). A square's cross is found
  by testing which of the five candidate centres (itself, or one step in four directions) lies on that lattice.
  Rounding the square in lattice coordinates had picked wrong crosses.

## 22.10.2026 (47): light shows and abstract film (400 list, family E)

Twenty-five scenes of family E. They rebuild the craft of the light shows since the sixties and the works of
abstract-film pioneers.
- **The light shows' devices as optics:**
  - WaterRippleProjector multiplies two rippled discs' caustics, 1 / |det(I + d Hess h)| each.
  - RibbedGlassLightOrgan uses vertical cylinder lenses that pull the seen point toward the rib's middle.
  - RotatingShadowLamp: a hole at height h on a cylinder of radius r lands on the wall at h R / r. The inner
    cylinder makes the spots and the outer two shade them. A plain product of three masks was nearly black.
  - LeParcMirrorRain: a mirror turned by a sends its spot D sin(2a) sideways and appears cos(a) wide. Each pixel
    gathers the mirrors of its row band within reach.
  - RoseWindowLampDisc: the shafts outside the disc average the panes along the same angle from the middle to the
    rim. Sampling only outward from the rim gathered almost nothing.
- **Films without their frame jumps:** McLaren's paint and Len Lye's scratches run and swing continuously (the
  strip runs on the integrated drive; the swing is an onset envelope times a steady oscillation). Richter's
  rectangles breathe on a cosine of the bar phase, and their colour share glides instead of flipping at a
  threshold.
- **WhitneyArabesque:** the first version ran its clock on the phrase with whole turns per phrase, so it closed up
  at the phrase's end. With hundreds of points the outer ones turned up to 541 times per phrase, a strobe. Sharing
  turn counts in groups left only six spokes. Now the clock is the integrated drive and does not wrap. The n-th
  point turns n/3 to n steps faster than the first, at most about 1.3 turns a second for the outermost. A harmony
  change swaps the step and cross-fades the two swarms' light.
- **AnalogVideoFeedback:** the state field is the monitor. Each step reads it back turned and zoomed, fades it, and
  drifts its colour a little within the family. The photo seeds the middle. The colour drift first stepped
  through sixteen values and reset, which made a small hue jump; it is now a slow sine.
- **Lissajous and oscilloscope figures** (LaserGraphicsFog, XYPhosphorSculptures) are polyline distances over 72-100
  samples. A harmony change cross-fades the light of two ratios, never their distances.

## 22.10.2026 (48): light trails and glowing lines (400 list, family F)

Twenty-five scenes of family F: long exposures, orbits and envelopes, lines that are light.
- **A long exposure is the whole curve.** Most scenes draw a closed or time-bounded curve analytically: a polyline of
  64-200 samples, with the point's distance to the nearest segment as the glow. The moving point is a bright head
  on that curve, and a trail is the stretch just behind it, fading by age.
  - Poi flowers: R1 e^(it) + R2 e^(ikt), with k = 1 - n for antispin and 1 + n for inspin.
  - Lantern rigs: epitrochoids.
  - Penning traps: magnetron plus cyclotron circle.
  - Polygon roulettes: polygonal base r = cos(pi/n) / cos(mod(theta, 2pi/n) - pi/n).
  - Lissajous table, harmonograph, spherical trochoids seen from the sphere's centre.
- **Caustics without tracing a ray field:**
  - CupCausticEnvelopes traces the tangential focus 1/p + 1/q = 2 / (R cos i) round the ring.
  - BilliardCausticRays traces 40-64 rays for four bounces in an ellipse (line-ellipse intersection, reflection about
    the normal x / ab^2). The envelopes appear where the faint segments crowd.
- **Things that follow a clock but must not pop:** counts driven by the music (sparks by the swell, echoes by the
  swell) fade the last item in by its fraction instead of a hard loop bound. Knob-driven counts stay fixed per roll.
  ChronophotographEchoes first blended two forms' distances; like family A it now cross-fades their light.
- **LightInFlightWavefront:** the arrival time is the distance from the source plus (n - 1) times the glass met on
  the straight way, summed over 24 samples along it. The front glows where the arrival time equals the pulse's age,
  so it dents behind every sphere.
- **BraidWordLights** shades strands by where they run across the plait, not by their slot. Slot colours had
  swapped abruptly where two strands traded places at a step's end.
- **CurveShorteningLoops:** the k-th wiggle of a star-shaped curve fades as e^(-k^2 tau), and the radius follows
  R^2 = R0^2 (1 - 0.95 life), the circle's law. Each cell is at its own point in life.
- **TraceOfRollingSpheres:** the tracks fade out before their ball wraps round, so no track vanishes at once.

## 22.10.2026 (49): particle swarms and dot fields (400 list, family G)

Twenty-five scenes of family G: flocks, vortices and lattices made of round points of light.

**Points in a volume.** OrbitalProbabilityDots, GyroidSurfaceSwarm and DustRevealsForms march the ray through a
jittered lattice of candidate dots. Each candidate glows by its distance to the ray, `length(cross(dp - ro, rd))`,
times a density at the dot.
- The lattice must stand askew to the view, by a fixed SKEW rotation, as in family A. An axis-aligned lattice showed
  its cell planes as straight seams and streaks across the picture.

**Bounded densities.** The orbitals first used hydrogen-like radial terms such as r^6 e^(-r/2) (the f orbital).
These grow far past the atom's cell, so every dot lit and the picture was noise. Each orbital is now its angular
part (cos^2, ((3c^2 - 1)/2)^2, ...) times a radial shell exp(-((r - rp)/w)^2). That is at most 1 and gone before
the cell's edge.

**Seeing the whole sky.** SphereSkySwarm keeps its particles on a sphere round the eye. A pinhole view showed one
vortex at a time. A stereographic view, `(x . rt, x . up) / (1 + z)`, puts the whole front hemisphere on the screen.
The vortex centres sit on a golden spiral, so some are always in sight.

**Hashes that do two jobs.** FlockTunnelEscort chose each point's side from `h1 < 0.5` and also took its x offset
from `h1 - 0.5`. When the flock split, every left point sat at the left of its half too, so the halves stuck to the
screen's edges. The offset now comes from `fract(2 h1)`. One hash must not both pick a group and place the point
inside it.

**Even scatter.** ChoreographedLightDots scattered its dots by `sin` of a uniformly spread phase. That piles them up
at the extremes, so the cloud looked like a rectangle's outline. The free place is now an angle plus a radius
`sqrt(u)` in an ellipse, which fills the disc evenly.

**Rivers, not dust.** ParticleKnotRivers spread its particles randomly through the knot's tube, and the knot did not
read. Four strands twisting round it (angle = quarter steps + 3t) draw the knot with the same number of points.
- The tube's frame is the torus' radial and axial directions, because a torus knot lies on a torus. This saves two
  of the four knot evaluations per point.

**Cells and neighbours.** PhononLatticeWaves and InertialCircleDots draw one particle per cell and look at the
3 x 3 neighbourhood.
- Every displacement must stay under about one cell, or points get cut at the neighbourhood's edge. The six phonon
  waves together stay at most 1.1 cells.
- Each wave has a base amplitude (0.4 + 0.6 spectrum), so the lattice moves visibly in quiet passages too.
- Squeezed places (negative divergence) are bright and stretched places dim. That makes the waves visible.

**Point budgets.** Single-point scenes now loop over 360-600 points (ParticleKnotRivers 600, SphereSkySwarm 400).
Below about 250 points, a full-screen swarm looked sparse at 1080p. The counts stay knob-driven, so they stay fixed
per roll.

## 22.10.2026 (50): glass and light (400 list, family H)

Twenty-five scenes of family H: glass as a source of light. Light shines through it, bends in it, gathers behind
it, and the material carries the colour.

**Refraction through a volume of walls.** GlassGyroidRefraction does not march to the first hit. A first-hit march
fails when the camera is inside the glass: the hit sits at t = 0, so the whole screen jumps to a refracted view.
- Instead, the ray takes fixed steps and watches the sign of the shell function |g| - thickness.
- Each sign change is a wall. The ray refracts there with `refract()` (or `reflect()` on total internal reflection),
  and a Fresnel share adds the room's light.
- The remaining transmission tints the photo the bent ray finally looks up.

**Voronoi borders need the bisector distance.** TiffanyOpalGlassFlow first used `dot(g - mid, n)`, which is
negative inside the cell, and took the minimum of those values. That picked the farthest bisector, so the lead
lines vanished. The correct form, as in IQ's two-pass method, is `min(dot(mid - g, n))` over the 5 x 5 neighbours
of the nearest site.

**Low-discrepancy placement.** GlassShadowCaustics placed its vessels at `fract(i * 0.618)` and `fract(i * 0.382)`.
Since 0.618 + 0.382 = 1, x and y are correlated and all vessels lay on one line. Two-dimensional scatter takes the
R2 sequence instead: `fract(i * 0.7548777)`, `fract(i * 0.5698403)`.

**Stretch and fold by iterated shears.** MoltenGlassTaffy first folded with `abs()` and rotations, which gave
rigid chevrons. Now every pull is a shear of each axis by a sine of the other:
- `x += a sin(k y + t)`, then `y += a sin(k x - t)`.
- Four to six pulls with a = 0.55 stretch the level lines of y into folded filaments, like marbled or pulled
  glass.
- Weak pulls (a = 0.35) left only three broad bands.

**Colour fringes need headroom.** The chandelier flecks were bright enough that `finish()` rolled them into white,
and their coloured rims disappeared. A fringe only shows when the fleck's core stays below the roll-off; the flecks
now peak near 1.

**Filters, not layers.** ChihulyPersianCeiling and SeaGlassTumbler multiply the backlight by each piece's
transmission instead of layering pieces with `mix()`.
- Multiplication does not depend on order, so overlaps within a lattice layer show no seams where the 3 x 3 loop
  order changes.
- A sea glass tint is normalised to its largest channel, so the pieces glow coloured instead of filtering to dark.

**Reserved words.** `half` is reserved in GLSL. The NVIDIA compiler accepted it, but it must not be used as a
variable name.

**Pressed and bevelled glass** compute the facets' slope by finite differences of a height pattern (three samples).
- The slope moves the photo lookup and tilts the shading.
- A bevel is a constant shift toward the pane's edge, with mitred corners from `max(|x|, |y|)`. Its three colour
  channels are looked up slightly apart.

## 22.10.2026 (51): glowing life, abstracted (400 list, family I)

Twenty-five scenes of family I: bioluminescence and small life as fields, rooms and patterns rather than single
animals on black.

**Speed must follow the swell by integration, never by multiplication.** Seven scenes multiplied a clock by the
swell:
- `audioAdvance * (0.6 + 0.8 swell)`: four of family G.
- `sceneTime * (0.5 + swell)`: two of the photo-as-fluid family of 17.10.
- `(a + b swell) * sceneTime`: CurveShorteningLoops.

When the swell moves, such a product jumps by clock x change, and the clock grows without bound. The fix is a true
integrator: a 1 x 1 RGBA32F state (`//@state 1 1 60 32`) that adds `(a + b swell) / 60` each step. The scene reads
it as `swellClock`, a reading that only changes its speed. The search pattern
`(sceneTime|audioAdvance)…*…clamp(audioSwell` finds such lines. A bounded `sin(…) * swell` is fine.

**Onsets that set off travelling waves.** PyrosomeInterior and SeaPenLightWaves keep the last four seconds of
`audioOnset` in a 256 x 1 state (`//@state 256 1 60`):
- Each step, cell i takes cell i-1's value, and cell 0 takes the current onset.
- A place lights with `onsetAgo(distance / speed)`, read linearly between cells.
- So every onset really starts a wave that spreads from where it was touched. A front driven by the integrated
  clock would only pulse in place.
- The read is clamped short of the ring's end, so the linear filter never wraps the oldest cell into the newest.

**Paths that are the melody.** DinoflagellateWakeField and VenusGirdleRibbons lay the eight smoothed melody ages
(the triangle-weighted means of AuroraRibbonVolume) along a track. The track behind a swimmer rises and falls with
the last moments' pitches, newest nearest the swimmer. A swimmer that wraps round must travel far enough off screen
that its whole wake has left before it reappears (span = 2 + 2 x wake length).

**Lanes, not hashes.** Ribbon pairs placed by hash bunched at the top and bottom of the screen. Lanes evenly spaced
by index fill it. The same lesson as the R2 sequence in family H.

**Indices that shift at a phrase's end.** MycenaGlowRings gives ring j the age `pos + j`. When a phrase ends, every
ring's j moves on by one, so nothing tied to j (a cap pattern's offset) may differ between rings, or it jumps.

**Structures that grow by halving.** In CleavageStagesBloom a cell's place is the sum of four halvings' offsets,
each opening smoothly as the stage passes it. 1 → 2 → 4 → 8 → 16 cells part continuously, and the frontmost cell
at each pixel is shaded as a sphere.

**Shapes that must stay in their cell.** A star or bokeh disc drawn per jittered cell is cut at the cell's border
once its soft edge reaches past it. Clamp its radius, keep its centre's jitter inside the margin, and fade its
light to zero before the margin.

**Seams that are not the scene's.** ns_sample renders through the app's schedule, which may chain a lab effect. A
dark straight line at the same screen place in every frame is that effect, not the shader. Compare with another
roll before changing code.

## 22.10.2026 (52): symmetry that breathes (400 list, family J)

Twenty-five scenes of family J: rosettes and ornaments whose order itself changes smoothly.

**Gathered densities need enough points, and a log view.** ChaoticQuiltPatterns first gathered 320 orbit points per
step into a 320 x 320 torus. That is 320 points for 100 000 texels, so it showed only dots.
- With 2000 points per step, a 256 x 256 field and a slow blend (0.03 per step), each texel sees enough of the orbit.
- The density is stored relative to an even spread, `acc / (N pi sig^2)`, in RGBA32F.
- It is shown on a log scale: (log(d + 0.05) - log 0.3) / (log 6 - log 0.3).
- Field and Golubitsky's quilts are nearly even (entropy 0.93 on a 64 x 64 histogram). Their lace shows only in the
  log view.
- A numpy search (scratchpad quilt_search*.py) found that one of the four first parameter sets ran onto a periodic
  orbit. It was replaced.

SymmetricChaosIcons gathers 1200 points per step and blends at 0.06. When a section changes, the old and the new
icon's orbits are gathered side by side, weighted by the cross-fade.

**rot2(a) turns by -a, again.** RadialTreeMandala's branches mirrored to +x and then turned by rot2(ang), which put
every branch on the folded-away side. Only the trunks showed. PursuitCurveWhirls had to map back with rot2(+j phi).
When a fold is followed by a turn, check the turn's sign against one known point.

**Reserved words in GLSL.** Besides `half`, also `layout` and `out` (and `in`, `inout`, `uniform`, `buffer`, `shared`,
`input`, `output`). The NVIDIA compiler rejects `layout` and `out`. A function parameter must not use them either.

**Mirror groups: fold both, measure once.** For a reflection group, the distance from a point to the nearest image
of a curve equals the distance between the two folded into one chamber. GroupOrbitTracer folds the pixel and the
trail's samples, and skips segments whose ends a fold has torn apart. numpy reproduces the rosette exactly.

**Draw subsets in a scattered order.** TimesTableCircle draws only as many lines as the loudness allows. Taken in
order, they covered only an arc of the circle. Taken as `k * 61 mod N` (61 not dividing N), any share spans the whole
circle.

**Exactly self-similar zooms.** The mice problem's nested polygons are each the previous one turned by phi and shrunk
by rho, with rho e^(i phi) = (1 - s) + s e^(2 pi i / n). PursuitCurveWhirls sinks into the whirl without end by
shifting the step index continuously. PolarTruchetRosette flows outward by shifting log r. Its wave round the ring
has a whole number of periods, so it closes where the angle wraps.

**Continuous parameters for star figures.** A star polygon {n/k} drawn from its chords (lines at R cos(pi k / n) with
normals every 2 pi / n from pi k / n) stays continuous for non-whole k. Maurer roses accept a non-whole n. Both let
the harmony glide the figure instead of switching it.

**Smoothing a band over time.** SpirolateralRhythms keeps five spectrum bands in an 8 x 1 state, blended at 0.02 per
step. The step lengths drawn from them reshape the figures without jitter.

## 22.10.2026 (53): plasma, field and discharge (400 list, family K)

Twenty-five scenes of family K: electric and magnetic phenomena that glow by themselves.

**Lines of a field as level lines.** DipoleFieldLineDance, EquipotentialShells and HertzDipoleLoops draw their lines
as even steps of a scalar:
- the planar dipole stream function (m x r) / |r|^2, summed over the magnets;
- the potential's asinh, so shells near and far from a charge are spaced alike;
- Hertz's sin^2(theta) (cos(k r - w t)/(k r) - sin(k r - w t)).

A line's screen distance is the distance to the nearest step divided by the gradient (by finite differences). Where
the lines come closer than a few pixels they melt into a glow instead of aliasing.

**Integrated motion with changing rates.** ExBDriftCycloids sums each particle's drift and gyration phase in an
8 x 1 RGBA32F state, (x += v_d / 60, phase += w / 60). The fields set only the speed, never the place. Both sums wrap
where nothing shows: a whole number of screen spans and of turns. A cycloid loops only where r w > v_d. The first
version drifted faster than it gyrated and drew only waves.

**Random trees by folding, with a path to follow.** LichtenbergAcrylicBloom and SteppedLeaderRace fold
`q.x = abs(q.x)` per level and remember which side the pixel came from in a branch number. That number seeds the
fork's angle and length, so every fork differs. A branch is "the chosen path" when its sides match the leader's own
bit sequence; that path warms into a soft glow near the phrase's end instead of a flash. Levels beyond the growth
brighten in through a small distance offset, `segD + (1 - vis) * 0.01`, rather than by cutting the segment.

**Foam that divides without a jump.** PlasmaBubbleFoam is a power diagram (|x - s|^2 - w). A dividing bubble's
second site starts on the first with weight 0, so its cell is empty, and it moves away while its weight grows. The
skin is the exact power-diagram border distance, min over j of (d_j - d_1) / (2 |s_j - s_1|), with coincident sites
skipped.

**Scattered by number, not by slot.** A brightness wave or hue tied to a ring's on-screen slot jumps when a ring
passes the eye and the slots shift (SpheromakTwist). Tie them to the ring's own number k.

**Fixed views of 3D cages and tubes.**
- FusorStarMode meets the cage sphere from inside for the wires. It measures the ray's closest approach to each
  beam segment (opening to centre) in closed form: about 100 segments.
- StellaratorFluxSurfaces finds where a ray from the axis meets an elliptic tube that turns with depth, by four
  fixed-point steps z = r_e(theta - phi(z)) / rho.

## 22.10.2026 (54): colour as space (400 list, family L)

Twenty scenes of family L: colour itself becomes the place one flies through, or the stuff that moves.

**A direction times an unbounded clock leaps.** FlowDirectionRelief first carried its streak noise by
`p - dir * run`, with dir the local flow direction. Wherever the direction turned, even slightly, the sample point
jumped by run times the change: the noise flickered across the whole field.
- Now two layers are each carried only a short way, `dir * 0.05 * fract(4 run)` and the same shifted by half a
  period, and cross-faded with the triangle weight |1 - 2 fract|.
- Each layer is invisible at the moment it restarts. This is the usual flow-noise technique.
- A search of all sources (direction or velocity times sceneTime, run or advance) found no other case: the remaining
  hits were signs (plus or minus 1) or bounded step lengths.

**Indices that wrap may only be blended as colours.** PaletteCyclingRipples blended three index fields (ripples, a
fall, a whirl). The whirl's index jumps by whole turns where its angle wraps. Mixed with another index by a fractional
weight, the jump became a visible seam. Each part now takes its own palette colour, and the colours are blended.

**True blackbody colours read as sepia.** From about 3500 K on they are pale, so a field of 1000 to 9000 kelvin at
moderate brightness looked brown and grey. Neither deeper powers nor brightness tied to heat helped. A saturated glow
ramp along the same stations (dark red, red, orange, yellow, white, blue-white) reads as heat. The documentation says
so.

**Metamers by Gram-Schmidt in six bands.** MetamerismReveal models colour as six spectral bands seen through three
sensor curves.
- The hidden pigment is the photo's pigment plus a fixed spectral wiggle with the three
  "sensor x first light" rows projected out (Gram-Schmidt on two vec3 halves).
- Under the first light the two are exact metamers; under the second they part.

**Pairs that are born and die smoothly.** In ColourPhaseVortices a vortex pair's two points separate by
s = D sin(pi * phrase), so at birth and at death they coincide and their angles cancel exactly. A radial phase term
summed over both points (not differenced) winds the arms into spirals. A difference cancels at every place midway
between the two points.

**A collision that keeps its light.** In ColouredSmokeRingCollisions the merged ring starts with twice the brightness
and the average of the two colours, so it equals the two rings' sum at the moment of contact. Only then does the
colour pattern round it fade in.

**The photo's colour cloud is centred on its mean.** A strongly coloured photo puts its Lab cloud far off the axis,
out of the picture. PhotoColourSpaceCloud subtracts the Lab value of the photo's mean colour (mip level 8).

**Smoothed control values in tiny states.** LuminousFogStrata, AdditiveSpotlightVenn, GeisslerTubeSpirals and
SpirolateralRhythms keep spectrum bands smoothed in 8 x 1 states. ScriabinColourOrgan keeps the twelve chroma values
in a 12 x 1 state; the main colour is a soft maximum (strengths to the fourth power), so a chord change glides from
colour to colour. FlowDirectionRelief keeps the smoothed onset in a 1 x 1 state.

## 22.10.2026 (55): music as architecture of light (400 list, family M)

Twenty scenes of family M: the music's structure itself becomes the building, the path or the pattern -- chords
build bays, bars build rings, voices braid, the stereo image sends waves.

**A period from a measurement must not divide the clock.** OstinatoRings first turned each ring's marker by
`fract(now / P)`, with P a share of the measured bar length. Every new measurement changed P and so jumped every
marker by now times the change -- the same fault as an audio factor on time.
- The marker phases now live in the state (row 1, cells 1 to 4) and are integrated, `phase + 1 / (60 P)`.
- The measured bar length is itself smoothed there (blend 0.01 a step), so the onset window round each ring stretches
  softly.

**Counts and histories carried on between state steps.** A state stepped 60 (or 30, or 20) times a second moves in
steps on a faster display.
- A counter that sums the steps of a phase (PanoramaLightWaves the beats, MeterStarPolygon the bars) adds in the main
  pass the step since the last state step, `count + fract(phase - lastPhase + 1)` (when below one half).
- A history read at an age reads the cell `age * rate - stateFrac` (ReverbLightReflections, BellFieldRings,
  OstinatoRings, BassRiverOfLight); CounterpointBraids places its steps at `j + stateFrac`.
- A time stamp written by the state pass (DownbeatRipplePool's drops) is compared with
  `(stateFrame - 1 + stateFrac) / rate`.

**The melody ring.** audioMelodyHead is the next write index, so the slot at the head is the oldest sample, not the
newest; the newest is head - 1.
- The ring moves on every 80 ms; audioMelodyPhase is the progress toward the next sample and carries every tread or
  note on smoothly (ArpeggioSpiralSteps, LightScoreFlythrough).
- Drawing only every second sample swapped the drawn samples at every write (even and odd); both scenes now draw
  every sample.
- The analysis spans 61 to 1201 Hz, so a tune covers a narrow band of the normalised pitch. A pitch is placed by its
  distance from the ring's mean in its spread. Both are weighted by a sine window over the sample's age, so a sample
  enters and leaves without a jump.

**The downbeat uniform is not a pulse.** audioDownbeat is a slewed envelope that peaks near 0.7 times the gate. A
rising edge at 0.5 misses quiet passages, so DownbeatRipplePool takes the wraps of the beat, bar and phrase phases.

**Modes must not cancel.** RoomModeGlow first summed the signed mode shapes of all pitch classes; a chord's modes
cancelled and only one corner glowed.
- Each mode now shines with its own antinodes, `pow(|cos cos cos|, sharp)`, weighted by its strength over the
  strongest one's, so a chord's lattices overlap.
- The spheres need a width above the step: step 0.02 with a dithered start, sharp 12 to 24, wavelengths of about one
  unit.

**Walls of a twisted prism, found along the ray.** ChordOrbifoldFlight looks along the prism's axis. The depth where
a ray meets the wall is the fixed point of `z = r_in / max_e dot(p, n_e(twist (z + fly)))`; six steps are enough.
- The edges glow where the largest and the second largest face distances meet.
- The frames are lines of `(z + fly) / 0.7` with an analytic width.

**No fwidth inside the branch.** LightScoreFlythrough's bar lines on the plane are drawn only below the horizon.
Their width in pixels is computed from the plane's depth, `z^2 / (eye F) / height`, because fwidth inside the branch
would draw a grid.

**A nave that is there from the start.** ChordCathedralNave first drew only bays built by chords and stood three
bays behind the newest: a single arch on a quiet start.
- The view now stands ten bays before the newest, built at the far end.
- Bays from before the first chord stand in plain proportions, dimmer.
- The floor line ends at a fixed depth (ten bays), so it never jumps when a bay is added.

**Chords ring several bells.** BellFieldRings keeps the onsets weighted by the squared chroma (over its maximum) in
a 256 x 3 state, four pitch classes to a row; a bell's ring reads its own channel at its age.

## 22.10.2026 (56): tunnels and portals of a new build (400 list, family N)

Thirty-five scenes of family N: tunnels whose walls are built in new ways -- folded paper, woven ribbons, scales,
nets, louvres, stained glass, lace, bottles -- and sequences of gates, hoops and rings to fly through.

**The tunnel's wall as an unrolled surface.** Most walls use the classic mapping: depth z = R0 / r, X = a R0 round
and Y = z + flight along.
- A pattern closes on itself only if it has a whole number of cells round. This holds for a lattice of three
  crease families (Kresling: A = s - t/2, B = s + t/2), for helical ribbons (the kagome weave: the period chosen so
  the helices count M round), and for Voronoi tilings (the cell index taken mod M in every neighbour lookup).
- A pixel's size in lattice units comes from the mapping, `R0 / (r^2 height)` along and `M / (2 pi r height)` round.
  Every wall fades its detail to the pattern's mean where a cell shrinks below a few pixels, so the far end never
  shimmers.
- The kagome weave's over and under is the cyclic rule (1 over 2, 2 over 3, 3 over 1). Three line families at half
  integers never meet in one point, which leaves the hexagons open.

**A helicoid seen along its axis.** ArchimedesScrewInterior first set the first blade ahead at `P / ns (1 - fract)`.
The phase falls with depth, so the first blade lies at `P / ns fract(phase)`, with the blade number floor(phase).
- With the wrong depth the blade numbers did not match across the angle where fract wraps, and a hard line ran
  through the picture.
- The blade passing through the eye fades out over the blade behind it. This is a cross-fade of light, never of
  depths.

**Polygons from laser sheets.** LaserConeTunnel first drew beams inside sheets parallel to the flight. Every line
parallel to the view axis projects through the centre, so the picture became a second starburst.
- Scan lines at constant depth on each sheet draw straight polygon sides instead, and they cross into a turning web.
- The nearest sheet, which is the tunnel's wall, is weighted up.
- The scan lines' width in depth is `z^2 / (distance height)`.

**Rings from the music, a procession for the start.** SmokeRingGates and RubatoStretchTunnel take their rings from
bars or beats written into state slots, so the way was empty for the first seconds.
- SmokeRingGates adds a fainter fixed procession.
- RubatoStretchTunnel starts its slots with half-second beats in the past, numbered below zero, so the first real
  beat overwrites the oldest.
- A ring stands where its beat has travelled to by now. A place on the wall finds the rings just nearer and just
  farther among the 32 slots and stretches the photo between them, so a rubato is seen as space.

**Gates whose form is set when they appear.** MandalaGateSequence writes a gate's symmetry (from the strongest pitch
class) into its slot as soon as the gate exists: one gate beyond the farthest one drawn, so no gate changes in
view. The same kind of slot holds the cathedral's bays in family M.

**Melody on a wall.** AuroraTubeFlight's curtains sway at each depth by the melody's pitch of as long ago as that
depth (seven samples a unit), averaged over nine samples with a triangle weight. The steps of single notes would
otherwise draw zigzags, and the sway is let go toward the far end.

**Soap films need bands.** A film's light only as a mix of two tones read as a flat disc. The interference phase
must also modulate the brightness, `(0.5 + 0.5 cos(phase))^2`, so the swirling bands show.

## 22.10.2026 (57): taken over from the old lists (400 list, family Q)

Fifty scenes of family Q: unbuilt abstract ideas from the lists of 29 and 30 September -- mostly photo scenes (lamps,
gobos, mosaics, gems, marbles, amber, agate), light art (Lumia, Ganzfeld, Soto, gels, coloured shadows) and a few
living fields (Lenia, differential growth).

**Lenia in a field of its own, measured first.** TextureLeniaHabitat's first version sampled the shell kernel at 3
radii x 16 directions and produced crumbs and a labyrinth instead of creatures. The rule was rebuilt in numpy
(scratchpad lenia_tune.py, the shader's bilinear samples splatted into a kernel) and swept.
- The creatures' size follows the kernel's radius: median part size 5 cells at R 9, 34 at R 13, 61 at R 15 (dense
  kernel).
- Too few samples break the creatures into crumbs: 6 x 32 gave a median of 3, 8 x 40 about the dense kernel's size.
- The scene now samples 8 radii x 40 directions at R 13 to 16, with growth centres 0.14 to 0.15 and widths 0.014 to
  0.017. The photo's brightness scales the positive growth (food).
- Now and then a creature is planted on an empty place, chosen by stRandStep, so the habitat never dies out.

**Gray-Scott with the five-point Laplacian.** Karl Sims' coral parameters (Du 1, Dv 0.5, dt 1) belong to his 3 x 3
kernel (centre -1, sides 0.2, corners 0.05).
- With stLap (n + s + e + w - 4c) the same pattern needs about Du 0.21 and Dv 0.105.
- Explicit steps stay stable only while D dt < 0.25.
- The growth is fast enough at 240 steps a second. The cap on steps per frame follows the field's size (4M / cells),
  so a 320 x 180 field may take 64.

**More names GLSL refuses.** `patch` is a keyword, and `round` and `cross` are built-in functions; as variable names
they fail or shadow (in addition to `half`, `layout`, `out`, `step`).

**Photo coordinates must not wrap inside a shape.** `imgLod(fract(uv))` cut a paper lamp in two where uv passed 1;
imgLod mirrors at the edges by itself, so the coordinates stay unwrapped.

**Soft photos have no veins.** LiquidGold looked for places brighter than their surroundings and found none in a
blurred photo. A fine ridged noise of its own joins the photo's veins.

**Fog banks in atmospheric order.** In a parallax of banks the far ones stand higher (nearer the horizon) and paler;
built the other way round, the nearest bank covered everything.

**Lumia creases need a surface.** A twisted ribbon gathers light only at one place along it, which reads as a spot.
A surface of two slow waves inside each veil, lit by how steeply it stands, gives the long creases of Wilfred's
Lumia.

**Strokes, rings and gates need a start.** LightBrushStrokes3D starts its slots with strokes already painted in the
past, as RubatoStretchTunnel and SmokeRingGates did in family N.

**The second photo.** TexturePortalRings, TextureTidalExchange and TextureVeinReveal use imgB, the photo before the
current one, gliding over when the photos change.

## 22.10.2026 (58): the 400 list closed -- catalogue, calibrated ratings, measurements

**The catalogue.** `render_catalog_export.py` rendered the three frames of the 400 new scenes in one export per
60 scenes, two jobs: 1200 frames in 8.8 min (2.2 to 2.6 s a scene). The catalogue now holds 1815 scenes and 5723
frames; its PDF has 736 pages (58 MB).
- The portable Chrome hung on the PDF without a profile of its own. Its renderers used 0.1 s of CPU and wrote
  nothing. With `--user-data-dir` pointing at a folder of its own it printed the 736 pages in 12 s.

**What the catalogue frames showed.**
- CornerCubeTunnel's eye swung into the ball (1.25 on the diagonal; the ball needs more than 1.33), so every ray
  hit at once and the picture was one flat colour. The eye now stays outside.
- Scenes driven only by an onset history were nearly black in the quiet first half of the catalogue track:
  ReverbLightReflections, SeaPenLightWaves, PyrosomeInterior, OstinatoRings and BellFieldRings. They now also write a
  soft pulse on every beat (`max(onset, 0.4 exp(-10 beatPhase))`). TextureInkClouds3D releases a cloud on a beat when
  no onset did for two seconds.

**Ratings against calibrated old rows.** The ratings given while building were too high again: interest 5.97
against 5.63 for the old rows, electronic 5.38 against 3.69. Those values pushed up to 166 old scenes out of a
genre preset (Cinematic). The fix was the one used on 17.10:
- Anchor sheets of 37 old scenes, spread over the interest scale and the extremes of the newer columns, came first.
- Then all 400 were re-rated from their catalogue frames (`rate_sheet400.py`, eleven columns).
- Interest is now 4.78, next to the 4.82 of the 200 re-rated the same way on 17.10. The genre presets now lose at
  most 46 old scenes (Electronic, Psytrance), each to a new scene of higher rank.

**Measured GPU time and restlessness.** `screen.py --scenes <the 400>` took one export, 400 windows in 8.2 min. It
overwrites `.screen/metrics.json` and `scene-cost.json`, so both were saved before and merged after (4888 rows, 1815
costs).
- The new scenes cost 0.77 ms a frame at 1080p in the median. Twelve are above 3 ms; among the 1415 old scenes six
  are.
- The two far above the dearest old scene (6.05 ms) were made cheaper:
  - VoronoiEdgeFoam, 11.35 to 5.72 ms: 26 dithered steps instead of 70, one phase per cell instead of three sines,
    and the glow weighed by the step length so that fewer, longer steps stay as bright.
  - LightCoralIFS, 6.23 to 3.34 ms: 72 dithered steps instead of 110, and the neighbouring ring and sector are
    measured only near their border.
  - The 8 corner cells of the 3D Voronoi search stay: with the seeds wandering up to 0.65 of a cell, a corner
    cell can hold the nearest seed. (Short stray fragments of edges remain with all 27 cells as without them; they
    come from the longer steps.)
- `sync_scene_measures.py` wrote gpuMs and the measured restlessness into Komplett.xml. 412 complexities moved:
  355 of the new scenes, whose complexity had been guessed, and 57 old ones that the new ranks moved by a step.
- `check_schedule.py --quick` found no violations in its 20 plans.
- The screening flagged 25 scenes: 20 "empty" and 10 "still" windows (some both), thin lines or dots on dark in the
  quiet stretch of the screening track, with one seed each -- suspects, not findings. The one strobe was real:
  BassRiverOfLight blended its newest history cell toward the bass by 0.35 a step at 30 Hz, so the wide near part of
  the river flashed with every kick. It now follows the envelope (0.08 a step, about half a second) and is no longer
  flagged. Its GPU time was kept from the first run: measured again while the snapshots ran beside it, it read 2.14
  instead of 0.83 ms -- timings need a quiet machine.

**The snapshots.** `scene_snapshots.py render 2026-10-22-base400 --jobs 3` took three resumed runs (each under the
background shell's 30 minutes): 2030 frames, one per entry. Six scenes failed where a run was cut off and were
rendered again by the next one. Against the set of 17.10 (`2026-10-17-base200`,
rendered at 20:57): 1630 compared, 31 changed, 400 new, none gone, 22 black as before (0 newly black), 5 unstable.
- That set was rendered one minute before 1695f199, when a comparison run still froze every scene's own field
  after its seed step. Nine of the 31 are such state scenes, now stepped.
- BakerHorseshoeFold, a tenth state scene, also has the swell clock of section 51.
- The rest are simulations that evolved a little differently (GalaxyCollision, PhysarumGalaxy, Murmuration) or
  differences of single pixels; side by side none is worse.

## 22.10.2026 (59): the dark new scenes lifted

The catalogue frames showed the 400 new scenes at half the brightness of the old ones: a mean of 0.109 in the median
against 0.195, 0.049 at the 25 % mark against 0.131, and only a quarter of the picture above 0.15 against more than
half. Eighty were below 0.04. The list asked for pictures that fill the screen, and light on black is not that.

**famExpose() in the family library.** Every new scene ends in `finish(famExpose(col, gain, gamma, haze, fh))`:
- a gain;
- a gamma below one, which widens the glows' soft falloffs (a halo at 0.02 becomes 0.065 at gamma 0.7);
- a faint haze of the colour family, drifting slowly, only where the picture is dark.

The lift starts above a toe of 0.02. Without it, gamma 0.7 and gain 4 turned a scene's flat dark ground
(famCol x 0.015) into a flat brown or red wash.

**The values come from the catalogue frames.** The frames are the shader's light after finish(), v = x / (1 + 0.35 x).
Inverted per pixel, lifted and mapped back, they predict the new frame. The script `plan_expose.py` (scratchpad)
picks the gentlest lift that reaches a mean of 0.11, the loud frame C not above 0.42. Gamma below one is used only
where gain alone would need more than 2.4.
- The first render missed the prediction widely: every export draws other photos, and the colour family's hue with
  them.
- Two correction passes from the new frames followed (gain scaled by 0.105 / mean, at most 1.8 a pass), and one
  scene that came out too bright (BeamPrismFacets, 0.36) was lowered.

195 scenes were lifted. The new 400 now measure 0.083 at the 10 % mark (the old scenes 0.079), 0.097 at 25 % and
0.128 in the median; 30 % of the picture lies above 0.15 in the median. Seven stay below 0.06: thin lines and dots in
a blue family (CompassNeedleField, CoronaBeadWires, MeasureRingTunnel ...), clear but dark by luma.

**Some needed more picture, not more light.**
- ExBDriftCycloids sent at most eight particles across a span of 5 for a picture 1.78 wide. Now it sends 8 to 12
  over a span of 4. 500 is still a whole number of spans, and a trail of at most 1.05 still leaves before its head
  wraps.
- PaintCollisionSlowMo's jets started at radius 0.9, outside a picture 0.5 high, and needed a third of the phrase to
  meet. Now they start at 0.5, are thicker, and meet in a fifth.
- SalpChainSpirals' chains (24 salps, 2.5 long) ran out of the picture. Their path is now folded at the edges like a
  mirror, `FOLD - |mod(pos - FOLD, 4 FOLD) - 2 FOLD|`, with the salps' direction mirrored by the sign of the fold. It
  is continuous at the fold and stays whole in the picture.
- WhitneyArabesque is spread over the picture's width with larger points. LeapfroggingVortexRings has three or four
  pairs of larger rings, spread further.

**Measured again.** The 195 scenes were screened again and merged. Their brighter pictures moved 514 complexities:
192 of the lifted scenes and 322 old ones that the ranks moved by one step each (the restlessness is measured
relative to the brightness). `check_schedule --quick`: no violations. The catalogue PDF needed a fresh Chrome profile
again; the one from the afternoon had gone bad.

## 22.10.2026 (60): the calm genres change slowly and flowing

The user asked again that the transitions in the calm presets not come suddenly, but slowly and flowing. The scene
plan run on the 128-BPM structure track showed where the time went:

- With a beat in the music, every scene fade of a calm preset sat on its floor: 5.0 s in the median in Ambient,
  4 s in Downtempo. The four-beat clamp is shorter, so the floor wins every time.
- The FX overlays had no floor at all. A section trigger forced them like a key press (0.8 s), and a natural overlay
  change with a beat took four beats (1.7-1.9 s). Ambient swapped FxPlain for FxWater in under two seconds.

**Fade floors.** `SCENE_FADE_MIN` in `Tools/make_genre_configs.py` rises for the three slowest genres: Ambient
5 -> 8 s, SpaceAmbient 6 -> 10 s, Downtempo 4 -> 6 s (Cinematic stays at 6 s). `SceneScheduler::tickFx` applies the
preset's floor to the overlays too. A musical trigger there now waits for 20 s of overlay solo and then fades as a
natural change, as the scenes have done since 16.10. A person's cut stays a cut.

**Soft transitions.** Some transitions stay abrupt at any length. The calm genres (`SOFT_GENRES`) now drop them, by
measurement and by look:

- *Measured* -- `Tools/transition_profile.tsv` holds the `PresetEditor --transprofile` sweep of all 110 (new in the
  repository; the generator refuses to run when a transition is missing from it). Out goes a transition that:
  - does 80 % of its change in under 45 % of the fade (Luminance 25 %, SpinodalDecomposition, LatentDenoiseArrival,
    WaveFunctionCollapseTiles);
  - flashes more than 30 above both ends (PolaroidDevelopSquare 44);
  - flickers on its own clock above 1.0 (PenroseMorph 1.3);
  - puts more than a tenth of its change into one step.
- *By look* -- mid-transition frames of all 110 (d = 0.4) gave two new preset-only tags in Komplett.xml, which the
  runtime ignores:
  - `wipe` (18): a geometric front sweeping across -- blinds, doors, iris, clock, page, the straight light-edge
    sweeps;
  - `blocky` (16): tiles, pixels, stripes, shards and glitch.

  Ambient, SpaceAmbient and Downtempo drop both. Cinematic keeps the wipes, since the iris and the wipe are film's
  own, and drops only the blocks. Soft fronts with an organic edge (the aurora curtain, sand ripple, Schlieren
  shimmer) stay.

Ambient and SpaceAmbient keep 29 of 43 transitions, Downtempo 35 of 57, Cinematic 30 of 35. The fast genres are
unchanged.

**The plan run, again** (`check_schedule --quick`, 20 plans, no violations):

| | scene fade p10 / median | overlay fade p10 / median, before -> after |
|---|---|---|
| Ambient | 8.0 / 8.0 s | 0.8 / 1.8 -> 8.0 / 8.0 s |
| SpaceAmbient | 10.0 / 10.0 s | 0.8 / 1.7 -> 10.0 / 10.0 s |
| Downtempo | 6.0 / 6.0 s | 0.8 / 1.7 -> 6.0 / 6.0 s |

The plan now records why each overlay changed and how long its fade was planned. `check_schedule.py` adds the rule
`fxfloor`: in a calm preset, a natural overlay fade lasts at least the floor, and a musical trigger comes only after
20 s and never as a cut.

**Two things found on the way.**

- *Overlay changes from the music depended on parity.* "Every second section changes the overlay" was tested on the
  section number. The sections held for a drop's run-up count too, and in the structure track every fresh section
  fell on an odd number: in six hours of Club, not one overlay change came from the music. The scheduler now counts
  the fresh sections itself (`m_freshSections`).
- *The plan run takes cue files.* `Kaleidoscope.exe --schedule ... --cues track.cues.tsv` (and `check_schedule.py
  --cues`) hand a generator's score cues to the scheduler on the WAV's clock, again with every loop
  (`ScoreCueFile::rewind()`), as `-k` does for a render. Section 61 uses it.

## 22.10.2026 (61): breaks, drops and the score cues, checked against the generators' own cues

The user asked to check how the picture answers the music's dynamics -- breaks, drops -- and the score cues. Nine
demos of the generator family were run, each with the cue file written beside it (Goa, Uplifting, Ostgut, Riot,
Lounge, Crescendo, Drift, Cosmic, Betelgeuse). Each went through the scene plan (`--schedule ... --cues`, section 60)
in a fitting preset, once with the cues and once from the audio alone. The cues mark where every section starts and
where the drops land, so they serve as the answer key.

**With cues, the scenes were already right.** In Club, Psytrance and Electronic every cue section got its change
within 0.1 s, and every cue drop got its drop cut. Calm presets take a section as a natural change after 20 s, so
there a cue often falls into a running 6-25 s fade or the 20 s stay. That is intended.

**But the cues reached only the scene cut.** Three things were missing:

- *The drop's hit.* The drop pulse -- the shaders' `audioDrop` (74 scenes), the present pass's streaks, the shock
  wave and the drop rewind -- and the phrase grid's anchor came from the analyser alone, even with cues live. The
  analyser missed both drops of Uplifting, so its drops cut without a hit. In Goa it took the build-up after the
  break for a drop, and the hit came 12 s early.

  Now `RenderPipeline::conditionAudio` drains the cues once a frame, before the conditioner (`buildSchedulerTick`
  reads the same frame). While cues are live:
  - the conditioner's drop count and drop pulse are the cues' (the pulse decays like the analyser's, 0.66 s);
  - the analyser's guesses are ignored;
  - the count carries on across the switch-over, so neither direction reads as a drop;
  - a cue bar line resets the bar position and snaps the phrase grid's integrated beats to the bar, so the grid
    cannot drift.

  The plan now also records the picture's drop hit (`hit` rows: the conditioned pulse crossing 0.85). With cues every
  drop hit came 0.02-0.08 s after the cue drop, and none came anywhere else. Goa's false hit is gone.

- *The kind of section.* A break got the same 0.8 s hard cut as a drop. Now `applyScoreCues` sets
  `Tick::sectionFalls` when the new section is calmer than the last: a Break, Cut or Outro, or 0.15 less energy. The
  scheduler then takes the change as a natural one ("music-soft"):
  - on the next downbeat (the cue's bar line), without waiting for the phrase;
  - faded over 8 to 16 beats (3.3-8 s in the demos), floored by the transition's own minFade.

  The overlay follows the same rule. The hard cut stays the drop's gesture. `check_schedule` checks that a soft
  change lasts at least eight beats.

- *Tested.* `Kaleidoscope.exe -q` gains five checks for `sectionFalls` (127 pass). `check_schedule --quick` and a run
  with Riot's cues in Club, Psytrance, Ambient and Downtempo show no violations.

**The analyser without cues, measured.** The family's demos with cue files are a labelled test set for the
analyser: 43 tracks, 281 section boundaries, 30 drops. `Tools/analyser_vs_cues.py` (new) runs every one through
`PresetEditor --features` and counts:

| | found | invented |
|---|---|---|
| section boundaries | 106 of 281 (38 %) | 159 of 259 (61 %) |
| drops | 6 of 30 (20 %) | 18 of 24 (75 %) |

Found by kind: breaks 73 %, drops 46 %, outros 38 %, grooves 31 %, builds 14 %. Many of the "drops" are not EDM drops
at all: a cinematic climax, a ritual groove's return.

The false drops had three causes:
- 7 of the 18 fell in the intro, between 12 and 24 s. There the bass comes and goes against a slow average that has
  not seen a groove yet.
- 4 came from the return-after-breakdown path where a build-up, not a drop, follows the break (Goa 133 s).
- The rest were orchestral swells.

The bass-gap path now arms only after 30 s, not 12 s. False drops fell from 18 to 10, while the 6 found drops stayed.
The real tracks in `.screen/music` (Astrix, Daft Punk, DMT, Infected Mushroom, Prodigy, ...) and the structure track
keep every drop at the same time.

The rest is left as found and needs its own round:
- the return path that cannot tell a build-up from a drop;
- the trance drop without a bass gap (Uplifting);
- the section detector's 38 %.

The benchmark is the baseline any such change has to beat. With a generator's cues, all of this is moot: the cues
now steer the cut and the hit alike.

## 22.10.2026 (62): the audio analysis, measured against an answer key and rebuilt where it failed

The user asked to optimise the audio analysis. It was measured first, against three sets.

- **The answer key: 43 demos of the generator family.** Each comes with the score cues its generator wrote: every
  section with its kind, every drop, every beat (`Tools/analyser_vs_cues.py`; `@list` freezes a set, since new demos
  keep arriving in `G:/Tools/VRAudio`).
- **Seven real tracks and the structure track.** Their drops were labelled by hand from the bass envelope: the
  moment the bass returns in full after a gap. Their tempo was checked against an autocorrelation over the whole
  track.
- **Four ambient pieces.** They must stay quiet.

For quick iteration a Python prototype rebuilt the analyser's 32 log-spaced bands (FFT 2048, hop 480). Its copy of
the old section detector found 109 boundaries and invented 161; the C++ original found 106 and invented 159. So the
prototype could be trusted as a bench.

### Drops: the bass back at its groove level

The old detector had two paths:
- the bass slamming back to 1.45 x a slow average that froze in the gap, armed by `buildUp > 0.45`;
- the level mix coming back after more than 6 s under its 8-s mean.

It found 6 of the 30 cue drops, with 10 of its 16 drops false. On the real tracks it found none of the 8 labelled
drops and fired 9 times beside them. The level path fired where a break *ended*: at the build-up after it, or while
the music thinned out toward it. Examples: Astrix in the full groove (184.5 s; the drop is at 199), Daft Punk 15 s
early, Prodigy in the middle of the break. The slam path waited for a build-up that the breakbeat demos never
reached.

In the numbers, a dance drop looks like this:
- the bass falls 30-75 dB first;
- it comes back by 20-48 dB within a tenth of a second;
- it returns to its *groove level*, the loudest 2-s bass of the last 45 s.

The new detector (`AudioAnalyzer::processBlock`, "Drop: the bass back at its groove level") has two paths that end
on the same edge: the 60-ms bass within 3 dB of the groove level.
- **A, after a gap:** the bass 30 dB under the groove for at least 6 s. A breakdown often has the build-up inside
  it; the gap counts until the bass is back in full.
- **B, after a vacuum:** the bass 45 dB under the groove for at least 0.25 s, while a build-up is armed. These are
  the beats struck out right before the drop, as in the structure track and many psytrance drops.

The bass is the lowest eight of the 32 bands (40-180 Hz). The groove level is kept as the maxima of 90 half-second
slots. Not before 30 s, at most one every 8 s, and all times in seconds, not blocks. A 480-sample block is 10.9 ms at
44.1 kHz, so in blocks the 6.2-s gap before Astrix's drop counted as 5.7 s and the drop was lost.

|  | cue drops found (+-0.3 s) | false of all | real + structure found | false |
|---|---|---|---|---|
| before | 6 of 30 | 10 of 16 | 3 of 11 (the structure track only) | 9 of 12 |
| after | 16 of 30 | 11 of 27 | 11 of 11 | 2 of 13 |

None fire in the ambient pieces. The other 14 cue drops have no bass return at all (a cinematic climax, a ritual
groove's peak, +-1 dB), so no bass detector can find them.

### Tempo: the autocorrelation gives the number, the kicks the metre

The published tempo was within 4 % of the cues' beats (both folded to 70..180) in 34 % of the rhythmic time. The kick
tempo (`ioiPeriod`) stood whenever the kicks explained their intervals, and wandered wherever they are syncopated: a
breakbeat at 125 read 125..137, a lounge groove at 90 read 92..179. Meanwhile the autocorrelation held 125.0, and when
it was confident it was right 70 % of the time.

Now the autocorrelation sets the tempo when it is confident. The kicks only choose the metre: where they explain
their intervals and sit at a simple ratio to it (2, 1/2, 3/2, 2/3), the tempo is the autocorrelation's times that
ratio. That keeps the synthetic two-step at 174 against an autocorrelation of 116.6.

Result: 34 % -> 54 % of the rhythmic time, 28 % -> 42 % of all. On the real tracks:
- Kadafi 145 -> 121 (the whole-track autocorrelation says 120);
- Prodigy 133.4 -> 130.6 (130);
- Daft Punk now holds 121-125 instead of 121-133.

Left as found:
- slow music (60-90 BPM) read at double tempo: the cues' own metre convention and the prior around 120 disagree;
- Ironic at 3:2.

### Sections: the log shape, two windows, relative to the music's own novelty

The old detector compared a 2.5-s and an 18-s EMA of the *linear* band shares. The bass ruled them: a hat, a pad or a
lead coming in hardly moved the cosine. At the missed boundaries the novelty reached a median of 54 % of the
threshold, while the invented ones sat just above it. And its threshold was absolute. Inside one track the novelty
separated boundaries from the rest well (AUC 0.80-0.94 for breakbeat, psytrance, techno and trance), but across
genres hardly at all (0.73): cinematic and ritual music move ten times as much between their sections as a techno
groove does.

Now, every 0.1 s, the last 3 s are compared with the 12 s before them. The features are the 32 bands' log shape (dB,
its mean removed) plus the loudness, each difference measured in the earlier window's own spread (a two-sample test).
That novelty is read against its median of the last minute (AUC 0.79 across all). A change needs 3 x the median and
1.0 absolute, with 12 s between changes.

Tried and dropped:
- bar-synchronous windows (no gain);
- chroma and onset density (no gain);
- a lower threshold (more found, but twice the detections).

The drop now wins over the section:
- A change is published one frame (0.1 s) after it is found, unless a drop came in between.
- After a drop the section detector rests 12 s. On the structure track, section and drop fell into one block, and the
  plan counted section cuts where the drop's own cut, with its spectacle scene, belonged.

What the scheduler cuts on, a section or a drop, against every cue boundary:

|  | boundaries met | events invented | events |
|---|---|---|---|
| before | 110 of 281 (39 %) | 165 of 275 (60 %) | 275 |
| after | 125 of 281 (44 %) | 132 of 252 (52 %) | 252 |

Build-up boundaries are now met in 51 % of cases (14 % before). The four ambient pieces of the drift fix (16.10.2026)
keep 0-2 sections each, and the real tracks keep about as many as before. `Kaleidoscope.exe -q`: 127 of 127.
`check_schedule --quick`: no violations, and the drop cuts on the structure track are back (Club 217, 206 before
the round). The analysis costs the same: 5.5 s for 494 s of audio.

## 23.10.2026 (63): the areal 400 -- twenty labs, forty chain classes, 340 scenes

The list of 23.10.2026 (`docs/proposals-2026-10-23-flaechig-400.md`) asked for areal methods that use the photos
heavily: the photo as fabric, as plate, as relief, as signal. All of it is built, in families A to Z, one commit each.

**A. Twenty labs** (`Tools/scenegen/src/*Lab.glsl`: BandLab, SeparationLab, PartitionLab, TwinPhotoLab, FlowPaintLab,
DiffractionLab, AtlasLab, EngravingLab, ExposureLab, PerceptionLab, MeterLab, FoldLab, MicroscopeLab, LayerCutLab,
TimeChainLab, StripLab, GlassLab, MirrorBilliardLab, DefectLab, SequenceLab). A lab is not a picture but a vocabulary:
`labWalk(seed, ivec4 n, period)` (gen.py `LAB_LIB`) walks through combinations of up to four slots, one slot changing
at a time with a cross-fade (`LAB_FADE` 0.2); the clock is `0.9 sceneAdvance + sceneTime / 75`, and a new section
(`audioSectionId/Prev/Age`, 8 s) draws everything anew. `labPinA..D` pin a slot (1 + class) for tests. The twenty labs hold
22,139 combinations of slot entries (108 for DefectLab up to 10,000 for BandLab), before knobs and photos.

**B. Forty chain classes** for the four stages of the flat chain labs (`chain_lib7.glsl`, copied into gen.py by
`sync_lib7.py`, wired by `patch_r7.py`, listed in `chain_classes.py`; `chain2d_probe.py` -> `Engine/chain2d_classes.tsv`).
The six mirror nets of the list are not reflection groups and became continuous folds (dragon, Gosper, Fibonacci,
Thue-Morse, Cantor, tent, cat, KIFS, Whitney, polar tent). The 43 functions needed their Doxygen in the generated pass
shaders: `Tools/glsl_doc_table.py` now has their entries (the pass generator strips comments, the table gives them back).

**Shared libraries in gen.py** (appended where a source calls them):
- `FRAC_LIB` (family D): `fracTrap/fracZoom/fracCompose` and the complex helpers; the photo is the orbit trap, only the
  first hit counts (later hits wash the photo out), the background is the plain photo, the zoom shallow.
- `LIC_LIB` (H): `licSmear(p, t, len, ch)` -- fourteen dithered steps along the scene's own `licVel(p, t, ch)`.
- `EXPO_LIB` (J): `expAccum(p, t, mode, lodk)` along the scene's `expPath(p, u, t)`: a mean, a lighten stack that picks
  the colour-weighted brightest reading (luma x (0.3 + 2 sat)), or a comet.
- `RHY_LIB` (L): `rhyBeat()/rhyBar()/rhyPhrase()` (a steady clock stands in where the tempo is unknown), `rhyBump(x, at,
  n, w)` (a smooth bump on a cycle), `rhySecBlend/Prev/Cur`. A rhythm scene uses periodic functions of these phases only,
  so nothing jumps at the end of a beat, a bar or a phrase.
- `LIC_LIB` and `EXPO_LIB` come **after the scene's helpers, before `main()`**: the library calls the scene's `licVel` /
  `expPath`, and a prototype in the library made Doxygen merge the two functions' @param lists.

**State scenes** (`//@state W H RATE [32]`): seven rhythm scenes keep averages over the bars in a small field (onset
energy per step and track, the counted beats modulo 35, the tempo from the beat wraps, the smoothed sub-bass), five
scopes count histograms of the photo in a field (waveform, parade, vectorscope, gradient roses, a histogram terrain),
and ten fields with memory are PDEs guided by the photo (wave tank, eikonal fronts, Schroedinger packet, sandpile,
coherence diffusion, chemotaxis, FitzHugh-Nagumo, KPP fronts, dielectric breakdown, stable fluids).
- **PresetEditor does not step state fields**: its renders show the initial field (ones, in some cases). State scenes
  were checked in the app (`ns_sample.py`), the rest in PresetEditor sheets (`sheet.py`).
- Physarum agents do not fit a field, so PhysarumPhotoNetwork is the Keller-Segel chemotaxis model (which forms the same
  kind of network) and PhotoGapFingering a dielectric-breakdown growth instead of Saffman-Taylor's front.
- The stable-fluids flow has two halves in one texture (velocity and pressure | the photo's coordinates carried by the
  flow); the coordinates relax toward their own place so the photo stays recognisable.

**Honest substitutions.** G: five tilings of the list were not feasible as tilings (Spectre, Sphinx, Voderberg, Gosper
island, Pinwheel) and became RhombilleTumbleTiles, DinRectangleBisection, LogSpiralCellCarpet, FractalShoreCells and
RotatedQuadNest.

**Traps of the round.**
- Large heredocs in bash fail with ENAMETOOLONG; a long source goes in with the Write tool. Heredocs also eat backslashes
  (a patch script with regular expressions: Write tool).
- A knob must not be called `screenP` (a function of that name exists); `dot`, `cross`, `round`, `step` and `patch`
  are taken, too.
- `finish_block.py` with every built frag unregistered fails the shader check until all are registered.
- The shake scan reads a local named `pitch` as frame geometry on `audioMelodyPitch`: smoothing in a state field is fine,
  but the name `mel` avoids the false hit.
- A fix of a `.txt` source draft is not a fix of `src/*.glsl` until `mk.py` has run again, and the commit script adds
  what the registration wrote: build, register, commit, in that order.

**The close.**
- *Catalogue:* `render_catalog_export.py` rendered the frames of the 360 new scenes (20 labs, 340 scenes) in 8.8 minutes
  (two jobs, 60 scenes a chunk); `make_catalog.py` over `scan` + `fxscan` -> 2175 scenes, 6803 frames.
- *Ratings:* the ratings given while building were far above the old rows again (interest 6.78 against 5.44, galerie 7.24
  against 4.88). The 340 scenes were set to the old rows' level column by column (the order inside the batch kept; mean
  and spread of each of the eleven columns moved): interest 4.78, galerie 6.24, psychedelic 5.54, electronic 4.21,
  psytrance 4.54. The twenty labs keep 7 to 9 like the older chain labs. RgbParadeCascade lost one step (its three
  channel colours are the one rainbow the catalogue check found). Anchor sheets: `rate_sheet400.py` with the 37 anchors.
- *Measured:* `screen.py --scenes <360> --chunk 60`: 360 windows in 6.8 minutes. Merged into `.screen/` as before
  (`merge_screen.py`), 5248 metric rows and 2175 costs. The new scenes cost 0.60 ms a frame at 1080p in the median
  (the old ones 0.47), the dearest 1.55 ms (IsophoteSilkStreaks, ExposureLab); none above 3 ms (16 of the old ones).
  The state scenes are cheap because the field steps at its own rate (the dearest, PhotoGeodesicFronts at 600 steps a
  second, stays under 0.8 ms).
- The screening flagged one scene as still: VectorscopeBloom only turned with the music's phase and the screening track is
  quiet for its first half. It now turns steadily and breathes by 8 %, and measures 0.041 spatial std (0.0014 before).
- `sync_scene_measures.py` wrote gpuMs and the measured restlessness into Komplett.xml (Spearman 0.99 against the
  hand-set values over all 2175 scenes), `make_genre_configs.py` rebuilt the presets (Allround 2390 entries, Psychedelic 928,
  Club 590, Ambient 784). `check_schedule.py --quick`: 20 plans, no violations.
- *Doxygen:* 470 warnings at first, all from the round-7 chain functions and the two libraries with a prototype; none now.
- *Snapshots:* `scene_snapshots.py render 2026-10-23-flaechig400 --jobs 3`: 2390 frames, two runs (the first was cut at the
  background shell's 30 minutes; its last three entries read FAIL only because of the cut and were rendered by the
  second run: 922 rendered, 0 failed). Against `2026-10-22-base400` (rendered 17:54-19:10 on 22.10): 2030 compared, 217
  changed, 360 new, 0 gone, 27 black as before (0 newly black, no new scene black), 5 unstable.
  - 192 of the 217 changed scenes had a changed file since that set, mostly the dark-scene lift of the same evening
    (famExpose, `b9628517`); the other 25 are simulations that evolve differently (Murmuration, CyclicAutomatonSpirals,
    LightningStorm, the automata, ShipDocking ...).
- *PDF:* the portable Chrome printed it only at the second try, with its own `--user-data-dir`, `--virtual-time-budget`
  and the machine quiet (the first try ran beside the snapshots and died after 110 s): 870 pages, 71.7 MB.

## 23.10.2026 (64): a hundred variants for every new chain class and every lab class

Asked after (63): "can you get a hundred variants for each of the new labs and chains?" Done as parametric variants: a class
keeps its shape and takes its constants (frequencies, rates, offsets, counts, sizes) from a variant number 0..99. Variant 0 is
always the look the class had before.

**Chain classes (40 of round 7).** `chain_lib7.glsl` holds `gVar/gVa/gVb` (the variant's hash and its eight pseudo-random
numbers), `vr(j)`, `vv(j, lo, hi)` (a constant in a range, the middle for variant 0) and `vk(j, n)` (a choice 0..n-1, the
first for variant 0), and `chainSetVar(v, k)`, which turns the stage's sub-variant `v` (0..1) into the variant `floor(100 v)`.
Each of the stage functions of the four chain lab sources and of FxChain calls `chainSetVar(v, k)` after `k = ord?(k)`, and the
pass generator (`make_chainpass.py`) puts it in front of every class pass (`cls(uv, v)`), so the app's per-class passes get the
variants without a new program: the sub-variant that the walk already sets (`closedClass` keeps it across a class change) now
picks the constants. The 40 functions use `vv/vk` for the constants that make the class look different: a tilt, a rate, the
number of arms, a swapped axis, the width of a lens. Where the first sheets showed variants too alike (Veselago lens,
cylinder lens, Maxwell fish eye, lower mirage, Lamb-Oseen row, Faraday waves, Airy packet, capillary waves, Cantor mirror,
rose fold) the ranges were widened or a structural choice was added. Doxygen: the three globals have entries in
`Tools/glsl_doc_vars.py`, the helpers in `glsl_doc_table.py`.

**Labs (20).** `LAB_LIB` (gen.py) has `gLabV[4]` next to `gLabK[4]`: `labWalk` draws a variant 0..99 for every slot and epoch
(`labVar(slot, epoch, seed)`, blended with the class like the classes themselves are), and a look function takes `ivec4 kv`
with the variants of its slots. The constants of the look are `lv(vi, j, lo, hi)` (a range, the middle for variant 0) and
`lk(vi, j, n)` (a choice, the first for variant 0); `j` is a stream number so that the constants of one look are drawn
independently. Rules kept while patching the 20 sources: the middle of every range is the old constant (so variant 0 renders
exactly like the old lab), counts that sit on a seam (arms, sectors, turns of an atan) stay whole numbers, and the encoding
of an inverse (a colour model's encode and decode) uses the same constants on both sides. Test pins: `labPinA..D` pin a class
(1 + class), `labPinV` the variants: 1 + v for all four slots, or 1000 (1 + slot) + 1 + v for one slot alone, the others at
variant 0 (the check sheets have one row per class and the variants in the columns).

**Checks.** Contact sheets (one row per class, the variants 0, 7, 15 ... 95 as columns, the other three slots at their first
class and variant 0; `PresetEditor --render` with the pins) for all 40 chain classes (stage by stage in ChainLab2D, the other
stages off) and for every slot class of the 20 labs (427 classes, 100 variants each: 42,700 lab variants, 4,000 chain
variants). *Variant 0 equals the old look:* all 397 lab rows rendered against the committed (HEAD) frag, the largest mean
deviation of a frame 0.0004 (floating-point noise). *No flat or dark cells.* *Alike:* two metrics (mean difference of the
variants at 56 x 32 and at 224 x 126 pixels; the fine one is the fair one for line and dot textures such as EngravingLab).
Of 83 rows that looked alike at first, 28 are clearly distinct after the second pass (ranges widened, the middle kept), 28 are
subtle (0.005 .. 0.03 against 0.05 .. 0.2 for the strong ones: overlays, seams, overprints, kernels) and 23 have no constants
and stay identical across the hundred: the neutral classes ("none", "plain", "average", "sharp focus") and a few choice classes
(TwinPhotoLab roles 0 and 1, SeparationLab screen "none"). Context matters: a colour model of SeparationLab only shows with a
screen, the illumination of MicroscopeLab only with a directional method, so a row that is inert in the test can act in a walk.
*Cost:* the labs' GPU time at 1080p, measured in the app (`screen.py --scenes`, the 20 labs): median 0.51 ms, the dearest
0.87 ms (LayerCutLab); the values of the first measurement summed 14.9 ms for the twenty and the new ones 10.9 ms, so the
constants did not make the labs dearer (run-to-run differences of the machine are of that size: LayerCutLab 0.65 -> 0.87,
ExposureLab 1.55 -> 0.69). The pass shaders compile as
before; `shadercheck.py` skips the monolithic ChainLab2D in the cold-compile rule (it runs as passes in the app; the editor still
compiles all classes of its first view in 9 to 10 s). Doxygen 0 warnings.
