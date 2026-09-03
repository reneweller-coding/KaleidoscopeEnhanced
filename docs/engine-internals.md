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
  "Kaleidoscope" for OBS / Resolume / any Spout receiver (Spout2 SDK
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
  pulse is).  Layered on top: a **colour chase** that steps the flash
  emphasis through the four corners once per onset; a soft **haze** —
  a wider, dimmer glow around each beam, as if scattering in stage fog, for
  a 3-D look; a slowly rotating **mirror-ball** speckle field of twinkling
  dots; and a rotating **gobo** wheel — a fan of light rays from screen
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
scene to `Configurations/Marked.xml`; both are also on the web remote
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
and review mode is what supplies the fixed span (`kReviewSoloSecs`, 25 s --
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

resolved at load time from `Configurations/rigs.xml`.

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
for every expression it resolves; the set was 2307 lines before and 2307 after,
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
`Tools/check_enum_tables.py` (CI) keeps `AudioLoc`/`kAudioLocNames` and
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
