# verify.ps1 — the project's verification loop as a committed tool.
#
#   .\Tools\verify.ps1 -Smoke                 # run every preset 9 s, grep the log
#   .\Tools\verify.ps1 -Roundtrip             # PresetEditor --roundtrip per preset
#   .\Tools\verify.ps1 -Transcheck            # sweep all FxPlain styles
#   .\Tools\verify.ps1 -Scenes Physarum,JellyBody   # probe single visuals
#       (Scene3D names need -Geom to match: points|cubes|ribbon|grid|quads;
#        2D Scene effects are detected automatically)
#
# Probes run the Release exe offline (-w WAV) with recording (-r) and drop a
# late frame as Tools\probe_<name>.jpg for visual review.  A synthetic
# broadband WAV (kicks + sawtooth chords + hats) is generated on first use.

param(
    [string[]] $Scenes = @(),
    [string]   $Geom = "points",
    [switch]   $Smoke,
    [switch]   $Roundtrip,
    [switch]   $Transcheck,
    [int]      $Seconds = 16
)

$root = Split-Path $PSScriptRoot -Parent
$rel  = Join-Path $root "Release"
$cfgD = Join-Path $root "Configurations"
$wav  = Join-Path $PSScriptRoot "broadband120.wav"
$presets = @('Allround','Ambient','Club','Galerie','Komplett','Noir','Psychedelic')

if (-not (Test-Path (Join-Path $rel "Kaleidoscope.exe"))) {
    Write-Host "Release\Kaleidoscope.exe fehlt - erst bauen."; exit 1
}

function Make-Wav {
    if (Test-Path $wav) { return }
    Write-Host "[verify] generating broadband test WAV..."
    Add-Type -TypeDefinition @"
using System; using System.IO;
public static class BroadSynth {
  public static void Make(string path) {
    int sr = 48000; double dur = 30.0; int n = (int)(sr * dur);
    double[] buf = new double[n]; Random rng = new Random(7);
    for (double t0 = 0; t0 < dur - 0.01; t0 += 0.5) {
      int s0 = (int)(t0*sr); int len = (int)(0.3*sr);
      for (int i=0; i<len && s0+i<n; i++) {
        double t = (double)i/sr;
        buf[s0+i] += 0.7 * Math.Sin(2*Math.PI*55*t) * Math.Exp(-t/0.09); } }
    for (double t0 = 0.25; t0 < dur - 0.01; t0 += 0.5) {
      int s0 = (int)(t0*sr); int len = (int)(0.03*sr);
      for (int i=0; i<len && s0+i<n; i++) {
        double t = (double)i/sr;
        buf[s0+i] += 0.15 * (rng.NextDouble()*2-1) * Math.Exp(-t/0.008)
                   * Math.Sin(2*Math.PI*8000*t); } }
    double[] f0 = { 110, 165, 220, 277 };
    for (int i=0; i<n; i++) {
      double t = (double)i/sr;
      double trem = 0.75 + 0.25 * Math.Sin(2*Math.PI*0.23*t);
      double s = 0;
      for (int v=0; v<f0.Length; v++)
        for (int h=1; h<=12; h++)
          s += Math.Sin(2*Math.PI*f0[v]*h*t + v) / (h*1.35);
      buf[i] += 0.055 * s * trem + 0.02 * (rng.NextDouble()*2-1); }
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
    [BroadSynth]::Make($wav)
}

function Run-One([string]$name, [string]$args2, [int]$secs) {
    Remove-Item (Join-Path $rel "kaleidoscope.log") -Force -ErrorAction SilentlyContinue
    $p = Start-Process -FilePath (Join-Path $rel "Kaleidoscope.exe") `
         -ArgumentList $args2.Split(' ') -WorkingDirectory $rel -PassThru
    Start-Sleep -Seconds $secs
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force } else { Write-Host "$name : CRASHED" }
    Start-Sleep -Seconds 1
    $err = @(Select-String -Path (Join-Path $rel "kaleidoscope.log") `
             -Pattern 'OpenGL ERROR','FAILED','FATAL' -CaseSensitive)
    Write-Host "$name : errors=$($err.Count)"
    if ($err.Count -gt 0) { $err | Select-Object -First 5 | ForEach-Object { Write-Host "    $($_.Line)" } }
    return $err.Count
}

$fail = 0

if ($Smoke) {
    Make-Wav
    foreach ($c in $presets) { $fail += Run-One $c "-c $c -w `"$wav`" -l" 9 }
}

if ($Roundtrip) {
    $ed = Join-Path $root "PresetEditor\build\Release\PresetEditor.exe"
    if (-not (Test-Path $ed)) { Write-Host "PresetEditor.exe fehlt"; $fail++ }
    else { foreach ($p in $presets) {
        & $ed --roundtrip (Join-Path $cfgD "$p.xml") (Join-Path $env:TEMP "rt_$p.xml")
        if ($LASTEXITCODE -ne 0) { Write-Host "$p : roundtrip FAILED"; $fail++ }
        else { Write-Host "$p : roundtrip ok" } } }
}

if ($Transcheck) {
    $ed = Join-Path $root "PresetEditor\build\Release\PresetEditor.exe"
    & $ed --transcheck
    if ($LASTEXITCODE -ne 0) { $fail++ }
}

foreach ($s in $Scenes) {
    Make-Wav
    $is3D  = Test-Path (Join-Path $root "Scene3D\$s.frag")
    $dir   = if ($is3D) { "Scene3D" } else { "Scene2D" }
    $attrs = if ($is3D) { "type=`"scene3d`" geom=`"$Geom`"" } else { "type=`"normal`"" }
    $cfg   = Join-Path $cfgD "_verify.xml"
    $xml = '<configuration ImageDirectory="C:\Users\rene\Desktop\BilderPhotoechoes" ConfigurationName="verify">' + "`n" +
           '  <TextureShader file="..\\' + $dir + '\\' + $s + '.frag" ' + $attrs + ' probability="1.0" complexity="1" minTimeSolo="100" maxTimeSolo="120" minTimeInterpolation="20" maxTimeInterpolation="30">' + "`n" +
           "  </TextureShader>`n" +
           '  <CombineShader file="..\\FX\\FxPlain.frag" type="normal" probability="1.0" complexity="1" minTimeSolo="100" maxTimeSolo="120" minTimeInterpolation="20" maxTimeInterpolation="30">' + "`n" +
           "  </CombineShader>`n</configuration>"
    [IO.File]::WriteAllText($cfg, $xml)
    $fail += Run-One $s "-c _verify -w `"$wav`" -r -l" $Seconds
    $d = Get-ChildItem (Join-Path $rel "recordings") -Directory | Sort-Object Name | Select-Object -Last 1
    if ($d) {
        $jpgs = @(Get-ChildItem $d.FullName -Filter *.jpg | Sort-Object Name)
        if ($jpgs.Count -gt 0) {
            $f = [Math]::Max(0, $jpgs.Count - 5)
            Copy-Item $jpgs[$f].FullName (Join-Path $PSScriptRoot "probe_$s.jpg") -Force
            Write-Host "$s : $($jpgs.Count) frames -> Tools\probe_$s.jpg"
        }
    }
    Remove-Item $cfg -Force -ErrorAction SilentlyContinue
}

if ($fail -gt 0) { Write-Host "VERIFY: $fail FEHLER"; exit 1 }
Write-Host "VERIFY: alles ok"
