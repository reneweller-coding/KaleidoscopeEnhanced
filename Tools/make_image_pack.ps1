<#
.SYNOPSIS
    Packs Images/ into the downloadable photo pack.

.DESCRIPTION
    The bundled photo library is optional extra content, not part of the
    repository: 1000 square 1024x1024 textures come to roughly 700 MB, ten
    times everything else in the tree, and git keeps blobs forever -- so
    committing them could not be undone. They are published as a GitHub
    release asset instead, which may be up to 2 GiB and does not count toward
    the repository's size. The same reasoning, and the same shape, as
    make_model_pack.ps1.

    The engine treats them as optional: RenderPipeline::traverse() finding
    nothing means the photo scenes fall back to a procedurally generated
    texture, and the startup log says which directory it looked in and which
    of the three layers chose it. A plain install therefore works.

    Unlike the models, this is ONE archive. The models split by theme because
    someone might want the ships and not the sea creatures; a photo library
    has no such seams -- the scenes pick from it at random, and half a library
    is just a smaller library. Splitting it would only add a decision nobody
    has the information to make.

.PARAMETER OutDir
    Where to write the archive. Defaults to dist\.

.PARAMETER Quality
    Re-encode the JPEGs at this quality instead of copying them verbatim.
    0 (the default) copies them as they are, and that is the right default:
    Utils.cpp caps textures at 1024x1024 and these are exactly 1024x1024, so
    the engine uses them at native resolution with no resampling of its own --
    a re-encode would be the ONLY loss in the whole chain. Measured over 30
    images, quality 85 gives a median PSNR of 33 dB and a worst case of 27.7,
    which is thin for dense grain and fibre textures, and several scenes
    (PhotoTunnel, InfinitePhotoZoomAbyss, the deep-zoom kaleidoscopes) MAGNIFY
    the photo, so artefacts get bigger rather than smaller. It roughly halves
    the download if that matters more. Needs Python with Pillow.

.EXAMPLE
    .\Tools\make_image_pack.ps1
    .\Tools\make_image_pack.ps1 -Quality 85
#>
[CmdletBinding()]
param(
    [string] $OutDir = "",
    [int]    $Quality = 0,
    [switch] $NoDepth
)

$ErrorActionPreference = "Stop"
$root   = Split-Path -Parent $PSScriptRoot
$images = Join-Path $root "Images"
if (-not $OutDir) { $OutDir = Join-Path $root "dist" }

if (-not (Test-Path $images)) { throw "No Images folder at $images" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Only the picture files. The folder also holds LIESMICH-BILDER.txt in a
# deployed copy, and a stray note inside the archive would land in the user's
# Images folder next to the one the installer already put there.
$files = Get-ChildItem $images -File |
         Where-Object { $_.Extension -match '^\.(jpg|jpeg|png)$' }
if (-not $files) { throw "No images in $images" }
Write-Host ("[imagepack] {0} image(s), {1:N0} MB on disk" -f
            $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB))

$stage = $images
$tmp   = $null
if ($Quality -gt 0) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("kaleido_imgpack_" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    Write-Host "[imagepack] re-encoding at quality $Quality ..."
    $py = @"
import sys, os, glob
from PIL import Image
src, dst, q = sys.argv[1], sys.argv[2], int(sys.argv[3])
n = 0
for p in sorted(glob.glob(os.path.join(src, '*'))):
    if os.path.splitext(p)[1].lower() not in ('.jpg', '.jpeg', '.png'):
        continue
    out = os.path.join(dst, os.path.splitext(os.path.basename(p))[0] + '.jpg')
    Image.open(p).convert('RGB').save(out, 'JPEG', quality=q,
                                      optimize=True, progressive=True)
    n += 1
print('re-encoded', n)
"@
    $pyFile = Join-Path $tmp "_reencode.py"
    Set-Content -Path $pyFile -Value $py -Encoding utf8
    & python $pyFile $images $tmp $Quality
    if ($LASTEXITCODE -ne 0) { throw "Re-encode failed (is Pillow installed?)" }
    Remove-Item $pyFile
    $stage = $tmp
}

