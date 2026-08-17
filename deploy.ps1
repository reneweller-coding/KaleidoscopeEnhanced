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
            bin\
                Kaleidoscope.exe      <- the app
                PresetEditor.exe      <- preset authoring GUI (live preview,
                                         ranges, formula/audio mappings)
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
    cmd /c "`"$vcvars`" && msbuild Kaleidoscope.vcxproj /p:Configuration=Release /p:Platform=x64 /p:QTDIR=$QtDir /m /nologo /v:minimal"
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }
    Info "Building PresetEditor Release|x64 ..."
    cmd /c "`"$vcvars`" && msbuild PresetEditor\PresetEditor.vcxproj /p:Configuration=Release /p:Platform=x64 /p:QTDIR=$QtDir /m /nologo /v:minimal"
    if ($LASTEXITCODE -ne 0) { throw "PresetEditor build failed." }
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
# the exe references them as "..\Scene\...", so the folder structure must be
# mirrored in the package.
foreach ($d in @("Scene", "Scene3D", "Combine", "Blend")) {
    Copy-Item (Join-Path $root $d) $pkgDir -Recurse
}
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
$iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue)
$iss  = Join-Path $root "installer.iss"
if ($iscc -and (Test-Path $iss)) {
    Info "Inno Setup found - building setup.exe ..."
    & $iscc.Source $iss
    Info "Installer written to dist\ (see installer.iss OutputDir)."
} else {
    Info "Inno Setup (ISCC.exe) not found - skipping setup.exe."
    Info "The portable ZIP above is already a complete standalone package."
    Info "To build a classic installer later, install Inno Setup (free) and run:"
    Info "    ISCC.exe installer.iss"
}
