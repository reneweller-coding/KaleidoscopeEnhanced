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
    [int]    $Quality = 0
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

$mb = (Get-Item $zip).Length / 1MB
Write-Host ("[imagepack] done: {0}  ({1:N0} MB)" -f (Split-Path $zip -Leaf), $mb)

# Verify the archive rather than trusting the exit code: a pack whose entries
# carry a folder prefix would unpack one level too deep and quietly leave the
# photo scenes on their fallback texture.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$za = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
    $nested = $za.Entries | Where-Object { $_.FullName -match '[\\/]' }
    Write-Host ("[imagepack] {0} entries, {1} of them nested" -f $za.Entries.Count, $nested.Count)
    if ($nested.Count -gt 0) { throw "Archive has nested paths - it would not unpack into Images\ directly" }
} finally { $za.Dispose() }
