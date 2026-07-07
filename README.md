# Kaleidoscope Enhanced — Music Visualizer

A real-time, audio-reactive kaleidoscope / tunnel visualizer for Windows. It
captures whatever is playing on the system (WASAPI loopback — Spotify, browser,
foobar2000, …), analyses it, and drives a chained GLSL shader pipeline whose
motion, colour and structure follow the music's rhythm, timbre and mood.

It works equally well for **beat-driven music** (Rock/Pop/EDM) and **beatless
ambient / drone**, and automatically calms down to a non-reactive mode for
**speech / video dialogue**.

---

## Build

**Requirements**
- **Qt 6.11** (kit `msvc2022_64`), installed at `C:\Qt\6.11.1\msvc2022_64`
- **Visual Studio 2026** (or 2022) — platform toolset **v145**, target **x64**

**Visual Studio**
1. Open `Kaleidoscope.sln`.
2. Select the **Release | x64** (or Debug | x64) configuration.
3. Build. `QTDIR` defaults to `C:\Qt\6.11.1\msvc2022_64` (set in the project);
   override it if your Qt is elsewhere.

**Command line**
```powershell
$env:QTDIR = "C:\Qt\6.11.1\msvc2022_64"
cmd /c '"C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" && msbuild Kaleidoscope.vcxproj /p:Configuration=Release /p:Platform=x64'
```

**Run** — the executable needs the Qt 6 DLLs on `PATH` (or run `windeployqt`):
```powershell
$env:Path = "C:\Qt\6.11.1\msvc2022_64\bin;" + $env:Path
.\Release\Kaleidoscope.exe                    # windowed 1920×1080
.\Release\Kaleidoscope.exe -b                 # fullscreen (2nd monitor if present)
.\Release\Kaleidoscope.exe -s 0.5             # render the pipeline at 50% internal resolution
.\Release\Kaleidoscope.exe -c darkambient     # start with a chosen configuration
.\Release\Kaleidoscope.exe -m 1 -c psychedelic -s 0.5   # kiosk: fullscreen on monitor 1
```

**Command-line options**

| Option        | Meaning                                                            |
|---------------|-------------------------------------------------------------------|
| `-b`          | Start fullscreen (2nd monitor if present)                         |
| `-s <factor>` | Internal render scale 0.25–2.0 (see below)                        |
| `-c <name>`   | Start with the named configuration (e.g. `darkambient`, `normal`)|
| `-m <index>`  | Fullscreen on monitor `<index>` (0-based; implies `-b`)          |
| `-l`          | Log to `kaleidoscope.log` instead of the console (kiosk)         |
| `-h`          | Print usage and exit                                              |

For an unattended **installation / kiosk**, combine `-m`, `-c`, `-s` and `-l`.
While running, the app keeps the display awake and suppresses the screensaver
and system standby for as long as it is open.

**Adaptive render scale (key `g`, on by default):** the internal render scale is
nudged automatically to hold the frame rate near target — it drops below ~45 FPS
and recovers above ~57 — clamped to between 0.35 and whatever `-s` you launched
with. So `-s` sets the *maximum* quality and the app stays smooth on its own; the
live scale and the `g` state are shown in the `i` overlay.

**`-s <factor>` (internal render scale, 0.25–2.0):** the expensive effect passes
render at `factor × display resolution` and only the final pass upscales to the
display. Use `-s 0.5` (or lower) to run smoothly at 4K on weak GPUs (e.g. an Intel
NUC / HD Graphics iGPU); `-s 1.0` (default) is native; `> 1.0` supersamples.
Combine with a lightweight config and lower trails (`,`) for the weakest hardware.

> The shaders (`*.frag`) and `Configurations\*.xml` are loaded from the working
> directory's parent (`..\`), so run the exe from its `Debug\` / `Release\`
> folder. Set an **image directory** in the config (see below) — the kaleidoscope
> textures are built from those images.

---

## Deployment — standalone package (no Qt / VS on the target)

