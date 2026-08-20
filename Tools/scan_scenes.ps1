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
    [string]   $Out = "scan"
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
    foreach ($kv in @(@('nowPlaying','false'), @('artistImages','false'), @('videoEnabled','false'))) {
        if ($txt -match "(?m)^$($kv[0])=") { $txt = $txt -replace "(?m)^$($kv[0])=.*$", "$($kv[0])=$($kv[1])" }
        else { $txt = $txt -replace "(?m)^\[General\]", "[General]`n$($kv[0])=$($kv[1])" }
    }
    [IO.File]::WriteAllText($ini, $txt)

    $i = 0
    foreach ($s in $Scenes) {
        $i++
        Write-Host "[scan $i/$($Scenes.Count)] $s"
        $before = @(Get-ChildItem $recDir -Directory -ErrorAction SilentlyContinue |
                    Select-Object -ExpandProperty Name)
        & (Join-Path $PSScriptRoot "verify.ps1") -Scenes $s -Seconds $Seconds | Out-Null
        $d = Get-ChildItem $recDir -Directory -ErrorAction SilentlyContinue |
             Where-Object { $before -notcontains $_.Name } | Sort-Object Name | Select-Object -Last 1
        if ($d) {
            $dest = Join-Path $outDir $s
            if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
            Move-Item $d.FullName $dest
        } else {
            Write-Host "  (no recording for $s)"
        }
    }
}
finally {
    Restore-Ini
}

Write-Host "`n[scan] frames in $outDir"
Write-Host "[scan] now run:  python Tools\scene_metrics.py `"$outDir`" --json Tools\scene_metrics.json"
