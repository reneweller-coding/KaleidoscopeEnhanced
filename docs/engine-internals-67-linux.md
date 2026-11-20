## 20.11.2026 (67): Linux in the CI, and an AppImage

Packages D2 and D4 of docs/PLAN_2026-11-20.md. The README said "builds from source on Linux"; the last build had been
under WSL in mid-October (Ubuntu 22.04, Qt 6.2.4, 121 checks), and nothing had checked it since. Now the CI builds
it on every run, on two Ubuntu releases with two Qt versions, packs an AppImage and starts that AppImage in a fresh
container without Qt. Nobody has run it on a Linux machine with a graphics card and a sound server yet: the README
says so.

### What the CI does now (.github/workflows/ci.yml, beside the unchanged Windows job)

- **`linux`** -- Ubuntu 24.04, Qt 6.4.2 from the distribution, the packages the README names. `cmake` build,
  the self test `Kaleidoscope -q` under Xvfb, then a video export of a generated five-second WAV (`-e`, 640 x 360,
  30 fps, preset Club, `KALEIDO_SEED=1`) under Xvfb with Mesa's llvmpipe, then two preset switches over the web
  remote and a regular end. Gates: the build, `N passed, 0 failed`, exit codes 0, "Presets: N files read" with
  N > 0, an mp4 of 4.5..5.6 s by ffprobe, the program alive after each switch. A Linux build break makes the
  workflow red -- seen on the first run, which stopped at `uniform.h` (below).
- **`appimage`** -- Ubuntu 22.04 (the oldest runner GitHub still maintains: its glibc 2.35 is the floor the package
  needs), Qt 6.2.4 from the distribution, `bash Tools/appimage/build_appimage.sh`, the AppImage as the artifact
  `Kaleidoscope-AppImage` (14 days).
