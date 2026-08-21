# scan_scenes.ps1 -- record many scenes into scene-named folders for scene_metrics.py.
#
#   .\Tools\scan_scenes.ps1 -Scenes A,B,C [-Seconds 8] [-Out scan]
#   .\Tools\scan_scenes.ps1 -All          # every Scene2D + Scene3D scene
#
# verify.ps1 names its recording folders by timestamp and keeps only one frame;
# the quantitative scan needs ALL frames, attributed to a scene.  This wrapper
# reuses verify.ps1's probe path per scene, then moves the run's recording
# folder to Release\<Out>\<SceneName>\.
#
# The app's Now-Playing / artist-image / music-video PiP overlay composites real
# SMTC media (and a downloaded YouTube video) over the render even in offline
# -w mode, which makes probe frames useless for visual or statistical review.
# This script therefore disables those three settings for the duration of the
# scan and restores kaleidoscope_settings.ini afterwards -- including on Ctrl-C.

param(
    [string[]] $Scenes = @(),
    [switch]   $All,
    [int]      $Seconds = 8,
    [string]   $Out = "scan",
    # Empty = pin ONE deterministically chosen photo (see below). Point this
    # at the full photo folder to measure under real slideshow conditions,
    # accepting that scenes which fold the image then vary run to run.
    [string]   $ImageDir = ""
)

$root   = Split-Path $PSScriptRoot -Parent
$rel    = Join-Path $root "Release"
$recDir = Join-Path $rel "recordings"
$outDir = Join-Path $rel $Out
$ini    = Join-Path $root "kaleidoscope_settings.ini"
$bak    = Join-Path $env:TEMP ("kaleidoscope_settings.scan.bak")

if ($All) {
    $Scenes = @(
        (Get-ChildItem (Join-Path $root "Scene2D") -Filter *.frag | ForEach-Object { $_.BaseName })
        (Get-ChildItem (Join-Path $root "Scene3D") -Filter *.frag | ForEach-Object { $_.BaseName })
    ) | Sort-Object -Unique
}
if (-not $Scenes -or $Scenes.Count -eq 0) { Write-Host "no scenes"; exit 1 }

# Pin the source image unless told otherwise. Scenes that fold the background
# photo inherit its brightness, so a random photo per run moves luma/contrast
# far more than any real defect -- a control re-scan of ten flagged scenes
# reproduced only four verdicts, with luma shifting by up to 2.7x on the rest.
if (-not $ImageDir) {
    $ImageDir = Join-Path $env:TEMP "kaleido_scan_image"
    New-Item -ItemType Directory -Force $ImageDir | Out-Null
    if (-not (Get-ChildItem $ImageDir -File)) {
        $srcPhotos = "C:\Users\rene\Desktop\BilderPhotoechoes"
        # The MEDIAN-brightness photo, not an arbitrary one: image-folding
        # scenes inherit the photo's brightness, so an unusually bright or dark
        # pick would make them read TOO_BRIGHT/TOO_DARK for a reason that has
        # nothing to do with the scene. Deterministic, and cached after the
        # first survey.
        & python (Join-Path $PSScriptRoot "pick_scan_image.py") $srcPhotos $ImageDir
        if (-not (Get-ChildItem $ImageDir -File)) {
            Write-Host "[scan] could not pick a photo from $srcPhotos"; exit 1
        }
    }
    Write-Host "[scan] pinned image: $ImageDir"
}

New-Item -ItemType Directory -Force $outDir | Out-Null

function Restore-Ini {
    if (Test-Path $bak) {
        Copy-Item $bak $ini -Force
        Remove-Item $bak -Force
        Write-Host "[scan] kaleidoscope_settings.ini restored"
    }
}

Copy-Item $ini $bak -Force
try {
    # Disable the overlays that would otherwise composite real media over frames.
    $txt = Get-Content $ini -Raw
    foreach ($kv in @(@('nowPlaying','false'), @('artistImages','false'), @('videoEnabled','false'),
                      @('autoScale','false'), @('renderScale','1'))) {
        if ($txt -match "(?m)^$($kv[0])=") { $txt = $txt -replace "(?m)^$($kv[0])=.*$", "$($kv[0])=$($kv[1])" }
        else { $txt = $txt -replace "(?m)^\[General\]", "[General]`n$($kv[0])=$($kv[1])" }
    }
    [IO.File]::WriteAllText($ini, $txt)

    # The app's own fps report ends up in Release\kaleidoscope.log via -l.
    $env:KALEIDO_FPS_LOG = "1"

    $i = 0
    foreach ($s in $Scenes) {
        $i++
        Write-Host "[scan $i/$($Scenes.Count)] $s"
        $before = @(Get-ChildItem $recDir -Directory -ErrorAction SilentlyContinue |
                    Select-Object -ExpandProperty Name)
        & (Join-Path $PSScriptRoot "verify.ps1") -Scenes $s -Seconds $Seconds -ImageDir $ImageDir | Out-Null
        $d = Get-ChildItem $recDir -Directory -ErrorAction SilentlyContinue |
             Where-Object { $before -notcontains $_.Name } | Sort-Object Name | Select-Object -Last 1
        if ($d) {
            $dest = Join-Path $outDir $s
            if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
            Move-Item $d.FullName $dest
            # Keep this scene's fps report next to its frames.
            $applog = Join-Path $rel "kaleidoscope.log"
            if (Test-Path $applog) { Copy-Item $applog (Join-Path $dest "fps.log") -Force }
        } else {
            Write-Host "  (no recording for $s)"
        }
    }
}
finally {
    Remove-Item Env:\KALEIDO_FPS_LOG -ErrorAction SilentlyContinue
    Restore-Ini
}

Write-Host "`n[scan] frames in $outDir"
Write-Host "[scan] now run:  python Tools\scene_metrics.py `"$outDir`" --json Tools\scene_metrics.json"
