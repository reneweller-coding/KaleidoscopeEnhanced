# kill_orphans.ps1 -- collect the processes a killed batch script left behind.
#
# A render or screening run is started with Start-Process and stopped again by
# the script that started it.  When that script dies first (a tool run hitting
# its time limit, a cancelled job, a crash), the window it started keeps
# rendering FOR EVER: full GPU load and gigabytes of video memory, on a machine
# somebody is trying to work on.  Headless browser runs used to leave the same
# kind of debris behind.  Run this before and after any batch pass.
#
# ONLY OURS (16.10.2026).  It used to stop every Kaleidoscope.exe and every
# ffmpeg on the machine -- including another session's measurement run from its
# own copy, and the user's own encodes (on 26.09. a foreign AmbientSynth
# measurement went that way).  Now it takes only what provably came from a batch
# run of THIS repository:
#   * Kaleidoscope.exe started from this repository's Release folder with a batch
#     preset (`-c _catalog`, `_snap3`, ... -- the tools' presets start with "_")
#     whose parent process is gone (a snapshot pass running beside a catalogue
#     pass keeps its windows);
#   * ffmpeg whose parent process is gone and whose command line names this
#     repository (the recorder's pipe writes into it);
#   * headless Edge whose command line names this repository (the catalogue PDF).
# A window the user started from Release, an encode elsewhere, a browser being
# read in: never touched.  The batch windows also end themselves
# (KALEIDO_MAX_RUNTIME_SECS), so this is the second line, not the first.
#
#   .\Tools\kill_orphans.ps1            # report and kill
#   .\Tools\kill_orphans.ps1 -WhatIf2   # report only
param([switch]$WhatIf2)

$root    = (Split-Path $PSScriptRoot -Parent)
$exe     = Join-Path $root "Release\Kaleidoscope.exe"
$killed  = 0
$all     = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$alive   = @{}
foreach ($p in $all) { $alive[[int]$p.ProcessId] = $true }

function Names-Repo($cmd) {
    return $cmd -and ($cmd.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
                      $cmd.IndexOf($root.Replace('\', '/'), [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function Take($p, $label) {
    $age = if ($p.CreationDate) { (New-TimeSpan -Start $p.CreationDate -End (Get-Date)).TotalMinutes } else { 0 }
    "{0,-22} PID {1,-7} {2,6:N0} MB  seit {3,5:N1} min" -f $label, $p.ProcessId, ($p.WorkingSetSize / 1MB), $age
    if (-not $WhatIf2) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    $script:killed++
}

foreach ($p in $all) {
    $cmd = [string]$p.CommandLine
    switch -Regex ($p.Name) {
        '^Kaleidoscope\.exe$' {
            # an orphan: the script that started it is gone (a running snapshot pass's windows have their parent)
            if ($p.ExecutablePath -and ($p.ExecutablePath -ieq $exe) -and ($cmd -match '(^|\s)-c\s+"?_') -and
                -not $alive.ContainsKey([int]$p.ParentProcessId)) {
                Take $p "Render-Fenster"
            }
        }
        '^ffmpeg\.exe$' {
            if (-not $alive.ContainsKey([int]$p.ParentProcessId) -and (Names-Repo $cmd)) { Take $p "ffmpeg" }
        }
        '^msedge\.exe$' {
            if ($cmd -match '--headless' -and (Names-Repo $cmd)) { Take $p "Edge (headless)" }
        }
    }
}

if ($killed -eq 0) { "Keine Waisen gefunden." }
elseif ($WhatIf2)  { "$killed Waisen gefunden (nur gemeldet)." }
else               { "$killed Waisen beendet." }
