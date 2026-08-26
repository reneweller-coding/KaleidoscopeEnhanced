<#
.SYNOPSIS
    Packs Models/ into the downloadable 3D model pack.

.DESCRIPTION
    The 3D models are optional extra content, not part of the repository: at
    roughly a gigabyte they outweigh everything else many times over, and git
    keeps blobs forever, so committing them could not be undone. They are
    published as GitHub release assets instead -- a release asset may be up to
    2 GiB and does not count toward the repository's size.

    The engine treats them as optional: Configuration.cpp skips any
    geom="mesh" scene whose model file is missing, and reports the count once
    at startup. A plain install therefore works, with fewer scenes.

    The pack is split by THEME rather than shipped as one archive. Each part
    is a few hundred MB, which is far friendlier to download and lets someone
    take just the ships, or just the non-space content. Unpacking any subset
    into Models/ enables exactly the scenes that subset covers.

.PARAMETER OutDir
    Where to write the archives. Defaults to dist\.

.PARAMETER Single
    Write ONE archive containing everything instead of the themed split.

.EXAMPLE
    .\Tools\make_model_pack.ps1
    .\Tools\make_model_pack.ps1 -Single -OutDir C:\temp
#>
[CmdletBinding()]
param(
    [string] $OutDir = "",
    [switch] $Single
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$models = Join-Path $root "Models"
if (-not $OutDir) { $OutDir = Join-Path $root "dist" }

if (-not (Test-Path $models)) { throw "No Models folder at $models" }
$all = Get-ChildItem (Join-Path $models "*.glb")
if ($all.Count -eq 0) { throw "Models folder is empty - nothing to pack." }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Which theme a model belongs to is decided by the scenes that USE it, so the
# split cannot drift out of step with the catalogue: parse Komplett.xml and
# group by the shader family each model appears under.
$cat = Get-Content (Join-Path $root "Configurations\Komplett.xml") -Raw
$themeOf = @{}
foreach ($m in [regex]::Matches($cat, '<TextureShader[^>]*?Scene3D\\(?<fam>\w+)\.frag[^>]*?>')) {
    $fam = $m.Groups['fam'].Value
    $theme = switch -Regex ($fam) {
        'Ship(Flyby|Docking)|AtmosphericEntry|Spaceship|Hologram' { 'ships' }
        'Station$'                                               { 'stations' }
        default                                                  { 'earthbound' }
    }
    foreach ($mm in [regex]::Matches($m.Value, 'Models\\(?<n>[A-Za-z0-9]+)\.glb')) {
        $n = $mm.Groups['n'].Value
        # A model used by several families lands in the first one that claims
        # it; stations pulled into docking scenes stay with the stations.
        if (-not $themeOf.ContainsKey($n)) { $themeOf[$n] = $theme }
        elseif ($themeOf[$n] -eq 'ships' -and $theme -eq 'stations') { $themeOf[$n] = 'stations' }
    }
}

function New-Pack([string]$name, $files) {
    if ($files.Count -eq 0) { return }
    $zip = Join-Path $OutDir "KaleidoscopeModels-$name.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $files.FullName -DestinationPath $zip -CompressionLevel Optimal
    $mb = (Get-Item $zip).Length / 1MB
    "{0,-46} {1,4} Modelle  {2,7:N0} MB" -f (Split-Path $zip -Leaf), $files.Count, $mb
}

Write-Output "Packing $($all.Count) models from $models"
Write-Output ""
if ($Single) {
    New-Pack "all" $all
} else {
    foreach ($t in @('ships', 'stations', 'earthbound')) {
        New-Pack $t ($all | Where-Object { $themeOf[$_.BaseName] -eq $t })
    }
    $orphans = $all | Where-Object { -not $themeOf.ContainsKey($_.BaseName) }
    if ($orphans) {
        Write-Output ""
        Write-Output "Not referenced by any scene, left out of the packs:"
        $orphans | ForEach-Object { "  $($_.BaseName)" }
    }
}

Write-Output ""
Write-Output "Upload with (a release asset may be up to 2 GiB):"
Write-Output "  gh release upload <tag> $OutDir\KaleidoscopeModels-*.zip"
Write-Output "Users unpack any subset into the program's Models folder."
