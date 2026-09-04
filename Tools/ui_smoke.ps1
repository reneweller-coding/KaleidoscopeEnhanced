<#
.SYNOPSIS
    Drives the built visualizer through its overlay menus and checks the result.

.DESCRIPTION
    The overlay menus are the one part of this app a compiler cannot check. Two
    separate bugs shipped that compiled perfectly and merely looked wrong: the
    Setup window's labels were off by five rows, and both menus silently capped
    their lists at nine entries. This script exercises them end to end against
    the real binary.

    Checks:
      * preset menu: arrow keys + Enter reach an entry the digit keys never could
      * preset menu: type-to-filter narrows the list and Enter picks from it
      * preset menu: Escape closes without switching, and does NOT quit the app
      * preset menu: a click picks a row, a click outside closes
      * audio menu:  Enter reaches a device past the ninth
      * audio menu:  type-to-filter works on device names
      * the freed digit keys do nothing

    Results are read back from kaleidoscope_settings.ini (activeConfig) and the
    analyzer's stderr ("Audio source: ..."), never from a screenshot.

.NOTES
    HARNESS CAVEATS, learned the hard way:

    * Keys go to the window handle via PostMessage, NOT SendInput. SendInput
      needs the window focused, and when SetForegroundWindow loses the race the
      keystrokes land in whatever else is focused -- not something a test may
      risk.
    * A posted WM_KEYDOWN still passes through TranslateMessage, which
      synthesises a WM_CHAR of its own. The key that OPENS a menu therefore
      arrives a second time as a character and lands in the filter, which
      filters the list down to nothing and makes every later step a silent
      no-op. Every open is followed by a Backspace to clear it. Real keyboards
      deliver one event per press and do not need this.
    * Printable characters are posted as WM_CHAR only, or they arrive twice.
    * Offline mode (-w) never enumerates audio devices -- the analyzer goes
      straight to the WAV path -- so the audio checks need a live capture run.

.EXAMPLE
    .\Tools\ui_smoke.ps1
    .\Tools\ui_smoke.ps1 -SkipAudio      # no live capture (quiet machine, CI)
#>
param(
    [string] $Exe = "",
    [switch] $SkipAudio
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Exe) { $Exe = Join-Path $root "Release\Kaleidoscope.exe" }
if (-not (Test-Path $Exe)) { Write-Host "not built: $Exe"; exit 2 }

$ini  = Join-Path $root "kaleidoscope_settings.ini"
$tmp  = Join-Path $env:TEMP "kaleido_uismoke"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$bak  = Join-Path $tmp "settings.bak"
Copy-Item $ini $bak -Force

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class UiSmoke {
  [DllImport("user32.dll")] public static extern IntPtr PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int t,bool r);
}
'@

$script:pass = 0
$script:fail = 0
function Check([string]$name, [bool]$ok, [string]$detail) {
    if ($ok) { $script:pass++; "  [ok]   {0,-34} {1}" -f $name, $detail }
    else     { $script:fail++; "  [FAIL] {0,-34} {1}" -f $name, $detail }
}
function K($h, [int]$vk) {
    [void][UiSmoke]::PostMessage($h, 0x0100, [IntPtr]$vk, [IntPtr]0); Start-Sleep -Milliseconds 50
    [void][UiSmoke]::PostMessage($h, 0x0101, [IntPtr]$vk, [IntPtr]0); Start-Sleep -Milliseconds 240
}
function Ch($h, [char]$c) { [void][UiSmoke]::PostMessage($h, 0x0102, [IntPtr][int]$c, [IntPtr]0); Start-Sleep -Milliseconds 200 }
function Click($h, [int]$x, [int]$y) {
    $lp = [IntPtr](($y -shl 16) -bor ($x -band 0xFFFF))
    [void][UiSmoke]::PostMessage($h, 0x0201, [IntPtr]1, $lp); Start-Sleep -Milliseconds 120
    [void][UiSmoke]::PostMessage($h, 0x0202, [IntPtr]0, $lp); Start-Sleep -Milliseconds 500
}
function SetIni([string]$k, [string]$v) {
    $t = Get-Content $ini -Raw
    if ($t -match "(?m)^$k=") { $t = $t -replace "(?m)^$k=.*$", "$k=$v" }
    else { $t = $t -replace "(?m)^\[General\]", "[General]`n$k=$v" }
    [IO.File]::WriteAllText($ini, $t)
}
function ActiveConfig { (Select-String -Path $ini -Pattern '^activeConfig=').Line -replace '^activeConfig=', '' }