- **`appimage-run`** -- a fresh `ubuntu:24.04` container with what a desktop has (an X server, Mesa, fontconfig,
  harfbuzz, libOpenGL) and no Qt (the step fails if any libQt5/6 is installed). The AppImage runs with
  `--appimage-extract-and-run` (no FUSE in containers): `-q`, then the five-second export, started from a third folder
  with relative paths (`-e ../in/smoke.wav -d out/smoke.mp4 -l`) and a test photo in
  `~/.local/share/KaleidoscopeVisualizer/Images`. Gates: exit codes, the mp4's length, nothing new beside the
  AppImage, and four log lines: the program folder it moved into, the settings file in `~/.config`, the presets read,
  and the photo source in `~/.local/share` ("preset default", i.e. the preset's `..\Images` mapped).

### What was found

- *The first build on a case-sensitive file system* stopped at `Source/Uniform.cpp`: `#include "uniform.h"` for
  `Uniform.h`. The WSL builds ran on a Windows drive, which does not care. One include; a scan of all includes,
  all preset paths and all string paths in Source/ found no second case mismatch.
- *Qt 6.2.4 (Ubuntu 22.04) and 6.4.2 (24.04) build the current sources* without a version guard more than those of
  October. GCC's only warnings are two unchecked `fread` results in AudioAnalyzer.cpp.
- *What CMake builds:* the visualizer, nothing else. The Setup tool, the Preset editor and the export tool are
  vcxproj only. The export tool only drives `Kaleidoscope -e`, which exists on Linux; the Setup tool's settings are
  ini keys. The README says this now instead of implying the tools.
- *The program found nothing when started from elsewhere.* Every asset path is relative to the working folder
  (`../Engine`, `../Presets`), which on Windows the shortcuts and bin\ provide. An AppImage is started from wherever
  the user is.
- *Everything it writes went into its own folder*: the settings file and liked_rolls.tsv (`..\`), the log (`-l`),
  `recordings\`, scene-cost.json and the diagnostics files (working folder), the web remote's thumbnails
  (`..\ThumbCache`), the lyrics and artist cache (`..\cache`), Marked.xml (into `Presets\`), the screenshot and replay
  fallbacks. In a mounted AppImage all of that fails (read-only); with `--appimage-extract-and-run` it lands in a
  temporary copy that is deleted at the exit. The photos and models a preset names (`..\Images`, `..\Models\x.glb`)
  cannot be put into the image at all.

### What changed

- **`SettingsFile::userFolders()`** (Source/SettingsFile.h): true in an AppImage -- the runtime's APPDIR holds this
  executable (`/proc/self/exe`), so a program started from inside another AppImage does not count -- or when the
  root folder cannot be written to; **always false on Windows**. Then:

  | | normally (Windows, a writable build) | userFolders() |
  |---|---|---|
  | settings, liked_rolls.tsv | `..\kaleidoscope_settings.ini` | `~/.config/KaleidoscopeVisualizer/` |
  | log (`-l`), scene-cost.json | working folder | `~/.local/state/KaleidoscopeVisualizer/` |
  | thumbnails, lyrics/artist cache | `..\ThumbCache`, `..\cache` | `~/.cache/KaleidoscopeVisualizer/` |
  | recordings | `recordings\` (working folder) | `~/Videos/Kaleidoscope/recordings` |
  | screenshot/replay fallback (no Pictures/Videos) | working folder | `~/.local/share/KaleidoscopeVisualizer/` |
  | Marked.xml | `Presets\` | `~/.local/share/KaleidoscopeVisualizer/Presets` (read as presets too) |
  | the presets' `..\Images`, `..\Models` | the program's folders | `~/.local/share/KaleidoscopeVisualizer/Images`, `Models` |

  The XDG variables move them (a relative value is ignored, as the specification says). `writablePath(p, kind)`
  returns `p` with the host's separators -- the same string as before on Windows -- or the same name below the
  user's folder of that kind; `userContent(p)` maps only `..\Images` and `..\Models`. `check_settings_path.py`
  stays green: the literal is still only in SettingsFile.h.
- **main.cpp `enterProgramFolder()`** (not on Windows): in an AppImage always, otherwise when `../Engine` is not found
  from the working folder but from the executable's, the executable's folder becomes the working folder. The path
  options (`-e -d -w -x -f -k -v`) are taken relative to where the user started (`argPath()`); on Windows that
  function returns the argument unchanged. The log names both folders ("Program folder: ... (started in ...)").
- **Sound:** the capture still records `@DEFAULT_MONITOR@` (what the default output plays; PipeWire's pulse server
  answers to the name too). `PULSE_SOURCE` now picks another source -- libpulse applies it when the stream names
  no device, so with it set none is named. Moving the stream in pavucontrol works without it, for the session.
- **Background shader compile off with Mesa** (`parallelCompile()` in shader_setup.cpp, not on Windows): see the
  freeze under Numbers.
- **The photo loader stops cooperatively on Linux** (`endImageLoader()` in RenderPipeline.cpp): see Numbers.
- **Tools/appimage/build_appimage.sh** + `kaleidoscope.desktop`: cmake build, AppDir with the executable in usr/bin
  and Engine, Scene2D, Scene3D, FX, Transitions, Presets (tracked files only) and standard.vert in usr/ -- the
  layout the program expects -- then linuxdeploy `1-alpha-20251107-1` with linuxdeploy-plugin-qt `1-alpha-20250213-1`
  (pinned, downloaded into the work folder), extract-and-run (no FUSE needed to build).

### Numbers

- *The AppImage:* 39.7 MB (zstd squashfs), 146 MB unpacked, 103 ELF files; built in 2 min on the runner
  (`appimage` job about 2.5 min with the packages). From the system it takes, besides glibc and libstdc++, what
  linuxdeploy leaves to every desktop: libGL/libGLX/libEGL/libOpenGL, libX11/libxcb, fontconfig, freetype,
  harfbuzz, zlib. In the bare container two were missing at first (libOpenGL.so.0 for 22 files, libharfbuzz.so.0
  for 15); with `libopengl0` and `libharfbuzz0b` -- both on every desktop with Qt programs -- `ldd` finds all.
  libpulse(-simple) 15.99 and GStreamer's core libraries come along.
- *The self test* `-q`: 127 of 127 on Ubuntu 24.04 (Qt 6.4.2, build tree) and from the AppImage (Qt 6.2.4) in the
  container. As root in the container it was 126 of 127: "a settings file that cannot be written is noticed"
  cannot fail for root, who writes to a read-only file anyway -- the test runs as a normal user now
  (Tools/appimage/test_appimage.sh refuses root).
- *The export* under Xvfb with llvmpipe (LLVM 20.1.2, Mesa 25.2.8, OpenGL 4.3 core): 150 frames of 640 x 360 in
  12.8..13.3 s, 18.3..18.9 ms of engine time per frame, the mp4 5.000 s long; the same in the build tree and from
  the AppImage. All twelve presets read in 0.42 s ("Presets: 12 files read"), with the test photo found in
  `~/.local/share/KaleidoscopeVisualizer/Images` ("Nr of images: 1").
- *Written by the AppImage run:* the log in `~/.local/state`, Qt's and Mesa's own shader caches in `~/.cache`
  (5 and 659 files) -- nothing beside the AppImage, nothing in the extracted copy that outlives the run.
- *The first export ended with exit code 134* ("QThread: Destroyed while thread is still running") after its video
  was complete: RenderPipeline deleted the photo loader right after `terminate()`. On Windows `terminate()` has
  ended the thread when it returns; on Linux it is a `pthread_cancel`, and the thread ends at its next cancellation
  point -- a sleep, or a `read()` inside a JPEG decoder, leaving behind whatever that held. First fixed with a
  `wait()` after it; now `endImageLoader()`: Windows as always (`terminate()`, then a `wait()` that returns at once),
  Linux asks (`requestInterruption()`, which `ImageLoader::run()` checks between photos and between candidates) and
  waits, 50 ms at most when idle. On Linux the same race decided every switch of
  preset (`RenderPipeline::stop()` from GLwidget::timerEvent) and every end through the destructors (an export, a
  batch render, closing the window; Esc/q leave by `exit()`), and the deleting thread wins it nearly always. The runs
  the October WSL entries name were `-q` and `--schedule`, neither of which starts the loader. The `linux` job now
  also switches the preset twice over the web remote (`/api/config` with the `X-Kaleido: 1` header) and ends by
  `KALEIDO_MAX_RUNTIME_SECS`. That step was not run against the unrepaired loader; the export's exit code 134 was
  the failure seen.
- *A freeze inside Mesa after a preset switch.* One CI run of that step never ended. A temporary workflow repeated it
  (export first, then ten runs per machine, the hung program's threads shown by gdb): the main thread sat in a deep
  self-recursion inside libgallium, entered from `shaderPrebuildStart()` -- the background compile through
  GL_KHR_parallel_shader_compile -- at the first frames after the second switch, whatever scene came up. Per
  machine 0 to 10 of 10 runs (31 of 50 in one round; Club -> Cinematic -> Noir 39 of 40); with
  `KALEIDO_NO_PARALLEL_COMPILE=1` none of 30. Mesa's debug symbols for that build (25.2.8-0ubuntu0.24.04.5) are on
  neither Ubuntu's debuginfod nor ddebs, so the Mesa function is not named. libgallium holds the GLSL front end and
  every Gallium driver (radeonsi, iris as well), and only llvmpipe could be run here; so on Linux the background
  compile is off for every Mesa driver (`SHADER: background compile off (Mesa; ...)`), `KALEIDO_PARALLEL_COMPILE=1`
  turns it on again, NVIDIA's own driver keeps it, Windows is unchanged. The cost is a compile at first use of a
  scene instead of beforehand. Whether radeonsi or iris freeze too is open; the switch step goes Club -> Cinematic ->
  Noir, the combination that froze most reliably, so a regression shows.
- *Times on the runners:* `linux` 3.1 min (packages 34 s, build 43 s, self test 24 s, export 20 s, switches 50 s),
  `appimage` 2.1 min (the AppImage itself 81 s), `appimage-run` 1.1 min; the three run beside the Windows job (about
  12 min), so the workflow takes no longer than before. llvmpipe renders the 1920 x 1080 window at render scale 0.25 with 4..9 fps.
- *apt on the 24.04 runner:* the runner's mirror list (us-east-2.ec2.archive.ubuntu.com first) delivered 34 packages
  in 6.5 minutes, three runs in a row, where the first run had needed 29 s; putting other mirrors in front of the
  list changed nothing (apt kept the EC2 one). The container jobs on the same runner image, which use
  archive.ubuntu.com, installed in seconds. The `linux` job names that archive in its sources now and skips the
  man-db index rebuild.

### What it does not cover, and what was left out

- *Real hardware.* Everything ran on llvmpipe under Xvfb: no GPU driver, no Wayland, no sound server. Whether the
  capture hears PipeWire, whether the NVIDIA/AMD drivers compile all 3,200 shaders as Mesa does, how fast it is,
  whether Mesa's GPU drivers need the background compile switched off as llvmpipe does -- open until someone runs it.
- *FUSE mounting.* The container has no FUSE, so the test uses `--appimage-extract-and-run`; the normal start
  mounts the image read-only, which userFolders() covers by the same rule (APPDIR).
- *Wayland.* The Qt plugin deploys the xcb platform only; on a Wayland desktop Qt falls back to XWayland.
- *Video input (`-v`).* Qt 6.2's multimedia is built on GStreamer; the AppImage carries GStreamer's core libraries
  but none of its plugins, so it depends on the system's. Not tested.
- *ShaderForge* (the program-binary cache) stays Windows-only (it keys on LOCALAPPDATA); on Linux the drivers keep
  their own caches under `~/.cache`. Not ported: no measurement says it is needed there.
- *A newer Qt in the AppImage* (aqt's 6.8 binaries) was not tried: the distribution's Qt on the oldest runner is the
  combination linuxdeploy-plugin-qt is made for, and it builds the sources.
- *Release:* the AppImage is a CI artifact. It becomes a release package with v1.20.0, with the user's OK.
