# render_catalog_images.ps1 — render the <Scene>_{A,B,C}.png / <Fx>_{2D,3D}.png
# frames Tools/make_catalog.py expects, for scenes/FX/transitions that changed
# since the catalogue images were last generated.
#
# The recorder now emits video.mp4 (no more per-scene JPEGs), so this pulls
# exact-timestamp frames out of the recording with ffmpeg instead of copying
# live-dumped JPGs.
#
#   .\Tools\render_catalog_images.ps1 -Kind scene -Names A,B,C -OutDir scan
#   .\Tools\render_catalog_images.ps1 -Kind fx    -Names FxOilPaint -OutDir fxscan
#   .\Tools\render_catalog_images.ps1 -Kind trans -Names Shatter    -OutDir fxscan
#
# Resumable: a scene/fx/trans whose full PNG triplet/pair already exists in
# -OutDir is skipped, so an interrupted run can just be re-invoked.

param(
    [Parameter(Mandatory=$true)][ValidateSet("scene","fx","trans")] [string] $Kind,
    [Parameter(Mandatory=$true)][string[]] $Names,
    [Parameter(Mandatory=$true)][string]   $OutDir,
    [string] $ImageDir = "C:\Users\rene\Desktop\BilderPhotoechoes"
)

$root  = Split-Path $PSScriptRoot -Parent
$rel   = Join-Path $root "Release"
$cfgD  = Join-Path $root "Configurations"
$wav   = Join-Path $PSScriptRoot "catalog_scan.wav"
$hotWav = Join-Path $PSScriptRoot "broadband120.wav"   ; # FX/transitions only need ONE audio-hot frame -- reuse the always-energetic tone instead of waiting for catalog_scan.wav's t=17 hot section
$out   = Join-Path $root "Docs\Catalog\rendered\$OutDir"
New-Item -ItemType Directory -Force -Path $out | Out-Null

if (-not (Test-Path (Join-Path $rel "Kaleidoscope.exe"))) {
    Write-Host "Release\Kaleidoscope.exe fehlt - erst bauen."; exit 1
}

# ---- quiet(0-17s) + hot(17-26s) synthetic WAV, generated once ----
function Make-CatalogWav {
    if (Test-Path $wav) { return }
    Write-Host "[render_catalog_images] generating quiet+hot WAV..."
    Add-Type -TypeDefinition @"
using System; using System.IO;
public static class CatalogSynth {
  public static void Make(string path) {
    int sr = 48000; double dur = 27.0; int n = (int)(sr * dur);
    double[] buf = new double[n]; Random rng = new Random(11);
    // Quiet bed (0..17s): a slow, low-level pad -- keeps musicPresence
    // "on" (not silence) but audioLevel/kick/onset all low, so scenes read
    // their calm, near-idle look.
    double[] padF = { 110, 164.8, 220 };
    for (int i = 0; i < n; i++) {
      double t = (double)i / sr;
      if (t >= 16.5) continue;
      double trem = 0.7 + 0.3 * Math.Sin(2*Math.PI*0.1*t);
      double s = 0;
      for (int v = 0; v < padF.Length; v++)
        s += Math.Sin(2*Math.PI*padF[v]*t + v) * 0.5;
      buf[i] += 0.028 * s * trem + 0.006 * (rng.NextDouble()*2-1);
    }
    // Hot section (17..27s): kicks + broadband chord stack + hats, same
    // shape as Tools/broadband120.wav's synth but confined to this window.
    for (double t0 = 17.0; t0 < dur - 0.01; t0 += 0.5) {
      int s0 = (int)(t0*sr); int len = (int)(0.3*sr);
      for (int i=0; i<len && s0+i<n; i++) {
        double t = (double)i/sr;
        buf[s0+i] += 0.7 * Math.Sin(2*Math.PI*55*t) * Math.Exp(-t/0.09); } }
    for (double t0 = 17.25; t0 < dur - 0.01; t0 += 0.5) {
      int s0 = (int)(t0*sr); int len = (int)(0.03*sr);
      for (int i=0; i<len && s0+i<n; i++) {
        double t = (double)i/sr;
        buf[s0+i] += 0.15 * (rng.NextDouble()*2-1) * Math.Exp(-t/0.008)
                   * Math.Sin(2*Math.PI*8000*t); } }
    double[] f0 = { 110, 165, 220, 277 };
    for (int i = (int)(17.0*sr); i<n; i++) {
      double t = (double)(i - (int)(17.0*sr))/sr;
      double trem = 0.75 + 0.25 * Math.Sin(2*Math.PI*0.23*t);
      double s = 0;
      for (int v=0; v<f0.Length; v++)
        for (int h=1; h<=12; h++)
          s += Math.Sin(2*Math.PI*f0[v]*h*t + v) / (h*1.35);
      buf[i] += 0.06 * s * trem + 0.02 * (rng.NextDouble()*2-1); }
    using (var bw = new BinaryWriter(File.Create(path))) {
      int dataLen = n*2;
      bw.Write(System.Text.Encoding.ASCII.GetBytes("RIFF")); bw.Write(36+dataLen);
      bw.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "));
      bw.Write(16); bw.Write((short)1); bw.Write((short)1);
      bw.Write(sr); bw.Write(sr*2); bw.Write((short)2); bw.Write((short)16);
      bw.Write(System.Text.Encoding.ASCII.GetBytes("data")); bw.Write(dataLen);
      for (int i=0; i<n; i++) {
        double v = Math.Max(-0.98, Math.Min(0.98, buf[i]));
        bw.Write((short)(v*32767)); } } } }
"@
    [CatalogSynth]::Make($wav)
}
Make-CatalogWav

