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

**Qt Creator** — `Kaleidoscope.pro` mirrors the VS project (same sources,
modules and defines), so the code can also be browsed and built from
Qt Creator with a Qt 6 / MSVC kit.  The VS project remains the primary
build (it also runs the moc/uic steps and the auto-deploy).

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
| `-r`          | Start recording (frames + audio) immediately on launch            |
| `-w <wav>`    | Offline: analyze this WAV instead of capturing live audio (test)  |
| `-o`          | Spout output: publish the frame as sender "Kaleidoscope"          |
| `-t <port>`   | Web remote: phone control page at `http://<pc>:<port>/`           |
| `-x <wav>`    | **Batch render**: record this WAV to an mp4, then exit (see below)|
| `-i <sender>` | **Spout input**: a live sender replaces the photos (see below)    |
| `-3 <mode>`   | **Stereo 3D**: `sbs`, `tb` or `ana`(glyph) — see below            |
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
| `v`        | Show the active shader names (debug overlay)                  |
| `l`        | Toggle the **stage lamps / light show** (corner cones etc.)   |
| `[` / `]`  | Reactivity — less / more audio-driven motion                  |
| `,` / `.`  | Trails — shorter / longer feedback trails                     |
| `-` / `=`  | Mood — weaker / stronger colour grading                       |
| `;` / `'`  | Latency — visuals earlier / later vs. the heard beat          |
| `b`        | **Blackout** — soft fade to black and back (VJ)               |
| `e`        | **Freeze** — hold the picture (VJ)                            |
| `t`        | **Tap tempo** — tap the beat to override tempo detection      |
| `u`        | **Pin** — hold the current effect (no automatic switches)     |
| `f`        | **Favourite** the current effect (persistent selection bonus) |
| `z`        | **Stereo 3D** — cycle off / side-by-side / top-bottom / anaglyph |
| `c` / `m`  | Stereo depth — weaker / stronger                              |
| `a`        | Toggle **auto-config-by-mood** (auto-switch configs)          |
| `g`        | Toggle **adaptive render scale** (auto-FPS)                   |
| `j`        | **MIDI learn** — bind knobs/pads to the controls              |
| `r`        | Toggle **recording** (frames + audio → mp4)                   |
| `y` / `x`  | Arm the **instant replay** ring / save it as an mp4           |
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

`Configurations\*.xml` define which shaders are in rotation, their
parameters, probabilities and mood tags, plus the **`ImageDirectory`** used
for textures.  Switch between them with the number keys.  Included presets
(rebuilt 2026-07 around the music-driven engine — the old
normal/fast/slow/… set lives on in git history):

- **Allround** — the full modern arsenal, balanced; a safe default
- **Club** — aggressive & bright: tunnels, godrays, lattices, analyzers
- **Ambient** — calm drift: fluid ink, lava, drones, liquid light shows
- **Galerie** — the *photos* star: kaleidoscopes, image tunnels, gentle folds
- **Psychedelic** — breathing fractals, pills, chrome, plasma, mushrooms
- **Noir** — dark, high-contrast: noir fractals, dark tunnels, deep drones
- **Komplett** — EVERY effect and combine shader in one rotation (49 texture
  effects + 21 combines, incl. the legacy set and combines that never had a
  config entry before)

**Themed shader pack (2026-07):** four new scene effects, spread across the
matching presets: **`InkWater`** (coloured ink plumes sinking into water and
billowing into marbled clouds — the image IS the ink; Ambient/Psychedelic),
**`Aurora`** (waving northern-lights curtains over a starfield, reach and
brightness breathing with the music; Ambient/Noir), **`CityBokeh`** (layers
of defocused night-city lights drifting in parallax, every bokeh disc
coloured by the picture, kicks pulsing a hashed subset; Noir/Club) and
**`BauhausGeo`** (a rotating Kandinsky/Bauhaus poster grid — discs, arcs,
bars, triangles in posterised image colours, snare-accented; Club/
Psychedelic).  All follow the house rules: image-based, per-activation
parameters, mood tags, flicker-free integrated motion.

**Timing is music-driven:** per-entry `min/maxTime*` attributes are now
OPTIONAL — the pacing comes from `timingScale` (tempo/arousal), 4-beat
cross-fades and section cuts.  Absent times fall back to engine defaults
(solo 20–90 s, fade 15–50 s — these mainly matter as the pacing without
music).  Old presets with explicit times keep working unchanged.

Each `<TextureShader>` / `<CombineShader>` entry names a `.frag` file, solo/
cross-fade times (scaled adaptively by tempo), a `probability` and a
`complexity`. Adjust the `ImageDirectory` attribute to point at your own photos.

