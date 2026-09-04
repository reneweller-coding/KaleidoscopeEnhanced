# trans_strip.ps1 -- a filmstrip across ONE transition's whole arc.
#
# render_catalog_images.ps1 -Kind trans gives a single frame per transition,
# picked for contrast.  That is the right thing for the catalogue and the wrong
# thing while BUILDING a transition: one frame cannot show whether the arc
# starts clean, does its one thing in the middle and lands exactly on the
# incoming scene.  This records one forced cross-fade and pulls a row of frames
# out of it, so the whole turn is visible at once.
#
#   .\Tools\trans_strip.ps1 -Name PageTurnFolio
#   .\Tools\trans_strip.ps1 -Name PageTurnFolio -OutDir strip -Secs 20
#
# Writes <OutDir>\<Name>_strip.jpg (and the single frames beside it).
param(
    [Parameter(Mandatory=$true)][string] $Name,
    [string] $OutDir = "strip",
    [int]    $Secs   = 20,
    [string] $ImageDir = "..\Images"
)

$root = Split-Path $PSScriptRoot -Parent
$rel  = Join-Path $root "Release"
$cfgD = Join-Path $root "Presets"
$out  = Join-Path $root "Docs\Catalog\rendered\$OutDir"
New-Item -ItemType Directory -Force -Path $out | Out-Null

& (Join-Path $PSScriptRoot "kill_orphans.ps1") | Out-Null

# The QUIET wav on purpose.  With a confident beat the scheduler clamps a
# cross-fade to four beats -- two seconds at 120 BPM -- and a two-second arc
# cannot be judged from a filmstrip.  catalog_scan.wav is quiet for its first
# 17 s, the rhythm confidence stays low, and the configured interpolation time
# survives, so the whole turn is spread out and every stage is visible.
$wav = Join-Path $PSScriptRoot "catalog_scan.wav"
if (-not (Test-Path $wav)) { Write-Host "catalog_scan.wav fehlt"; exit 1 }

[xml]$komplett = Get-Content (Join-Path $cfgD "Komplett.xml") -Raw

function Get-Scene([string]$dir, [string]$s) {
    $needle = ("..\$dir\$s.frag" -replace '\\+', '\')
    return $komplett.configuration.TextureShader |
           Where-Object { ($_.file -replace '\\+', '\') -eq $needle } | Select-Object -First 1
}

$needle = ("..\Transitions\$Name.frag" -replace '\\+', '\')
$tNode = $komplett.configuration.TransitionShader |
         Where-Object { ($_.file -replace '\\+', '\') -eq $needle } | Select-Object -First 1
if (-not $tNode) { Write-Host "$Name : NICHT in Komplett.xml"; exit 1 }

# Two visually unlike reference scenes, so it is obvious which one is showing.
$a = Get-Scene "Scene2D" "TunnelPlain"
$b = Get-Scene "Scene3D" "AuroraBorealisOverFjord"
if (-not $a -or -not $b) { Write-Host "Referenzszenen fehlen"; exit 1 }

# A short solo and a long interpolation: the fade starts almost at once and
# lasts long enough that a whole row of frames lands inside it.
foreach ($n in @($a, $b)) {
    $n.SetAttribute("probability", "1.0")
    $n.SetAttribute("minTimeSolo", "3");  $n.SetAttribute("maxTimeSolo", "4")
    $n.SetAttribute("minTimeInterpolation", "14"); $n.SetAttribute("maxTimeInterpolation", "14")
}
$trCopy = $tNode.CloneNode($true)
$trCopy.SetAttribute("probability", "1.0")
$xml = '<configuration ImageDirectory="' + $ImageDir + '" ConfigurationName="_catalog">' + "`n" +
       $a.OuterXml + "`n" + $b.OuterXml + "`n" + $trCopy.OuterXml + "`n" +
       '  <CombineShader file="..\\FX\\FxPlain.frag" type="normal" probability="1.0" complexity="1" minTimeSolo="100" maxTimeSolo="120" minTimeInterpolation="20" maxTimeInterpolation="30">' + "`n" +
       "  </CombineShader>`n</configuration>"
[IO.File]::WriteAllText((Join-Path $cfgD "_catalog.xml"), $xml)

# The transition has to be in the configuration: KALEIDO_TRANS_STYLE picks
# from the configuration's own list, and one with none falls back to Crossfade.
$env:KALEIDO_TRANS_STYLE = "$Name.frag"
$env:KALEIDO_MAX_RUNTIME_SECS = $Secs + 45
$env:KALEIDO_NO_ACTIVATE = 1
# Neutral grade: the mood tint rotates the whole frame by the musical key,
# which makes a transition's own colours impossible to judge.
$env:KALEIDO_MOOD = 0
$before = @(Get-ChildItem (Join-Path $rel "recordings") -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
$p = Start-Process -FilePath (Join-Path $rel "Kaleidoscope.exe") `
     -ArgumentList ('-c _catalog -w "{0}" -r -l' -f $wav) -WorkingDirectory $rel -PassThru
try { $p.PriorityClass = 'BelowNormal' } catch { }
Start-Sleep -Seconds $Secs
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 3

$dir = Get-ChildItem (Join-Path $rel "recordings") -Directory |
       Where-Object { $before -notcontains $_.Name } | Sort-Object LastWriteTime | Select-Object -Last 1
Remove-Item (Join-Path $cfgD "_catalog.xml") -Force -ErrorAction SilentlyContinue
if (-not $dir) { Write-Host "$Name : keine Aufnahme"; exit 1 }
$mp4 = Join-Path $dir.FullName "video.mp4"
if (-not (Test-Path $mp4)) { Write-Host "$Name : video.mp4 fehlt"; exit 1 }

# One row of frames across the fade.  The first scene solos 3-4 s, then the
# cross-fade runs 13-14 s, so 3..17 covers the whole arc with margin.
$stamps = @(2.5, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.5, 13.5)
$i = 0
foreach ($t in $stamps) {
    $f = Join-Path $out ("{0}_{1:d2}.png" -f $Name, $i)
    & ffmpeg -y -threads 4 -ss $t -i $mp4 -vframes 1 -q:v 2 $f 2>$null
    $i++
}
Write-Host "$Name : $i Frames in $out"
