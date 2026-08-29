<#
.SYNOPSIS
    Build a standalone, self-contained package of the Kaleidoscope visualizer
    that runs on any 64-bit Windows machine WITHOUT Qt or Visual Studio installed.

.DESCRIPTION
    Stages everything the app needs into  dist\KaleidoscopeVisualizer\ :

        KaleidoscopeVisualizer\
            *.frag, *.vert            <- shaders          (the exe loads these from "..\")
            Configurations\*.xml      <- presets
            Kaleidoscope-starten.bat  <- double-click launcher (windowed)
            Kaleidoscope-Vollbild.bat <- fullscreen / kiosk launcher (-b)
            LIESMICH.txt              <- short end-user readme
            PresetEditor-starten.bat  <- preset editor launcher
            PresetEditor\             <- empty CWD anchor for the editor (its
                                         "..\Scene3D\..." asset paths resolve
                                         against this, mirroring the dev layout)
            Setup-starten.bat         <- settings tool launcher (optional extras)
            bin\
                Kaleidoscope.exe      <- the app
                PresetEditor.exe      <- preset authoring GUI (live preview,
                                         ranges, formula/audio mappings)
                KaleidoscopeSetup.exe <- offline kaleidoscope_settings.ini editor
                                         (lyrics/artist images/video/language/...)
                Qt6*.dll, platforms\, ...  <- Qt runtime (via windeployqt)
                vcruntime140*.dll, msvcp140.dll  <- MSVC runtime
                icon.ico                  <- window icon (multi-res); also
                                             embedded in Kaleidoscope.exe itself
                                             as its PE resource icon

    The launchers set the working directory to bin\ so the app's "..\" asset
    paths resolve to the package root.  The whole folder is then zipped to
    dist\KaleidoscopeVisualizer-portable.zip .

    If Inno Setup (ISCC.exe) is installed, a real setup.exe is also produced
    from installer.iss; otherwise the portable ZIP is the deliverable.

.PARAMETER Build
    Also (re)build Release|x64 before packaging.

.PARAMETER QtDir
    Qt kit directory (default C:\Qt\6.11.1\msvc2022_64).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -Build
#>
param(
    [switch] $Build,
    [string] $QtDir = "C:\Qt\6.11.1\msvc2022_64"
)

$ErrorActionPreference = "Stop"
$root      = $PSScriptRoot
$qtBin     = Join-Path $QtDir "bin"
$windeploy = Join-Path $qtBin "windeployqt.exe"
$exeSrc    = Join-Path $root "Release\Kaleidoscope.exe"
$distRoot  = Join-Path $root "dist"
$pkgName   = "KaleidoscopeVisualizer"
$pkgDir    = Join-Path $distRoot $pkgName
$binDir    = Join-Path $pkgDir  "bin"

function Info($m) { Write-Host "[deploy] $m" -ForegroundColor Cyan }

# --- 0. optional build -------------------------------------------------------
if ($Build) {
    Info "Building Release|x64 ..."
    Get-Process Kaleidoscope -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    $env:QTDIR = $QtDir
    $vcvars = "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
    $env:Path += ";C:\Program Files (x86)\Microsoft Visual Studio\Installer"   # vcvars64.bat calls vswhere.exe bare; not on PATH by default
    cmd /c "`"$vcvars`" && msbuild Kaleidoscope.vcxproj /p:Configuration=Release /p:Platform=x64 /p:QTDIR=$QtDir /m /nologo /v:minimal"
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }
    Info "Building PresetEditor Release|x64 ..."
    cmd /c "`"$vcvars`" && msbuild PresetEditor\PresetEditor.vcxproj /p:Configuration=Release /p:Platform=x64 /p:QTDIR=$QtDir /m /nologo /v:minimal"
    if ($LASTEXITCODE -ne 0) { throw "PresetEditor build failed." }
    Info "Building SetupTool Release|x64 ..."
    cmd /c "`"$vcvars`" && msbuild SetupTool\SetupTool.vcxproj /p:Configuration=Release /p:Platform=x64 /p:QTDIR=$QtDir /m /nologo /v:minimal"
    if ($LASTEXITCODE -ne 0) { throw "SetupTool build failed." }
}

if (-not (Test-Path $exeSrc))    { throw "Release\Kaleidoscope.exe not found - build first (use -Build)." }
if (-not (Test-Path $windeploy)) { throw "windeployqt not found at $windeploy - check -QtDir." }

# A previously-launched copy (e.g. the packaged exe) would lock the staging dir
# during a post-build run; close it before staging.
Get-Process Kaleidoscope -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 300

# --- 1. clean staging --------------------------------------------------------
Info "Staging into $pkgDir ..."
if (Test-Path $pkgDir) { Remove-Item $pkgDir -Recurse -Force }
New-Item -ItemType Directory -Path $binDir -Force | Out-Null

# --- 2. copy assets (parent of bin, mirroring the dev "..\" layout) ----------
# Shaders live in subfolders since the 2026-07 reorg (Scene / Combine / Blend);
# the exe references them as "..\Scene2D\...", so the folder structure must be
# mirrored in the package.
foreach ($d in @("Scene2D", "Scene3D", "FX", "Engine", "Transitions")) {
    Copy-Item (Join-Path $root $d) $pkgDir -Recurse
}
# The 3D models are OPTIONAL EXTRA CONTENT and deliberately NOT bundled: they
# run to about two gigabytes, which would dwarf the installer and the portable
# zip for content most users may not want. They are published as separate
# release assets (Tools\make_model_pack.ps1 builds them). Ship the empty
# folder plus a note, so there is an obvious place to unpack them into --
# Configuration.cpp skips any geom="mesh" scene whose model is missing, so
# the program is fully functional without them, just with fewer scenes.
$modelsDir = Join-Path $pkgDir "Models"
New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
@"
3D-Modelle / 3D models
======================

Dieser Ordner ist absichtlich leer. Die 3D-Modelle sind optionaler
Zusatzinhalt und werden getrennt heruntergeladen -- zusammen sind sie rund
ein Gigabyte und damit ein Vielfaches des Programms selbst.

  1. Modellpaket von der Releases-Seite laden:
     https://github.com/reneweller-coding/KaleidoscopeEnhanced/releases
  2. Den Inhalt (die .glb-Dateien) direkt in DIESEN Ordner entpacken.
  3. Programm neu starten.

Ohne die Modelle laeuft alles normal, nur die Szenen mit 3D-Objekten fehlen;
beim Start steht dann im Log, wie viele uebersprungen wurden. Die Pakete sind
nach Thema getrennt, man kann also auch nur einen Teil nehmen.

--

This folder is intentionally empty. The 3D models are optional extra content
and are downloaded separately -- together they come to about two gigabytes,
many times the size of the program itself.

  1. Get the model pack here:
     https://github.com/reneweller-coding/KaleidoscopeEnhanced/releases/tag/models-v2
  2. Unpack the .glb files straight into THIS folder.
  3. Restart the program.

Without them everything still works, you simply do not get the scenes that
use 3D objects; the startup log says how many were skipped. The packs are
split by theme, so taking just one of them is fine.

Once they are installed you also get a "Modelle" preset, which is nothing but
these scenes back to back. It is left out of the preset list while the models
are missing, so it never appears as an entry that shows nothing.
"@ | Set-Content -Path (Join-Path $modelsDir "LIESMICH-MODELLE.txt") -Encoding utf8

# The photo library is the same story: 977 licence-free 1024x1024 textures at
# roughly 600 MB, thirty times the installer. Every preset's ImageDirectory
# attribute points at this folder ("..\Images"), so unpacking the pack here is
# all it takes; RenderPipeline falls back to a procedural texture while it is
# empty, and says so at startup. Tools\make_image_pack.ps1 builds the archive.
$imagesDir = Join-Path $pkgDir "Images"
New-Item -ItemType Directory -Force -Path $imagesDir | Out-Null
@"
Bilder / Photos
===============

Dieser Ordner ist absichtlich leer. Er ist die eingestellte Bilderquelle des
Programms -- die Szenen, die Fotos verarbeiten (Kaleidoskope, Spiegelungen,
Galerie, Foto-Tunnel ...), holen ihr Material von hier.

Mitgeliefert wird ein Satz von 977 lizenzfreien, eigens erzeugten Texturen
(1024x1024, quadratisch, vollflaechig -- also ohne Motivrand, der beim
Spiegeln stoert). Zusammen sind das rund 600 MB und damit ein Vielfaches des
Programms, deshalb liegen sie als eigener Download bei den Releases.

  1. Bilderpaket von der Releases-Seite laden:
     https://github.com/reneweller-coding/KaleidoscopeEnhanced/releases
  2. Die .jpg-Dateien direkt in DIESEN Ordner entpacken.
  3. Programm neu starten.

EIGENE BILDER: Man muss die mitgelieferten nicht verwenden. Entweder eigene
Dateien einfach hier hineinlegen, oder -- schoener -- im Kaleidoscope Setup
unter "Bilderordner" den eigenen Ordner waehlen; das schreibt den Schluessel
imageDirectory in kaleidoscope_settings.ini. Unterordner werden mitdurchsucht,
erkannt werden JPG, JPEG und PNG. Fuer einen einzelnen Start geht auch
"Kaleidoscope.exe -f <Ordner>".

Ohne Bilder laeuft alles normal, die Foto-Szenen zeigen dann eine prozedural
erzeugte Ersatztextur; beim Start steht ein Hinweis im Log.

--

This folder is intentionally empty. It is the program's configured photo
source: every scene that works on photographs (kaleidoscopes, mirrors, the
gallery, photo tunnels, ...) takes its material from here.

A set of 977 licence-free, purpose-generated textures is available for it
(1024x1024, square, edge-to-edge -- no subject border to break the mirroring).
Together they come to roughly 600 MB, many times the size of the program, so
they are published as a separate download.

  1. Get the photo pack here:
     https://github.com/reneweller-coding/KaleidoscopeEnhanced/releases
  2. Unpack the .jpg files straight into THIS folder.
  3. Restart the program.

YOUR OWN PICTURES: you do not have to use the bundled ones. Either drop your
files in here, or -- better -- pick your own folder under "Photo folder" in
Kaleidoscope Setup, which writes the imageDirectory key into
kaleidoscope_settings.ini. Subfolders are searched too; JPG, JPEG and PNG are
recognised. For a single run, "Kaleidoscope.exe -f <folder>" also works.

Without any images everything still runs; the photo scenes fall back to a
procedurally generated texture and the startup log says so.
"@ | Set-Content -Path (Join-Path $imagesDir "LIESMICH-BILDER.txt") -Encoding utf8

Copy-Item (Join-Path $root "*.vert") $pkgDir
Copy-Item (Join-Path $root "Configurations") $pkgDir -Recurse
if (Test-Path (Join-Path $root "icon.png")) {
    Copy-Item (Join-Path $root "icon.png") $pkgDir
}
if (Test-Path (Join-Path $root "icon.ico")) {
    Copy-Item (Join-Path $root "icon.ico") $pkgDir
    Copy-Item (Join-Path $root "icon.ico") $binDir   # window icon (loaded from CWD=bin)
}

# --- 3. copy exe + deploy Qt runtime ----------------------------------------
# This is a desktop-OpenGL QtWidgets app, so skip the software-GL fallback
# (opengl32sw.dll, ~20 MB) and the Direct3D shader compiler (d3dcompiler).
# We bundle the MSVC runtime ourselves (below), so no --compiler-runtime either.
Copy-Item $exeSrc $binDir
Info "Running windeployqt ..."
# windeployqt writes advisory notes to stderr -- currently one about dxcompiler.dll,
# which is irrelevant to a desktop-OpenGL app.  Under $ErrorActionPreference="Stop"
# Windows PowerShell turns ANY stderr line from a native exe into a terminating
# error, so a harmless note would abort the whole deployment.  Judge it by its
# exit code instead, which is the only thing that actually says whether it worked.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $windeploy --release --no-translations --no-opengl-sw --no-system-d3d-compiler (Join-Path $binDir "Kaleidoscope.exe") | Out-Null
$deployExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($deployExit -ne 0) { throw "windeployqt failed with exit code $deployExit" }

# --- 3b. bundle the PresetEditor (preset authoring GUI) ----------------------
# Same Qt module set as the main app, but windeployqt is re-run on its exe so
# anything the main app happens not to pull stays covered (idempotent for the
# shared DLLs).  Soft-skip if the editor was never built: the main app's own
# Release PostBuild triggers this script, and at that moment the editor exe
# may legitimately not exist yet.
$editorSrc = Join-Path $root "PresetEditor\build\Release\PresetEditor.exe"
if (Test-Path $editorSrc) {
    Copy-Item $editorSrc $binDir
    $ErrorActionPreference = "Continue"
    & $windeploy --release --no-translations --no-opengl-sw --no-system-d3d-compiler (Join-Path $binDir "PresetEditor.exe") | Out-Null
    $deployExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    if ($deployExit -ne 0) { throw "windeployqt (PresetEditor) failed with exit code $deployExit" }
    # CWD anchor: the editor's main() does QDir::setCurrent(<root>/PresetEditor)
    # so the engine's "..\Scene3D\..." paths resolve to the package root -- the
    # folder must exist in the package.  It holds a note instead of being empty
    # because Compress-Archive silently DROPS empty directories from the zip.
    $anchorDir = Join-Path $pkgDir "PresetEditor"
    New-Item -ItemType Directory -Path $anchorDir -Force | Out-Null
    Set-Content -Path (Join-Path $anchorDir "LIESMICH.txt") -Encoding utf8 -Value @'
Dieser Ordner verankert das Arbeitsverzeichnis des Preset-Editors:
die Engine laedt Shader ueber relative Pfade ("..\Scene3D\..."), die von hier
aus auf den Paket-Stammordner zeigen. Bitte nicht loeschen.
'@
    Info "Bundled PresetEditor.exe"
} else {
    Info "PresetEditor\build\Release\PresetEditor.exe not found - packaging WITHOUT the editor"
}

# --- 3c. bundle the SetupTool (offline kaleidoscope_settings.ini editor) -----
# Needs no CWD anchor (unlike PresetEditor): SetupWindow::findRootDir() walks
# UP from its own exe directory looking for a "Configurations" landmark, and
# bin\'s parent (the package root) already has one.
$setupSrc = Join-Path $root "SetupTool\build\Release\KaleidoscopeSetup.exe"
if (Test-Path $setupSrc) {
    Copy-Item $setupSrc $binDir
    $ErrorActionPreference = "Continue"
    & $windeploy --release --no-translations --no-opengl-sw --no-system-d3d-compiler (Join-Path $binDir "KaleidoscopeSetup.exe") | Out-Null
    $deployExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    if ($deployExit -ne 0) { throw "windeployqt (SetupTool) failed with exit code $deployExit" }
    Info "Bundled KaleidoscopeSetup.exe"
} else {
    Info "SetupTool\build\Release\KaleidoscopeSetup.exe not found - packaging WITHOUT the setup tool"
}

# --- 4. bundle the FULL C++ runtime so the package is standalone everywhere ---
# Just shipping vcruntime140/msvcp140 is not enough: they depend on the Universal
# CRT (ucrtbase.dll + api-ms-win-crt-*.dll).  On a target whose UCRT is missing or
# older, DLL initialisation fails at load -> "0xc0000142".  So we ship the full VC
# CRT set from the VS redist AND the matching UCRT from the Windows SDK redist;
# only if those aren't present do we fall back to copying the core DLLs from
# System32 (works on the build machine itself, but less portable).

# VC++ CRT (msvcp140*, vcruntime140*, concrt140, ...): prefer the desktop x64
# redist over the onecore variant.
$vcRoot = "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Redist\MSVC"
$vcCrt = $null
if (Test-Path $vcRoot) {
    $cand = Get-ChildItem $vcRoot -Recurse -Filter "msvcp140.dll" -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\' -and $_.FullName -match '\.CRT' }
    $vcCrt = ($cand | Where-Object { $_.FullName -notmatch 'onecore' } | Select-Object -First 1)
    if (-not $vcCrt) { $vcCrt = ($cand | Select-Object -First 1) }
}
if ($vcCrt) {
    Copy-Item "$($vcCrt.DirectoryName)\*.dll" $binDir -Force
    Info "Bundled VC++ CRT from $($vcCrt.DirectoryName)"
} else {
    foreach ($dll in @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll")) {
        $sys = Join-Path $env:WINDIR "System32\$dll"
        if (Test-Path $sys) { Copy-Item $sys $binDir -Force }
    }
    Info "VC++ redist not found - copied core CRT from System32 (less portable)"
}

# Universal CRT (ucrtbase.dll + api-ms-win-crt-*.dll) from the Windows SDK redist.
$ucRoot = "C:\Program Files (x86)\Windows Kits\10\Redist"
$ucDir  = $null
if (Test-Path $ucRoot) {
    $ucDir = Get-ChildItem $ucRoot -Directory -ErrorAction SilentlyContinue |
             Where-Object { Test-Path "$($_.FullName)\ucrt\DLLs\x64\ucrtbase.dll" } |
             Sort-Object Name -Descending | Select-Object -First 1
}
if ($ucDir) {
    Copy-Item "$($ucDir.FullName)\ucrt\DLLs\x64\*.dll" $binDir -Force
    Info "Bundled UCRT from $($ucDir.FullName)\ucrt\DLLs\x64"
} else {
    Info "UCRT redist not found - relying on the target's system UCRT (may fail on un-updated Windows)"
}

# --- 4b. prune deployment bloat this desktop-GL app never loads --------------
# (vc_redist installer is redundant - we ship the loose runtime DLLs; the DX
#  shader compilers + software GL are only for Qt's D3D/RHI / softrender paths.)
foreach ($f in @("vc_redist.x64.exe", "dxcompiler.dll", "dxil.dll",
                 "opengl32sw.dll", "d3dcompiler_47.dll")) {
    $fp = Join-Path $binDir $f
    if (Test-Path $fp) { Remove-Item $fp -Force }
}

# --- 5. end-user launchers ---------------------------------------------------
# Launchers: `start "" /D <bin> <exe>` sets the new process's working directory to
# bin (so the app's "..\" asset paths resolve) WITHOUT relying on `cd`, using the
# full exe path - robust against spaces / odd launch dirs.  The exe is a
# Windows-subsystem app now, so no console window appears.
$batWin = @'
@echo off
rem Launch the visualizer windowed. Pass extra options through, e.g.:
rem   Kaleidoscope-starten.bat -c psychedelic -s 0.75
start "" /D "%~dp0bin" "%~dp0bin\Kaleidoscope.exe" %*
'@
$batFs = @'
@echo off
rem Launch fullscreen (kiosk) WITH WATCHDOG: if the app ever crashes it is
rem restarted after 5 s automatically (quitting with Esc/Q really quits).
rem Add -m <n> to choose a monitor, -c <name> a configuration, -s <factor> the render scale.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watchdog.ps1" %*
'@
# The kiosk watchdog: relaunches the app on any abnormal exit (crash, GPU
# reset, ...) so an unattended installation never stays black.  A normal quit
# (Esc/Q -> exit code 0) ends the loop; 5 rapid crashes in a row give up
# (otherwise a broken option would loop forever).  -l keeps a log for
# diagnosing whatever caused the restarts.
$watchdog = @'
param([Parameter(ValueFromRemainingArguments=$true)]$Rest)
$exe = Join-Path $PSScriptRoot 'bin\Kaleidoscope.exe'
$bin = Join-Path $PSScriptRoot 'bin'
# Build the argument list defensively: with no extra arguments $Rest is
# $null, and "array + $null" appends a NULL element that makes
# Start-Process THROW ("argument collection contains a null value") -
# the launcher would then do nothing at all.
$argList = @('-b','-l')
foreach ($r in $Rest) { if ($null -ne $r -and "$r" -ne '') { $argList += "$r" } }
$fast = 0
while ($true) {
    $t0 = Get-Date
    $p = Start-Process -FilePath $exe -ArgumentList $argList `
                       -WorkingDirectory $bin -PassThru
    $p.WaitForExit()
    if ($p.ExitCode -eq 0) { break }                     # normal quit (Esc/Q)
    if (((Get-Date) - $t0).TotalSeconds -lt 60) { $fast++ } else { $fast = 0 }
    if ($fast -ge 5) { break }                           # crash loop: give up
    Start-Sleep -Seconds 5
}
'@
Set-Content -Path (Join-Path $pkgDir "Kaleidoscope-starten.bat")  -Value $batWin -Encoding Ascii
Set-Content -Path (Join-Path $pkgDir "Kaleidoscope-Vollbild.bat") -Value $batFs  -Encoding Ascii
Set-Content -Path (Join-Path $pkgDir "watchdog.ps1")              -Value $watchdog -Encoding Ascii
if (Test-Path (Join-Path $binDir "PresetEditor.exe")) {
    # Console-subsystem on purpose: the console shows the shader-compile and
    # formula logs ("Expr OK: ..."), which is useful in an authoring tool.
    $batEd = @'
@echo off
rem Startet den Preset-Editor: Configurations\*.xml bearbeiten mit
rem Live-Shader-Vorschau, Parameter-Bereichen und Formel-/Audio-Mappings.
rem Das Konsolenfenster zeigt Shader-Compile- und Formel-Logs.
start "" /D "%~dp0bin" "%~dp0bin\PresetEditor.exe" %*
'@
    Set-Content -Path (Join-Path $pkgDir "PresetEditor-starten.bat") -Value $batEd -Encoding Ascii
}
if (Test-Path (Join-Path $binDir "KaleidoscopeSetup.exe")) {
    $batSetup = @'
@echo off
rem Startet das Setup-Programm: optionale Extras (Songtexte, Kuenstlerbilder,
rem Musikvideo, Sprache, Web-Remote-Port, ...) EIN/AUS ohne die Visualizer-App
rem zu starten. Aenderungen wirken beim naechsten Start von Kaleidoscope.exe.
start "" /D "%~dp0bin" "%~dp0bin\KaleidoscopeSetup.exe" %*
'@
    Set-Content -Path (Join-Path $pkgDir "Setup-starten.bat") -Value $batSetup -Encoding Ascii
}

$readme = @'
Kaleidoscope Enhanced - Music Visualizer (portable / standalone)
================================================================

This folder is fully self-contained: it needs NO Qt and NO Visual Studio.
Just copy it anywhere on a 64-bit Windows PC and run it.

Start it:
  - Double-click  Kaleidoscope-starten.bat   (windowed)
  - Double-click  Kaleidoscope-Vollbild.bat  (fullscreen / installation;
    includes a WATCHDOG: after a crash the app restarts by itself)

Useful options (append to either .bat, or edit the .bat):
  -c <name>   start configuration (e.g. darkambient, normal, psychedelic)
  -m <index>  fullscreen on monitor <index> (0-based)
  -s <factor> internal render scale 0.25..2.0 (lower = faster on weak GPUs)

Keys while running:  Esc/Q quit, 0 menu, 1-9 configs, i overlay (+FPS),
  n next effect, [ ] reactivity, , . trails, - = mood, a auto-config,
  k save look as default, s screenshot.

Pictures: the kaleidoscope textures come from the folder named in
  Configurations\*.xml  (the "ImageDirectory" attribute). Point it at your
  own photos. If it is missing, a built-in procedural texture is used instead
  (the program still runs - it never crashes on missing images).

Preset editor:
  - Double-click  PresetEditor-starten.bat  to edit Configurations\*.xml with
    a live shader preview: per-preset parameter ranges, and formula/audio
    mappings (which music signal drives which shader parameter). The console
    window it opens shows shader-compile and formula logs.

Setup tool:
  - Double-click  Setup-starten.bat  to switch the optional online extras
    (lyrics, artist images, music video, language DE/EN, web-remote port, ...)
    on or off without starting the visualizer itself. Takes effect the next
    time Kaleidoscope.exe starts.

It captures whatever is playing on the system (WASAPI loopback) and reacts to
the music. Requires a GPU with OpenGL 2.0+ (FBO); RGBA16F for the reaction-
diffusion effect.
'@
Set-Content -Path (Join-Path $pkgDir "LIESMICH.txt") -Value $readme -Encoding utf8

# --- 6. zip ------------------------------------------------------------------
$zip = Join-Path $distRoot "$pkgName-portable.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Info "Compressing -> $zip ..."
Compress-Archive -Path $pkgDir -DestinationPath $zip

$sizeMB = [math]::Round((Get-ChildItem $pkgDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
Info "Package ready: $pkgDir  ($sizeMB MB)"
Info "Portable ZIP : $zip"

# --- 7. optional Inno Setup installer ---------------------------------------
# Not just PATH: the Inno Setup installer does not add itself to PATH, so
# probe the standard install locations too (newest version first).
$isccPath = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
if (-not $isccPath) {
    $isccPath = @(
        "C:\Program Files\Inno Setup 7\ISCC.exe",
        "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe",
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
$iss = Join-Path $root "installer.iss"
if ($isccPath -and (Test-Path $iss)) {
    Info "Inno Setup found ($isccPath) - building setup.exe ..."
    # Same stderr trap as windeployqt above: judge ISCC by its exit code, not
    # by whether it happened to print a warning line to stderr.
    #
    # Retried, and ONLY for this reason: ISCC writes the setup executable and
    # then reopens it to stamp in icons and version info, and a real-time
    # virus scanner examining the file it just saw appear holds it open long
    # enough for EndUpdateResource to fail with Windows error 110. Inno Setup
    # names the cause in its own message. It cost three failed release builds
    # before the message was read rather than guessed at, because the compiler
    # output was being truncated away by the caller.
    #
    # Bounded and specific: the write is idempotent, the pause is longer than
    # a scan, and anything that is NOT this error still throws on the first
    # attempt rather than being retried blindly.
    $ErrorActionPreference = "Continue"
    $isccExit = 0
    $isccOutFile = Join-Path $distRoot "$($pkgName)-Setup.exe"
    $maxTries = 5
    for ($attempt = 1; $attempt -le $maxTries; $attempt++) {
        $isccOut  = & $isccPath $iss 2>&1
        $isccExit = $LASTEXITCODE
        $isccOut | ForEach-Object { Write-Host $_ }
        if ($isccExit -eq 0) { break }
        $locked = $isccOut | Select-String -Pattern "EndUpdateResource failed" -Quiet
        if (-not $locked) { break }
        if ($attempt -lt $maxTries) {
            # Growing pause: three attempts five seconds apart was not always
            # enough -- a full scan of a 21 MB executable can take longer than
            # that. Also drop the half-written file, so the scanner has nothing
            # left to hold and the next attempt starts from a fresh one.
            $wait = 5 * $attempt
            Remove-Item $isccOutFile -Force -ErrorAction SilentlyContinue
            Info "ISCC hit the antivirus file lock (error 110) - retrying in $wait s (attempt $attempt of $maxTries) ..."
            Start-Sleep -Seconds $wait
        }
    }
    $ErrorActionPreference = $prevEap
    if ($isccExit -ne 0) { throw "ISCC failed with exit code $isccExit" }
    Info "Installer written to dist\ (see installer.iss OutputDir)."
} else {
    Info "Inno Setup (ISCC.exe) not found - skipping setup.exe."
    Info "The portable ZIP above is already a complete standalone package."
    Info "To build a classic installer later, install Inno Setup (free) and run:"
    Info "    ISCC.exe installer.iss"
}
