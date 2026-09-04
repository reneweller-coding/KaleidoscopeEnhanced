# kill_orphans.ps1 -- collect the processes a killed batch script left behind.
#
# A render or screening run is started with Start-Process and stopped again by
# the script that started it.  When that script dies first (a tool run hitting
# its time limit, a cancelled job, a crash), the window it started keeps
# rendering FOR EVER: full GPU load and gigabytes of video memory, on a machine
# somebody is trying to work on.  Headless browser runs used to leave the same
# kind of debris behind.  Run this before and after any batch pass.
#
#   .\Tools\kill_orphans.ps1            # report and kill
#   .\Tools\kill_orphans.ps1 -WhatIf2   # report only
param([switch]$WhatIf2)

$killed = 0

function Sweep($name, $label, [scriptblock]$filter) {
    $ps = @(Get-Process $name -ErrorAction SilentlyContinue)
    if ($filter) { $ps = @($ps | Where-Object $filter) }
    foreach ($p in $ps) {
        $age = (New-TimeSpan -Start $p.StartTime -End (Get-Date)).TotalMinutes
        "{0,-22} PID {1,-7} {2,6:N0} MB  seit {3,5:N1} min" -f $label, $p.Id, ($p.WorkingSet64/1MB), $age
        if (-not $WhatIf2) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
        $script:killed++
    }
}

Sweep "Kaleidoscope" "Render-Fenster"
Sweep "ffmpeg"       "ffmpeg"
# Only headless browser runs are ours; a browser the user is reading in has no
# --headless on its command line and is never touched.
$edge = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
          Where-Object { $_.CommandLine -match '--headless' })
foreach ($e in $edge) {
    "{0,-22} PID {1,-7}" -f "Edge (headless)", $e.ProcessId
    if (-not $WhatIf2) { Stop-Process -Id $e.ProcessId -Force -ErrorAction SilentlyContinue }
    $killed++
}

if ($killed -eq 0) { "Keine Waisen gefunden." }
elseif ($WhatIf2)  { "$killed Waisen gefunden (nur gemeldet)." }
else               { "$killed Waisen beendet." }