# Starts the app, runs $body with the window handle, quits with 'q' (which saves).
function Session([scriptblock]$body, [switch]$Live) {
    Push-Location (Split-Path $Exe -Parent)
    $log = Join-Path $tmp "stderr.log"
    if ($Live) { $p = Start-Process -FilePath $Exe -RedirectStandardError $log -RedirectStandardOutput (Join-Path $tmp "out.log") -PassThru }
    # RELATIVE path on purpose: the repo path contains a space, and an absolute
    # one inside -ArgumentList leaves the app silently never starting. The
    # Push-Location above already put us in the binary's directory.
    else       { $p = Start-Process -FilePath $Exe -ArgumentList @('-w', '..\Tools\broadband120.wav') `
                                     -RedirectStandardError $log -RedirectStandardOutput (Join-Path $tmp "out.log") -PassThru }
    $h = [IntPtr]::Zero
    foreach ($i in 1..40) { Start-Sleep -Milliseconds 500; $p.Refresh(); if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $h = $p.MainWindowHandle; break } }
    if ($null -eq $h -or $h -eq [IntPtr]::Zero) { Pop-Location; throw "window never appeared (did the app start?)" }
    [void][UiSmoke]::MoveWindow($h, 40, 40, 1400, 900, $true)
    Start-Sleep -Seconds 5
    $res = & $body $h $p
    if (-not $p.HasExited) { K $h 0x51; Start-Sleep -Seconds 4 }
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -EA SilentlyContinue }
    Start-Sleep -Seconds 1
    Pop-Location
    return $res
}

try {
    SetIni "showHiddenPresets" "true"
    SetIni "activeConfig" "Komplett"
    Write-Host "Preset-Menue"

    # Reach the LAST entry, past where the digit keys ever went. End rather
    # than a count of Down presses: the Backspace above resets the cursor to
    # the first match (any filter change does), so a fixed number of steps
    # would be counting from a different place than a human would.
    #
    # With showHiddenPresets on, the menu IS the alphabetical Presets
    # listing, so both expectations below are positions in that listing:
    # Allround, Ambient, Club, Galerie, Komplett, Noir, Psychedelic,
    # SpaceAmbient, TestAlle. They no longer depend on whether the optional
    # model pack is installed -- there is no mesh-only preset left to drop out
    # of the list and shift everything after it, which is what these two
    # checks used to be silently sensitive to.
    Session { param($h, $p) K $h 0x30; K $h 0x08; K $h 0x23; K $h 0x0D } | Out-Null
    Check "End + Enter reach the last entry" ((ActiveConfig) -eq "TestAlle") ("-> " + (ActiveConfig))

    SetIni "activeConfig" "Komplett"
    Session { param($h, $p) K $h 0x30; K $h 0x08; for ($i=0; $i -lt 5; $i++) { K $h 0x28 }; K $h 0x0D } | Out-Null
    Check "5x Down from the top" ((ActiveConfig) -eq "Noir") ("-> " + (ActiveConfig))

    SetIni "activeConfig" "Komplett"
    Session { param($h, $p) K $h 0x30; K $h 0x08; foreach ($c in "psy".ToCharArray()) { Ch $h $c }; K $h 0x0D } | Out-Null
    Check "type-to-filter + Enter" ((ActiveConfig) -eq "Psychedelic") ("psy -> " + (ActiveConfig))

    SetIni "activeConfig" "Komplett"
    $alive = Session { param($h, $p)
        K $h 0x30; K $h 0x08; K $h 0x28; K $h 0x1B      # open, move, Escape
        Start-Sleep -Seconds 2; $p.Refresh(); return (-not $p.HasExited) }
    Check "Escape closes, does not quit" ($alive -and (ActiveConfig) -eq "Komplett") ("noch aktiv: " + (ActiveConfig))

    SetIni "activeConfig" "Komplett"
    Session { param($h, $p) K $h 0x30; K $h 0x08; Click $h 700 385 } | Out-Null
    Check "click picks a row" ((ActiveConfig) -ne "Komplett") ("-> " + (ActiveConfig))

    SetIni "activeConfig" "Komplett"
    Session { param($h, $p) K $h 0x30; K $h 0x08; Click $h 80 80 } | Out-Null
    Check "click outside switches nothing" ((ActiveConfig) -eq "Komplett") ("-> " + (ActiveConfig))

    SetIni "activeConfig" "Komplett"
    Session { param($h, $p) foreach ($d in @(0x31,0x33,0x37,0x39)) { K $h $d } } | Out-Null
    Check "digits 1-9 are unbound" ((ActiveConfig) -eq "Komplett") ("-> " + (ActiveConfig))

    # A double-click used to call exit(0). A slip of the hand ended the show.
    $aliveDbl = Session { param($h, $p)
        $lp = [IntPtr]((400 -shl 16) -bor 700)
        [void][UiSmoke]::PostMessage($h, 0x0201, [IntPtr]1, $lp); Start-Sleep -Milliseconds 80
        [void][UiSmoke]::PostMessage($h, 0x0202, [IntPtr]0, $lp); Start-Sleep -Milliseconds 80
        [void][UiSmoke]::PostMessage($h, 0x0203, [IntPtr]1, $lp); Start-Sleep -Milliseconds 80
        [void][UiSmoke]::PostMessage($h, 0x0202, [IntPtr]0, $lp)
        Start-Sleep -Seconds 3; $p.Refresh(); return (-not $p.HasExited) }
    Check "double-click does not quit" $aliveDbl "Prozess laeuft weiter"

    if (-not $SkipAudio) {
        Write-Host "Audio-Menue (Live-Aufnahme noetig)"
        $src = Session -Live { param($h, $p)
            K $h 0x44; K $h 0x08; for ($i=0; $i -lt 14; $i++) { K $h 0x28 }; K $h 0x0D
            Start-Sleep -Seconds 2
            $m = @(Select-String -Path (Join-Path $tmp "stderr.log") -Pattern '^Audio source:') | Select-Object -Last 1
            if ($m) { return $m.Line.Trim() } else { return "" } }
        Check "Enter reaches device past 9" ($src -ne "") $src

        $src2 = Session -Live { param($h, $p)
            K $h 0x44; K $h 0x08; foreach ($c in "cable".ToCharArray()) { Ch $h $c }; K $h 0x0D
            Start-Sleep -Seconds 2
            $m = @(Select-String -Path (Join-Path $tmp "stderr.log") -Pattern '^Audio source:') | Select-Object -Last 1
            if ($m) { return $m.Line.Trim() } else { return "" } }
        Check "device filter picks a match" ($src2 -match '(?i)cable') $src2
    }
}
finally {
    Copy-Item $bak $ini -Force
}

Write-Host ""
Write-Host ("{0} bestanden, {1} fehlgeschlagen" -f $script:pass, $script:fail)
exit ([int]($script:fail -gt 0))