function Run-One([string]$args2, [int]$secs) {
    Remove-Item (Join-Path $rel "kaleidoscope.log") -Force -ErrorAction SilentlyContinue
    $before = @(Get-ChildItem (Join-Path $rel "recordings") -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    $p = Start-Process -FilePath (Join-Path $rel "Kaleidoscope.exe") `
         -ArgumentList $args2.Split(' ') -WorkingDirectory $rel -PassThru
    Start-Sleep -Seconds $secs
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
    Start-Sleep -Milliseconds 800
    $d = Get-ChildItem (Join-Path $rel "recordings") -Directory -ErrorAction SilentlyContinue |
         Where-Object { $before -notcontains $_.Name } | Sort-Object Name | Select-Object -Last 1
    return $d
}

# (ConfigurationName is "_catalog" on purpose: -c matches that attribute,
# not the file name -- see the note in verify.ps1.)
# Build a synthetic single/double-scene _catalog.xml the same way verify.ps1
# does for a single-scene probe: prefer the REAL registered <TextureShader>
# node (custom params default to 0 otherwise, which can read as "broken").
function Get-SceneNode([xml]$komplett, [string]$dir, [string]$s) {
    $needle = ("..\$dir\$s.frag" -replace '\\+', '\')
    return $komplett.configuration.TextureShader |
           Where-Object { ($_.file -replace '\\+', '\') -eq $needle } |
           Select-Object -First 1
}
function Get-FxNode([xml]$komplett, [string]$tag, [string]$s) {
    $needle = ("..\FX\$s.frag" -replace '\\+', '\')
    if ($tag -eq "trans") { $needle = ("..\Transitions\$s.frag" -replace '\\+', '\') }
    $tagName = if ($tag -eq "trans") { "TransitionShader" } else { "CombineShader" }
    return $komplett.configuration.$tagName |
           Where-Object { ($_.file -replace '\\+', '\') -eq $needle } |
           Select-Object -First 1
}

[xml]$komplett = Get-Content (Join-Path $cfgD "Komplett.xml") -Raw
$cfg = Join-Path $cfgD "_catalog.xml"

$FX_REF_2D = "TunnelPlain"
$FX_REF_3D = "AuroraBorealisOverFjord"

foreach ($name in $Names) {

  if ($Kind -eq "scene") {
    $done = (Test-Path (Join-Path $out "${name}_A.png")) -and (Test-Path (Join-Path $out "${name}_B.png")) -and (Test-Path (Join-Path $out "${name}_C.png"))
    if ($done) { Write-Host "$name : already rendered, skip"; continue }

    $is3D = Test-Path (Join-Path $root "Scene3D\$name.frag")
    $dir  = if ($is3D) { "Scene3D" } else { "Scene2D" }
    $srcNode = Get-SceneNode $komplett $dir $name
    if (-not $srcNode) { Write-Host "$name : NOT IN Komplett.xml, skip"; continue }
    $srcNode.SetAttribute("probability", "1.0")
    # A family staged on sceneProgress runs its whole arc across the SOLO span,
    # so a 100 s solo leaves it at 8..21% of that arc at the three sampling
    # marks -- which for Assembly and MeshTerrain meant three near-black frames
    # of something that had not started yet. Give those a solo just longer than
    # the recording, so t=8/16/21 land at roughly a third, two thirds and the
    # end of the arc and the catalogue shows the family doing its one thing.
    $staged = $false
    foreach ($ext in @("frag", "vert", "geom")) {
        $sp = Join-Path $root "$dir\$name.$ext"
        if ((Test-Path $sp) -and (Select-String -Path $sp -Pattern "sceneProgress" -Quiet)) { $staged = $true }
    }
    if ($staged) { $srcNode.SetAttribute("minTimeSolo", "23"); $srcNode.SetAttribute("maxTimeSolo", "24") }
    else         { $srcNode.SetAttribute("minTimeSolo", "100"); $srcNode.SetAttribute("maxTimeSolo", "120") }
    $srcNode.SetAttribute("minTimeInterpolation", "20"); $srcNode.SetAttribute("maxTimeInterpolation", "30")
    $body = $srcNode.OuterXml

    $xml = '<configuration ImageDirectory="' + $ImageDir + '" ConfigurationName="_catalog">' + "`n" +
           $body + "`n" +
           '  <CombineShader file="..\\FX\\FxPlain.frag" type="normal" probability="1.0" complexity="1" minTimeSolo="100" maxTimeSolo="120" minTimeInterpolation="20" maxTimeInterpolation="30">' + "`n" +
           "  </CombineShader>`n</configuration>"
    [IO.File]::WriteAllText($cfg, $xml)

    $d = Run-One "-c _catalog -w `"$wav`" -r -l" 28
    if (-not $d) { Write-Host "$name : NO RECORDING"; continue }
    $mp4 = Join-Path $d.FullName "video.mp4"
    if (-not (Test-Path $mp4)) { Write-Host "$name : NO video.mp4"; continue }
    & ffmpeg -y -ss 8  -i $mp4 -vframes 1 -q:v 2 (Join-Path $out "${name}_A.png") 2>$null
    & ffmpeg -y -ss 16 -i $mp4 -vframes 1 -q:v 2 (Join-Path $out "${name}_B.png") 2>$null
    & ffmpeg -y -ss 21 -i $mp4 -vframes 1 -q:v 2 (Join-Path $out "${name}_C.png") 2>$null
    Write-Host "$name : rendered"
    Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
  }

  elseif ($Kind -eq "fx" -or $Kind -eq "trans") {
    $done = (Test-Path (Join-Path $out "${name}_2D.png")) -and (Test-Path (Join-Path $out "${name}_3D.png"))
    if ($done) { Write-Host "$name : already rendered, skip"; continue }

    $tgtNode = Get-FxNode $komplett $Kind $name
    if (-not $tgtNode) { Write-Host "$name : NOT IN Komplett.xml, skip"; continue }

    foreach ($refPair in @(@{ref=$FX_REF_2D; dim="2D"}, @{ref=$FX_REF_3D; dim="3D"})) {
      $refName = $refPair.ref; $dimTag = $refPair.dim
      $refIs3D = Test-Path (Join-Path $root "Scene3D\$refName.frag")
      $refDir  = if ($refIs3D) { "Scene3D" } else { "Scene2D" }
      $refNode = Get-SceneNode $komplett $refDir $refName
      if (-not $refNode) { Write-Host "$name : reference scene $refName missing, skip $dimTag"; continue }
      $refNode.SetAttribute("probability", "1.0")
      $refNode.SetAttribute("minTimeSolo", "100"); $refNode.SetAttribute("maxTimeSolo", "120")
      $refNode.SetAttribute("minTimeInterpolation", "20"); $refNode.SetAttribute("maxTimeInterpolation", "30")

      if ($Kind -eq "fx") {
        $fxCopy = $tgtNode.CloneNode($true)
        $fxCopy.SetAttribute("probability", "1.0")
        $fxCopy.SetAttribute("minTimeSolo", "100"); $fxCopy.SetAttribute("maxTimeSolo", "120")
        $fxCopy.SetAttribute("minTimeInterpolation", "20"); $fxCopy.SetAttribute("maxTimeInterpolation", "30")
        $xml = '<configuration ImageDirectory="' + $ImageDir + '" ConfigurationName="_catalog">' + "`n" +
               $refNode.OuterXml + "`n" + $fxCopy.OuterXml + "`n</configuration>"
        [IO.File]::WriteAllText($cfg, $xml)
        $env:KALEIDO_TRANS_STYLE = $null
        $useWav = $hotWav; $secs = 12; $tCap = 7
      } else {
        # Transition: alternate the OTHER fixed reference scene in as a
        # second TextureShader with a SHORT solo so a switch fires almost
        # immediately, a LONG interpolation so the fade is still visibly
        # mid-blend when we capture, and KALEIDO_TRANS_STYLE forces this
        # exact transition instead of leaving it to chance.
        $otherRef = if ($refName -eq $FX_REF_2D) { $FX_REF_3D } else { $FX_REF_2D }
        $otherIs3D = Test-Path (Join-Path $root "Scene3D\$otherRef.frag")
        $otherDir  = if ($otherIs3D) { "Scene3D" } else { "Scene2D" }
        $otherNode = Get-SceneNode $komplett $otherDir $otherRef
        if (-not $otherNode) { Write-Host "$name : other ref $otherRef missing, skip $dimTag"; continue }
        $otherNode.SetAttribute("probability", "1.0")
        $otherNode.SetAttribute("minTimeSolo", "3"); $otherNode.SetAttribute("maxTimeSolo", "4")
        $otherNode.SetAttribute("minTimeInterpolation", "10"); $otherNode.SetAttribute("maxTimeInterpolation", "12")
        $refNode.SetAttribute("minTimeSolo", "3"); $refNode.SetAttribute("maxTimeSolo", "4")
        $refNode.SetAttribute("minTimeInterpolation", "10"); $refNode.SetAttribute("maxTimeInterpolation", "12")
        $xml = '<configuration ImageDirectory="' + $ImageDir + '" ConfigurationName="_catalog">' + "`n" +
               $otherNode.OuterXml + "`n" + $refNode.OuterXml + "`n" +
               '  <CombineShader file="..\\FX\\FxPlain.frag" type="normal" probability="1.0" complexity="1" minTimeSolo="100" maxTimeSolo="120" minTimeInterpolation="20" maxTimeInterpolation="30">' + "`n" +
               "  </CombineShader>`n</configuration>"
        [IO.File]::WriteAllText($cfg, $xml)
        $env:KALEIDO_TRANS_STYLE = "$name.frag"
        $useWav = $hotWav; $secs = 14; $tCap = 9
      }

      $d = Run-One "-c _catalog -w `"$useWav`" -r -l" $secs
      Remove-Item Env:\KALEIDO_TRANS_STYLE -ErrorAction SilentlyContinue
      if (-not $d) { Write-Host "$name : NO RECORDING ($dimTag)"; continue }
      $mp4 = Join-Path $d.FullName "video.mp4"
      if (-not (Test-Path $mp4)) { Write-Host "$name : NO video.mp4 ($dimTag)"; continue }
      & ffmpeg -y -ss $tCap -i $mp4 -vframes 1 -q:v 2 (Join-Path $out "${name}_$dimTag.png") 2>$null
      Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "$name : rendered"
  }
}

Remove-Item $cfg -Force -ErrorAction SilentlyContinue
Write-Host "done."
