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
.\Release\Kaleidoscope.exe          # windowed 1920×1080
.\Release\Kaleidoscope.exe -b       # fullscreen (uses the 2nd monitor if present)
.\Release\Kaleidoscope.exe -s 0.5   # render the pipeline at 50% internal resolution
```

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

## Controls

| Key        | Action                                                        |
|------------|---------------------------------------------------------------|
| `Esc`, `Q` | Quit                                                          |
| `0`        | Toggle the configuration-select menu                          |
| `1`–`9`    | Switch configuration                                          |
| `i`        | Toggle the live audio-feature overlay                         |
| `n`        | Manually advance to the next effect (musical scene change)    |
| `[` / `]`  | Reactivity — less / more audio-driven motion                  |
| `,` / `.`  | Trails — shorter / longer feedback trails                     |
| `-` / `=`  | Mood — weaker / stronger colour grading                       |
| `s`        | Save a PNG screenshot of the window                           |
| mouse drag | (when not fullscreen) trackball / interaction                 |

The tuning keys (`[]`, `,.`, `-=`) change global look parameters shown in the
`i` overlay; they persist while the app runs.

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

**Photosensitivity safety:** a final pass rate-limits how fast the whole-frame
*average* luminance may rise, reining in large full-screen flashes while leaving
local pattern motion untouched. Audio brightness drivers are additionally
slew-limited at the source.

---

## Project layout

- `AudioAnalyzer.{h,cpp}`, `AudioFeatures.h` — capture + real-time analysis
- `glwidget.{h,cpp}` — `QOpenGLWidget`, input, overlay
- `filterShader.{h,cpp}` — the FBO render pipeline + audio→visual mapping
- `EffectShader.{h,cpp}`, `Uniform.{h,cpp}` — per-effect shader + uniform handling
- `Configuration.{h,cpp}` — XML config loading
- `*.frag` — the effects; `Present.frag` (mood grade + safety), `Feedback.frag`
  (trails); `Configurations\*.xml` — presets

---

## Notes

- Rendering currently uses an OpenGL **compatibility profile** (fixed-function
  vertex path + GLSL 1.20 fragment shaders) under `QOpenGLWidget`.
- Built and tested on Qt 6.11.1 / VS 2026 (toolset v145), x64, NVIDIA OpenGL 4.6.