`deploy.ps1` builds a **fully self-contained** package that runs on any 64-bit
Windows PC without Qt or Visual Studio installed:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -Build
```

This produces `dist\KaleidoscopeVisualizer\` and a portable
`dist\KaleidoscopeVisualizer-portable.zip`. It runs `windeployqt` to bundle the
Qt 6 runtime + plugins, copies the MSVC runtime DLLs, and stages the shaders,
configs, an icon and two double-click launchers:

```
KaleidoscopeVisualizer\
    *.frag, *.vert                 shaders          (loaded from "..\")
    Configurations\*.xml           presets
    Kaleidoscope-starten.bat       launcher (windowed)
    Kaleidoscope-Vollbild.bat      launcher (fullscreen / kiosk, -b)
    LIESMICH.txt                   short end-user readme
    bin\  Kaleidoscope.exe + Qt6*.dll, platforms\, vcruntime140*.dll, ...
```

Copy the folder (or unzip the portable ZIP) anywhere and double-click a
launcher — the `.bat` sets the working directory to `bin\` so the app's `..\`
asset paths resolve. The package was verified to run with **Qt removed from
`PATH`**, i.e. purely from its bundled DLLs.

**Classic installer:** if [Inno Setup](https://jrsoftware.org/isdl.php) is
installed, `deploy.ps1` also compiles `installer.iss` into
`dist\KaleidoscopeVisualizer-Setup.exe` (Start-menu / desktop shortcuts with the
correct working directory). Otherwise build it later with `ISCC.exe installer.iss`.

> The bundled `Configurations\*.xml` still point `ImageDirectory` at a local
> path; edit it to your own photos on the target machine. If it's missing, the
> app uses a procedural fallback texture instead of crashing.

---

## Controls

| Key        | Action                                                        |
|------------|---------------------------------------------------------------|
| `Esc`, `Q` | Quit                                                          |
| `h`        | Toggle the on-screen **help** (keyboard reference)            |
| `0`        | Toggle the configuration-select menu                          |
| `1`–`9`    | Switch configuration (cross-fades)                            |
| `i`        | Toggle the live audio-feature overlay (incl. **FPS**)         |
| `d`        | Choose the **audio source** (output / microphone) — overlay   |
| `p`        | Toggle the **now-playing** track title display                |
| `n`        | Manually advance to the next effect (musical scene change)    |
| `[` / `]`  | Reactivity — less / more audio-driven motion                  |
| `,` / `.`  | Trails — shorter / longer feedback trails                     |
| `-` / `=`  | Mood — weaker / stronger colour grading                       |
| `a`        | Toggle **auto-config-by-mood** (auto-switch configs)          |
| `g`        | Toggle **adaptive render scale** (auto-FPS)                   |
| `k`        | Save the current look **and** UI state as the startup default |
| `s`        | Save a PNG screenshot of the window                           |
| mouse drag | (when not fullscreen) trackball / interaction                 |

The tuning keys (`[]`, `,.`, `-=`) change global look parameters shown in the
`i` overlay. Press **`k`** to persist them (plus the render scale) to
`..\kaleidoscope_settings.ini`, so they are restored on the next launch
(command-line flags such as `-s` still take precedence). The `i` overlay also
shows the current **FPS** — handy for tuning `-s` on a target machine.

---

## Configurations

`Configurations\*.xml` define which shaders are in rotation, their timings,
parameters and probabilities, plus the **`ImageDirectory`** used for textures.
Switch between them with the number keys. Included presets:

- **darkambient** — slow, dark, drone-oriented
- **normal** / **psychedelic** — the full colourful set
- **fast** / **slow** / **veryslow** — pacing variants
- **simple** — fewer, plainer effects
- **VR** — variant for VR/large displays

Each `<TextureShader>` / `<CombineShader>` entry names a `.frag` file, solo/
cross-fade times (scaled adaptively by tempo), a `probability` and a
`complexity`. Adjust the `ImageDirectory` attribute to point at your own photos.

The `normal` and `psychedelic` presets also include the newest audio-reactive
effects: **`StereoSpectrum`** (stereo-separated left/right band display) and
**`ReactionDiffusion`** (the live GPU Gray-Scott simulation, see below).

**Retro liquid-light / infinity effects** (plain fragment shaders, no compute):
- **`LavaLamp`** — rising / sinking metaball "wax" blobs; bass adds buoyancy, the
  beat makes them swell. Slow and hypnotic (also in `darkambient`).
- **`OilProjector`** — a 1960s liquid light-show / *Mathmos Space Projector*:
  domain-warped coloured cells on a slowly rotating heated wheel, separated by
  dark oil veins; the bass is the "heat" that makes it bubble (also in `darkambient`).
- **`HyperCube`** — an infinity-mirror cube (*Hyperspace Lighting "HyperCube"*):
  glowing cube edges receding into an endless rotating tunnel, with a counter-
  rotating inner cube and a vanishing-point glow; colours follow the harmony.

**Image-forward effects.** All the "normal" texture effects above (and
`PlasmaFlow`, `OrganicFlow`, `VoronoiPulse`, `FractalKIFS`, `RaymarchTunnel`,
`Starfield`, `SpectrumRadial`) are built *on the source image*, not merely tinted
by it — the effect refracts, shatters, lenses or warps the actual picture and
folds it into mirror/kaleidoscopic symmetry, so they carry the same radiating
"wow" as the Kaleidoscope/Tunnel while each keeps its own character (glass
mosaic, marbled liquid, wax lenses, fractal, flying-into-the-image, band petals,
etc.). This keeps the current title the visual star throughout the whole rotation.

**Adapted community shaders** (from [@kishimisu](https://www.shadertoy.com/user/kishimisu),
all CC BY-NC-SA 4.0, attribution kept in each shader header).  Each was wired into
our engine the same way: the source image colours the effect and drifts through as
a faint nebula (image-forward), and the music drives motion / glow / palette with
**jump-free** integrated phases (never `time*audio`).  All in the `normal` and
`psychedelic` presets.
- **`Voyager`** — a volumetric kaleidoscopic fly-through of a field of glowing
  cells, a deep-space-probe feel ([source](https://www.shadertoy.com/view/M33XDH)).
- **`FlowingWires`** — a 3D truchet raymarched into interlocking glowing wire
  loops ([source](https://www.shadertoy.com/view/DsBczR)).
- **`FractalBloom`** — a glowing fractal "flower" of bright kaleidoscopic rings
  ([source](https://www.shadertoy.com/view/mtyGWy), palette by iq).
- **`DiscoGodrays`** — a mirror-ball emanating fans of coloured volumetric
  godrays ([source](https://www.shadertoy.com/view/Dt33RS)).
- **`InsideSystem`** — an orbiting fly-through of neon torus lights in an
  infinite domain ([source](https://www.shadertoy.com/view/msj3D3)).
- **`Vortex`** — a kaleidoscopic raymarched vortex tunnel
  ([source](https://www.shadertoy.com/view/MX33Dr)).
- **`TheCore`** — a glowing warm core seen down a twisting tunnel of tubes
  ([source](https://www.shadertoy.com/view/cdy3Dd)).
- **`NeonTubes`** — a fly-through of pulsing neon rings in a repeating domain
  (a kishimisu code-golf raymarch).
- **`PsychedelicPills`** — raymarched floating capsules in psychedelic colours
  ([source](https://www.shadertoy.com/view/csfSRN)).
- **`ChromeDreams`** — a rotating chromatic tunnel of tori
  ([source](https://www.shadertoy.com/view/ctX3RM)).
- **`SphereGrid`** — a fly-through of an infinite lattice of spheres down a
  bright corridor (an untitled kishimisu raymarch).
- **`HexKaleido`** — a hexagonal jewel kaleidoscope of glowing rings
  (an untitled Shadertoy shader, [source](https://www.shadertoy.com/view/Xljczw)).
- **`MobiusOrbs`** — a ring of glowing orbs seen through a Möbius (1/r²)
  inversion, swirling into a psychedelic knot (an untitled Shadertoy shader,
  exact source page not given).
- **`BreathingFractal`** — a pulsing, spiralling fold-and-rotate lattice
  (an untitled Shadertoy shader, exact source page not given; its mouse-driven
  detune was replaced by the spectral centroid since this engine has no mouse).

`ChromeDreams` and `SphereGrid` go a step further with the images: instead of a
fixed procedural palette they are **coloured by the picture itself** — each
depth takes its colour from a slowly-drifting crop of the source image
(`imgPal`), so the palette *is* the image and keeps changing over time and with
the harmony (much like the Kaleidoscope folding different crops).  The same
image-crop colouring (there: `hueRot` shifting the palette's hue by the image)
is mixed into all the other adapted shaders above, including the three latest.

---

## Live control

- **Audio source (`d`):** a transient overlay lists every output device (captured
  via loopback) and input device (microphone / line-in); press a digit to switch
  the captured source **at runtime** — useful to react to a live band/room mic
  instead of the PC's own playback. No menu bar; same keyboard-overlay style as
  the config menu.
- **Now playing (`p`):** a tasteful lower-third fades in for a few seconds when
  the track changes, showing the current **title / artist** (from the Windows
  media session — works with Spotify, browsers, foobar2000, …). Toggle persists.
- **MIDI (automatic):** if a MIDI controller is connected it is opened on
  startup — knob **CC 1/2/3** map to reactivity / trails / mood, and any pad/key
  (Note-On) advances to the next effect. No device → no-op.

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
- **Adaptive timing:** fast music cuts scenes quickly, ambient holds for minutes;
  strong harmonic changes trigger musically-placed transitions.
- **Music/speech gate:** on speech / video dialogue / silence the reactivity
  fades to a calm, timer-driven mode; music smoothly re-enables it.
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
- **Real bloom:** a two-pass Gaussian bloom (quarter-res bright-pass + separable
  blur) replaces the old single-mip glow — soft halos around bright detail.
- **Recording** (`r`) now encodes JPEGs on a worker thread, so capturing no
  longer throttles the render loop.

**Photosensitivity safety:** a final pass rate-limits how fast the whole-frame
*average* luminance may rise, reining in large full-screen flashes while leaving
local pattern motion untouched. Audio brightness drivers are additionally
slew-limited at the source.

---

## GPU reaction-diffusion (live simulation effect)

`ReactionDiffusion` is a genuinely *simulated* effect, not a procedural pattern:
each frame a fragment shader (`ReactionDiffusionSim.frag`) advances a **Gray-Scott
reaction-diffusion PDE** in a ping-pong pair of `RGBA16F` float buffers (a fixed
320×320 grid, so it stays cheap even on an iGPU), reading its own previous state.
Onsets / beats inject fresh reagent, so the pattern **blossoms with the music**.
The living field is exposed on a global `texSim` sampler, colourised by the mood
(`ReactionDiffusion.frag`) and then folded by the kaleidoscope into radiating
organic structures. If `RGBA16F` render targets are unavailable the simulation is
skipped and the effect falls back to a dark mood-tinted field (never a crash).

> It uses fragment-shader ping-pong rather than GL 4.3 *compute* shaders on
> purpose: the renderer runs on an OpenGL **compatibility** profile (the GLee
> loader doesn't expose the compute / SSBO entry points), and a fragment-shader
> integrator gives the same simulation while staying portable to the weak NUC iGPU.

---

## Installation & robustness

Built for unattended, long-running installations:

- **Kiosk start:** `-c <config>` chooses the configuration, `-m <index>` the
  monitor (fullscreen), `-s <factor>` the render scale.
- **No sleep:** while running, the screensaver and system standby are suppressed
  and the display is kept awake.
- **Persistent state:** **`k`** saves the look settings (reactivity / trails /
  mood / render-scale) **and** the UI state (active configuration, auto-config
  and auto-scale toggles) to `..\kaleidoscope_settings.ini`, so the installation
  comes back up exactly as configured.
- **Logging (`-l`):** sends shader status, device reconnects and errors to
  `kaleidoscope.log` (keeping one previous session as `.log.1`) so an unattended
  machine stays diagnosable.
- **Stays smooth on its own:** adaptive render scale (key `g`) holds the frame
  rate near target without manual `-s` tuning; the heavy effect passes are also
  skipped whenever no cross-fade is in progress.
- **Self-healing audio:** if the default output device changes (switching outputs,
  unplugging headphones, an HDMI display sleeping), the WASAPI loopback capture
  reconnects automatically instead of going silent.
- **Missing media is safe:** an absent / empty image directory no longer crashes —
  a procedural fallback texture is used; a missing `Configurations` folder exits
  with a clear message.
- **Auto-config-by-mood** (`a`) and **track-change detection** keep the visuals
  matched to the music with no operator input.

---

## Project layout

- `AudioAnalyzer.{h,cpp}`, `AudioFeatures.h` — capture + real-time analysis
- `NowPlaying.{h,cpp}` — current track title/artist (Windows media session / WinRT)
- `MidiInput.{h,cpp}` — optional MIDI controller input (winmm)
- `glwidget.{h,cpp}` — `QOpenGLWidget`, input, overlay
- `filterShader.{h,cpp}` — the FBO render pipeline + audio→visual mapping
- `EffectShader.{h,cpp}`, `Uniform.{h,cpp}` — per-effect shader + uniform handling
- `Configuration.{h,cpp}` — XML config loading
- `*.frag` — the effects; `Present.frag` (mood grade + safety), `Feedback.frag`
  (trails), `ReactionDiffusionSim.frag` (the Gray-Scott PDE step) +
  `ReactionDiffusion.frag` (its display); `Configurations\*.xml` — presets

---

## Notes

- Rendering currently uses an OpenGL **compatibility profile** (fixed-function
  vertex path + GLSL 1.20 fragment shaders) under `QOpenGLWidget`.
- Built and tested on Qt 6.11.1 / VS 2026 (toolset v145), x64, NVIDIA OpenGL 4.6.