**Per-activation variety:** `<bool>/<int>/<float>` child parameters are
re-rolled every time a shader is activated, so one shader yields many looks.
The adapted Shadertoy set uses this heavily — e.g. `MobiusOrbs` re-rolls its
zoom, orb size/radius and the **length and superellipse shape of its orbs**
(`stretchP` / `shapeP`), `Voyager` can fold the source image into a slowly
spinning n-segment kaleidoscopic rosette (`kSides`) with a per-flight corridor
height and speed, `DiscoGodrays` varies facet density and ray thickness,
`HexKaleido` zoom + swirl, `NoiseSpiral` twist + turbulence, `FractalBloom`
cell density + ring frequency, `SphereGrid` lattice spacing.  The whole
Shadertoy set (`FlowingWires`, `InsideSystem`, `Vortex`, `TheCore`,
`NeonTubes`, `PsychedelicPills`, `ChromeDreams`, the three
`BreathingFractal*` variants) additionally re-rolls its geometry character
(truchet density, lattice spacing, sector counts, tube/core radii, palette
offsets, …) and can weave a slowly spinning **n-fold kaleidoscopic image
rosette** into its light field (`kSides` / `rosetteP`) — the source picture
folded into a mandala, adding image colour on top of the procedural glow.
Extra music mappings across the set: the slow loudness **swell** breathes
sizes (wire/neon/tube thickness, cell heights), the slew-limited **bass**
pumps cores and orbs, and the **bar phase** sweeps the hue gently once per
bar.  Combine passes joined in too: `CombinePulse` re-rolls breath/shock/spin
depths and adds an onset-driven chromatic shimmer, `CombineDroneWarp` re-rolls
its warp field (scale follows the spectral centroid: bright material → finer
ripples), `CombineHexagon` re-rolls cell density and flashes cell borders on
the beat, `CombineMulti` gains a slow grid spin + swell zoom.  All parameters
follow the convention *absent/0 → the shader's original default*, so bare
entries (and old presets) keep working unchanged.

You don't have to hand-edit the XML — see the **Preset editor** below.

### Preset editor (standalone tool)

`PresetEditor/` is a separate little Qt app (`PresetEditor.vcxproj`, independent
of the visualizer) for **building and editing presets** with a **live preview**:

- Browse every texture effect and every combine shader — switch with the
  drop-downs or the keys `[` / `]` (texture) and `,` / `.` (combine); the preview
  renders the selected texture folded through the selected combine, driven by a
  synthesized "music" so audio-reactive shaders animate.
- **Add** the current texture or combine shader to the preset (`a` / `c` or the
  buttons), with its solo/interpolation **timings**, `type`, `probability` and
  `complexity`; the preset's contents are listed in an editable table.
- Set the preset **name**, `ImageDirectory` (used for the preview images too) and
  the global timing ranges; **New / Open… / Save** write standard
  `Configurations/<name>.xml` files the main app reads directly.
- **Load an existing preset** to edit it (per-shader `<bool>/<int>/<float>`
  parameters round-trip losslessly).