$zip = Join-Path $OutDir "KaleidoscopeImages.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Write-Host "[imagepack] compressing -> $zip"
# Compress the FILES, not the folder: the archive must unpack straight into
# the user's Images folder, not create an Images\Images inside it.
# Fastest, not Optimal: the payload is already JPEG, so deflate has nothing
# left to find -- Optimal spends minutes of CPU to save a fraction of a percent.
Compress-Archive -Path (Join-Path $stage "*.jpg"), (Join-Path $stage "*.png") `
                 -DestinationPath $zip -CompressionLevel Fastest `
                 -ErrorAction SilentlyContinue

if ($tmp) { Remove-Item $tmp -Recurse -Force }

# The depth maps (since 26.11.2026): Images\.depth\<photo name>.png and the table photo_info.tsv beside them
# (Source/PhotoDepth.h).  Without them the pack's photos are flat for every depth look, so they belong in the pack --
# as the one nested folder, written entry by entry with forward slashes (Compress-Archive of Windows PowerShell 5.1
# writes backslashes, which unpack as file names on Linux).  A map belongs to its photo by the name without the
# extension, so a re-encoded pack (-Quality) keeps its maps.  -NoDepth leaves them out.
$depthDir = Join-Path $images ".depth"
$nDepth = 0
if (-not $NoDepth -and (Test-Path $depthDir)) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $have = @{}
    foreach ($f in $files) { $have[[System.IO.Path]::GetFileNameWithoutExtension($f.Name)] = $true }
    $zu = [System.IO.Compression.ZipFile]::Open($zip, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($d in (Get-ChildItem $depthDir -File)) {
            $isMap = $d.Extension -eq ".png" -and $have.ContainsKey([System.IO.Path]::GetFileNameWithoutExtension($d.Name))
            if (-not $isMap -and $d.Name -ne "photo_info.tsv") { continue }
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zu, $d.FullName, ".depth/" + $d.Name, [System.IO.Compression.CompressionLevel]::Fastest)
            if ($isMap) { $nDepth++ }
        }
        # The maps are a model's output: name the model and its licence (Apache 2.0, docs/engine-internals.md (69),
        # "Licences") beside them, as the licence asks of a redistribution.
        $notice = @"
Depth maps of the photos in this folder (one grey PNG per photo, white = near) and their table photo_info.tsv.

Made with Depth Anything 3 Mono Large (depth-anything/DA3MONO-LARGE, https://huggingface.co/depth-anything/DA3MONO-LARGE),
Copyright 2025 The Depth Anything 3 Team, licensed under the Apache License, Version 2.0:
https://www.apache.org/licenses/LICENSE-2.0
Code: https://github.com/ByteDance-Seed/Depth-Anything-3

Kaleidoscope Enhanced reads them through Source/PhotoDepth.h; Tools/depth_maps.py makes them for your own photos.
"@
        $ne = $zu.CreateEntry(".depth/NOTICE.txt", [System.IO.Compression.CompressionLevel]::Optimal)
        $sw = New-Object System.IO.StreamWriter($ne.Open(), (New-Object System.Text.UTF8Encoding($false)))
        try { $sw.Write($notice.Replace("`r`n", "`n")) } finally { $sw.Dispose() }
    } finally { $zu.Dispose() }
    Write-Host ("[imagepack] {0} depth map(s) and photo_info.tsv added under .depth/" -f $nDepth)
}

$mb = (Get-Item $zip).Length / 1MB
Write-Host ("[imagepack] done: {0}  ({1:N0} MB)" -f (Split-Path $zip -Leaf), $mb)

# Verify the archive rather than trusting the exit code: a pack whose entries
# carry a folder prefix would unpack one level too deep and quietly leave the
# photo scenes on their fallback texture.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$za = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
    # The one nested folder allowed is .depth/ (the photos' depth maps, see above).
    $nested = @($za.Entries | Where-Object { $_.FullName -match '[\\/]' -and $_.FullName -notmatch '^\.depth/[^\\/]+$' })
    $maps = @($za.Entries | Where-Object { $_.FullName -match '^\.depth/[^\\/]+\.png$' })
    Write-Host ("[imagepack] {0} entries, {1} depth map(s), {2} wrongly nested" -f $za.Entries.Count, $maps.Count, $nested.Count)
    if ($nested.Count -gt 0) { throw "Archive has nested paths - it would not unpack into Images\ directly" }
    if ($maps.Count -ne $nDepth) { throw "Archive holds $($maps.Count) depth maps, $nDepth were added" }
} finally { $za.Dispose() }
