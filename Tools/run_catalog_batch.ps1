# run_catalog_batch.ps1 — driver for render_catalog_images.ps1: reads the
# three name lists and renders scenes, then FX, then transitions, logging
# progress so a multi-hour run can be checked on without polling the process.
param(
    [string] $ScenesFile = "$PSScriptRoot\..\..\catalog_scenes.txt",
    [string] $FxFile     = "$PSScriptRoot\..\..\catalog_fx.txt",
    [string] $TransFile  = "$PSScriptRoot\..\..\catalog_trans.txt",
    [string] $LogFile    = "$PSScriptRoot\catalog_batch.log"
)

function Log($msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

Remove-Item $LogFile -Force -ErrorAction SilentlyContinue
Log "=== catalog batch render start ==="

$scenes = Get-Content $ScenesFile | Where-Object { $_.Trim() -ne "" }
$fx     = Get-Content $FxFile     | Where-Object { $_.Trim() -ne "" }
$trans  = Get-Content $TransFile  | Where-Object { $_.Trim() -ne "" }
Log "scenes=$($scenes.Count) fx=$($fx.Count) trans=$($trans.Count)"

Log "--- scenes (scan) ---"
& "$PSScriptRoot\render_catalog_images.ps1" -Kind scene -Names $scenes -OutDir scan 2>&1 |
    ForEach-Object { Log $_ }

Log "--- fx (fxscan) ---"
& "$PSScriptRoot\render_catalog_images.ps1" -Kind fx -Names $fx -OutDir fxscan 2>&1 |
    ForEach-Object { Log $_ }

Log "--- transitions (fxscan) ---"
& "$PSScriptRoot\render_catalog_images.ps1" -Kind trans -Names $trans -OutDir fxscan 2>&1 |
    ForEach-Object { Log $_ }

Log "=== catalog batch render DONE ==="
