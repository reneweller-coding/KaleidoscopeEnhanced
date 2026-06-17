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
            bin\
                Kaleidoscope.exe      <- the app
                Qt6*.dll, platforms\, ...  <- Qt runtime (via windeployqt)
                vcruntime140*.dll, msvcp140.dll  <- MSVC runtime
                icon.png

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
Copy-Item (Join-Path $root "*.frag") $pkgDir
Copy-Item (Join-Path $root "*.vert") $pkgDir
Copy-Item (Join-Path $root "Configurations") $pkgDir -Recurse
if (Test-Path (Join-Path $root "icon.png")) {
    Copy-Item (Join-Path $root "icon.png") $pkgDir
    Copy-Item (Join-Path $root "icon.png") $binDir   # window icon (loaded from CWD=bin)
}

# --- 3. copy exe + deploy Qt runtime ----------------------------------------
# This is a desktop-OpenGL QtWidgets app, so skip the software-GL fallback
# (opengl32sw.dll, ~20 MB) and the Direct3D shader compiler (d3dcompiler).
# We bundle the MSVC runtime ourselves (below), so no --compiler-runtime either.
Copy-Item $exeSrc $binDir
Info "Running windeployqt ..."
& $windeploy --release --no-translations --no-opengl-sw --no-system-d3d-compiler (Join-Path $binDir "Kaleidoscope.exe") | Out-Null

# --- 4. guarantee the MSVC runtime is present (standalone, no vc_redist) -----
foreach ($dll in @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll")) {
    $sys = Join-Path $env:WINDIR "System32\$dll"
    if (Test-Path $sys) { Copy-Item $sys $binDir -Force }
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
rem Launch fullscreen (kiosk). The screensaver/standby are suppressed while it runs.
rem Add -m <n> to choose a monitor, -c <name> a configuration, -s <factor> the render scale.
start "" /D "%~dp0bin" "%~dp0bin\Kaleidoscope.exe" -b %*
'@
Set-Content -Path (Join-Path $pkgDir "Kaleidoscope-starten.bat")  -Value $batWin -Encoding Ascii
Set-Content -Path (Join-Path $pkgDir "Kaleidoscope-Vollbild.bat") -Value $batFs  -Encoding Ascii

$readme = @'
Kaleidoscope Enhanced - Music Visualizer (portable / standalone)
================================================================

This folder is fully self-contained: it needs NO Qt and NO Visual Studio.
Just copy it anywhere on a 64-bit Windows PC and run it.

Start it:
  - Double-click  Kaleidoscope-starten.bat   (windowed)
  - Double-click  Kaleidoscope-Vollbild.bat  (fullscreen / installation)

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