- **Transition test bench:** the *Übergangs-Zeitlupe* checkbox plays any of
  the 25 CombinePlain transition styles in slow motion (the blend sweeps
  back and forth over ~10 s) — for tuning styles visually.  Headless:
  `PresetEditor.exe --transcheck` sweeps ALL 25 styles with a pinned clock
  and verifies both endpoint identity (exactly scene A at the start,
  exactly scene B at the end — no leaks or snaps) and temporal continuity
  (no single step may dwarf the style's typical step); exits non-zero on
  failure, so it can guard future style additions.

Build it with MSBuild (`msbuild PresetEditor\PresetEditor.vcxproj
/p:Configuration=Release /p:Platform=x64`) or add it to the solution in Visual
Studio; run it with `C:\Qt\...\bin` on `PATH`.  Headless self-tests:
`PresetEditor.exe --roundtrip in.xml out.xml`,
`PresetEditor.exe --render tex.frag combine.frag out.png` and
`PresetEditor.exe --transcheck`.

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
- **`BreathingFractal`** — a pulsing, spiralling fold-and-rotate lattice (very
  likely the same base as, or the parent of,
  [DsscWn](https://www.shadertoy.com/view/DsscWn); its mouse-driven detune was
  replaced by the spectral centroid since this engine has no mouse).
- **`BreathingFractalZoom`** — the same fold-and-rotate lattice, forked from
  [DsscWn](https://www.shadertoy.com/view/DsscWn) with an oscillating zoom and
  a final cosine-palette remap
  ([palette source](https://www.shadertoy.com/view/dlVSDK)) — a rich, painterly
  look.
- **`BreathingFractalNoir`** — the same lattice, a second fork of DsscWn with
  different colour coefficients and a dark-base subtraction instead of a
  palette remap — a darker, high-contrast neon-net look.
- **`NoiseSpiral`** — a raymarched tunnel, domain-mirrored and twisted along
  the travel axis, eaten away by layered turbulent noise into a glowing,
  organic spiral (["playing with this idea"](https://www.shadertoy.com/view/w3VGzc)
  per the original's own comment).

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
- **Now playing (`p`) — TITLE REVEAL:** when the track changes, the title and
  artist (from the Windows media session — Spotify, browsers, foobar2000, …)
  are woven **through the picture itself**: the text unfolds out of a
  kaleidoscopic swirl, holds readable for a few seconds with a gentle beat
  glow, then grows toward the viewer and dissolves (~8 s, photosensitivity-
  limited, not sent to the clean Spout feed).  Toggle persists; the old
  QPainter lower third is retired.  Test without music:
  `set KALEIDO_TITLE_TEST=1` fires one demo reveal a few seconds after start.
- **MIDI (automatic):** if a MIDI controller is connected it is opened on
  startup — knob **CC 1/2/3** map to reactivity / trails / mood, and any pad/key
  (Note-On) advances to the next effect. No device → no-op.

### Android app (Kaleidoscope Remote)

`AndroidRemote\` contains a small native Android app that wraps the web
remote in a fullscreen WebView: enter the PC's address once
(`192.168.x.x:8080`, remembered; BACK reopens the dialog), and you get the
full remote — live preview, presets, next-effect, blackout, favourite,
replay, sliders — as a proper app with its own icon; the screen stays on
while it is open.  Because ALL logic lives on the PC, the app never needs
updating when the remote grows new controls.

**Build the APK** (no Gradle / Android Studio — plain SDK tools):
```powershell
powershell -ExecutionPolicy Bypass -File AndroidRemote\build-apk.ps1
```
produces `AndroidRemote\build\KaleidoscopeRemote.apk` (signed with a local
debug key that the script generates on first run).  One-time toolchain
setup (~450 MB, defaults expected under `C:\Android-Buildtools\`): unzip a
JDK 17 to `jdk17\` and the Android command-line tools to
`sdk\cmdline-tools\latest\`, then
`sdkmanager "platforms;android-34" "build-tools;34.0.0"`.  Paths can be
overridden via the script's parameters.

**Install & use:** copy the APK to the phone and tap it (allow "install
unknown apps" once — it is debug-signed, not from the Play Store).  Start
the visualizer with `-t 8080`, make sure PC and phone are on the same
network, and allow `Kaleidoscope.exe` through the **Windows firewall**
(private networks) when Windows asks — otherwise the phone cannot reach
the remote.  Requires Android 8.0+ (API 26).

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
- **Song-structure MEMORY:** each section additionally gets a spectral
  fingerprint (a ~1 s shape average, cosine-matched against up to 8 stored
  prints).  A RETURNING section — chorus #2 — is recognised (`sectionId`)
  and **replays the exact shader, combine and rolled parameter values** it
  had the first time; new sections roll fresh and are remembered.  The
  visuals thereby follow the song's form: every chorus looks the same,
  every verse different.  (V-C-V-C test WAV: ids 0, 1, 0 — the returning
  chorus matched with similarity 0.995 vs 0.888 for a different section.)
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
  translation unit so its GL extension loading never collides with GLee).
- **Latency compensation (`;` / `'`, persisted):** loopback capture +
  analysis + render + scanout lag the heard audio by ~40–80 ms; the display
  phase (tempo pulse, beat/bar phase) is led by an adjustable amount
  (default 50 ms) so pulses land ON the beat you hear.
- **Transition styles (25):** each cross-fade rolls one of 25 blend styles
  (linear stays the most common at ~20%).  Wipes/reveals: radial iris,
  diagonal wipe, staggered blinds, mosaic dissolve, push, sliding doors,
  clock sweep, dip-to-dark.  Edge-free full-frame morphs: kaleido folds
  (6- and spinning 8-mirror), zoom-through, swirl, water ripple,
  blur-through, wax melt, heat shimmer, pixelation, spin-zoom, chromatic
  (RGB staggered), luminance-ordered dissolve, double-exposure peak,
  jelly wobble, drain vortex, ghost multi-exposure.  Applied to both the
  effect and the combine blends.
- **Web remote (`-t <port>`):** a phone-friendly page at
  `http://<pc>:<port>/` with a **live preview image** (~1 Hz JPEG snapshot,
  captured only while the page is open), preset buttons, next-effect,
  **blackout**, **favourite** (taste learning), **replay arm + save**, and
  sliders for reactivity / trails / mood / latency plus light-show &
  auto-preset toggles.  LAN convenience only — no auth, don't expose it to
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
- **Shader hot-reload (dev):** saving any `Scene\*.frag` / `Combine\*.frag`
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
  scene (generic layout: corner + index + four seeds), the vertex shader
  animates everything from the audio uniforms.  Three scenes ship:
  **`ParticleGalaxy`** (60k point sprites in a spiral galaxy — the bass
  pumps the core, each kick rolls a shock ring outward, the camera orbits),
  **`CubeWave`** (an endless depth-tested neon-city flythrough whose 70×70
  cube columns ARE the 32-band equalizer; kicks flash the street),
  **`RibbonTunnel`** (20 glowing ribbons twisting around a weaving flight
  path; kicks bulge the tunnel, the bar phase swings the twist).  They mix
  into every preset like normal effects (combines fold them, trails work).
  **TRUE VR STEREO:** while a 3D scene plays solo in `-3 sbs`/`tb` mode it
  is rendered TWICE per frame with a real eye offset (two-camera stereo,
  convergence in the shader; separation follows the `c`/`m` depth knob) —
  the combine stage passes the eye-packed frame through untouched and the
  present pass shows each half directly.  During cross-fades the display
  falls back to the depth-reprojection seamlessly.
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
  climb (trails tighten, the camera slowly pushes in) and RELEASE on the
  drop: an immediate scene cut plus a camera hit.  Verified offline with a
  synthesized groove→build→break→drop WAV (fires exactly at the slam,
  zero phantom drops).
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
- **Kiosk watchdog:** the packaged `Kaleidoscope-Vollbild.bat` runs the app
  through `watchdog.ps1` — any abnormal exit (crash, GPU reset) restarts it
  after 5 s with logging on, so an installation never stays black; quitting
  with Esc/Q really quits, and 5 rapid crashes in a row give up instead of
  looping forever.
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

Reorganised 2026-07 into folders:

- `Source\` — all C++ sources/headers of the main app:
  `AudioAnalyzer.{h,cpp}` + `AudioFeatures.h` (capture + real-time analysis),
  `NowPlaying` (track title/artist), `MidiInput` (MIDI + learn),
  `glwidget` (`QOpenGLWidget`, input, overlays, replay, web-remote hooks),
  `filterShader` (FBO pipeline + audio→visual mapping), `EffectShader` /
  `Uniform` (per-effect shader + params), `Configuration` (XML loading),
  `WebRemote`, `SpoutOut` / `SpoutIn`, …  The Visual Studio project mirrors
  this layout in its Solution Explorer filters (Source Files / Header Files /
  Generated / ThirdParty\SpoutGL / Shaders\Scene|Combine|Blend /
  Configurations).
- `Scene\*.frag` — the 49 scene (texture) effects
- `Scene3D\*.vert + *.frag` — the REAL 3D scenes (vertex-shader animated
  geometry; ParticleGalaxy, CubeWave, RibbonTunnel)
- `Combine\*.frag` — the 21 combine passes (incl. `CombinePlain.frag`, which
  carries the 25-style transition library)
- `Blend\*.frag` — internal pipeline passes: `Present.frag` (mood grade +
  safety + dither), `Feedback.frag` (echo-warp trails), `BloomBlur.frag`,
  `ReactionDiffusionSim.frag` / `FluidSim.frag` (the GPU simulations),
  `CombineShader.frag`, `default.frag`
- `standard.vert` stays in the root (single shared vertex shader; the editor
  also locates the project root by it)
- `ThirdParty\SpoutGL\` — vendored Spout2 SDK; `PresetEditor\` — the editor;
  `Configurations\*.xml` — presets (entries reference `..\Scene\...` /
  `..\Combine\...`)

The deploy packaging (`deploy.ps1`) mirrors the same folder structure into
`dist\KaleidoscopeVisualizer\`.

---

## Notes

- Rendering currently uses an OpenGL **compatibility profile** (fixed-function
  vertex path + GLSL 1.20 fragment shaders) under `QOpenGLWidget`.
- Built and tested on Qt 6.11.1 / VS 2026 (toolset v145), x64, NVIDIA OpenGL 4.6.
