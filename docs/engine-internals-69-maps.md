## 26.11.2026 (69, maps): depth maps for the photos -- two models compared (T0), and the subject per photo (M1)

The app knew nothing about what is near and what is far in a photo, nor where its subject sits (plan of 26.11., blocks
T and M). T0 makes the depth maps offline and compares two models; M1 adds the subject centre, a depth threshold for
the subject and a confidence. Nothing in the app changes here: the maps sit in staging folders
(`C:\Users\Rene\Desktop\kaleido-wt\depthmaps\dav2s\`, `...\da3ml\`, `...\da3ml_nosky\`) until the user has chosen a
model; agent "depth" (T1-T4, M2, M3) loads them. Nothing was written into `Images\`.

### Licences, read before any use

- **Depth Anything V2 Small** (`depth-anything/Depth-Anything-V2-Small-hf`, revision 5426e4f0, 24.8 M parameters,
  `model.safetensors` 99 MB). Model card front matter,
  https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf: "license: apache-2.0". The authors' repository,
  README section LICENSE, https://github.com/DepthAnything/Depth-Anything-V2: "Depth-Anything-V2-Small model is under
  the Apache-2.0 license. Depth-Anything-V2-Base/Large/Giant models are under the CC-BY-NC-4.0 license." Its LICENSE
  file is the Apache License 2.0 text.
- **Depth Anything 3 Mono Large** (`depth-anything/DA3MONO-LARGE`, revision f465978e, 0.35 B parameters,
  `model.safetensors` 1.34 GB). Model card, https://huggingface.co/depth-anything/DA3MONO-LARGE: front matter
  "license: apache-2.0" and the table row "| **License** | Apache 2.0 |". The authors' repository,
  https://github.com/ByteDance-Seed/Depth-Anything-3, README "Model Cards": "| [DA3MONO-LARGE](...) | 0.35B | ... |
  Apache 2.0 |"; its LICENSE file: "Copyright 2025 The Depth Anything 3 Team ... Licensed under the Apache License,
  Version 2.0". *Where the disagreeing source most likely comes from:* the same table lists DA3-LARGE and
  DA3-LARGE-1.1 -- the same size, 0.35B, and nearly the same name -- as "CC BY-NC 4.0" (also DA3-GIANT and the
  NESTED models). MONO-LARGE, METRIC-LARGE, BASE and SMALL are Apache 2.0.
- Both licences allow redistribution (keep the licence text and the notice); nothing is marked "not for the photo
  pack". The DA3 card also says it was "trained exclusively on public academic datasets" -- not a licence term.
- The DA3 code: the PyPI package `depth-anything-3` 0.1.1 names "Your Name" as its author (copied from the
  repository's pyproject.toml) and one maintainer, `darkestforest`, who is not among the authors -- so the code came
  from the official GitHub repository (commit 3d835ec1), installed with `--no-deps`.

### The tool and its environment

`Tools/depth_maps.py` (requirements and the install recipe in `Tools/depth_maps_requirements.txt`). Its own uv
environment `kaleido-wt\depthenv` (Python 3.12.11, torch 2.11.0+cu128 from the uv cache -- the RTX 5090 needs the
CUDA 12.8 wheels -- transformers 5.24.1, numpy 2.5.4), weights in `kaleido-wt\hfcache` (HF_HOME), both revisions
pinned in the tool, safetensors only. DA3's API module imports its exporters (moviepy, trimesh, open3d, pycolmap ...)
and a pose aligner (evo) at the top; for one image without poses neither runs, so the tool puts two empty stand-ins
into `sys.modules` before the import instead of installing a dozen packages it never calls (DA3 also asks for
xformers, which is optional in its code: without it the SwiGLU layer falls back to plain torch).

- Output per photo: `<stem>.png`, 8-bit grey, long side 512 (the photos are all 1024x1024, so 512x512), 255 = near,
  stretched between the 2nd and 98th percentile of the model's inverse depth. Depth Anything V2 predicts disparity;
  DA3 predicts depth, which the tool inverts first (parallax goes with 1/z). Next to the maps `photo_info.tsv`
  (`file relief slope flat fx fy thr conf model mask`, rows merged on re-runs, written atomically every 30 s) and
  `runs.log` (times). `mask` is a tenth column beyond the agreed nine (see M1); PhotoDepth.h reads columns by name.
- Resumable (a map newer than its photo with a row of the same model is skipped; a map without a row is only
  re-measured), below-normal priority (and IDLE under heavy.py), one model per process, `--pause` between photos,
  refuses to start with less than 3 GB of free GPU memory. torch is imported only when a model runs: `--help`,
  `--measure` and the sheets need numpy, scipy and Pillow only.
- `--raw <dir>` keeps the model's own output (float16 .npy at map size, 0.5 MB each) so that the measures can be
  recalibrated without the GPU (`--measure`). The staging folders have `dav2s_raw\`, `da3ml_raw\` and
  `da3ml_nosky_raw\` (0.5 GB each).
- `--sheet compare | subject | flat` draws the sheets below.
- Photos with the same name and different extensions would share a map; the tool skips the second (none in Images).

### Time and size

Measured with `--verbose` on the 20 test photos, then on the whole folder, at IDLE priority while other agents'
jobs queued (one heavy job at a time):

| model | load | per photo, warm: read / model / write+measure | 957 photos |
|---|---|---|---|
| dav2s | 5.6 s (27.8 s once, cold disk) | 10 / 25-28 / 26-36 ms = 61-75 ms | 1.2 min |
| da3ml | 5.2-6.4 s | 10 / 54-70 / 26-35 ms = 99-106 ms | 1.6 min |

The first photo of a run costs 0.7 s (CUDA kernels). Extrapolated to 977 photos: 1.3 and 1.8 min including the
load. Both models therefore ran over the whole folder (977 + 977 maps, one lock hold of 4 min for both; later DA3
without its sky head, 102 ms per photo). On the CPU
for comparison: dav2s 0.7 s, da3ml 28 s per photo (4 threads). The maps take 42 MB (dav2s) and 41 MB (da3ml) for all
977 photos -- 7 % on top of the 596 MB photo pack.

### The test photos and what the sheets show

The photo pack holds material close-ups only -- agate, basalt, wire wool, sugar crystals, cream, shards; no people,
landscapes, buildings or night scenes. The 20 test photos (`Tools/depth_test_photos.txt`) stand in for the plan's
categories by their depth character: one centred object ("portrait": a rosette, a bud), terrain seen obliquely
("landscape": erosion, a pebble bed), columns and rods ("architecture"), close-ups with shallow focus (droplets,
feathers), things on black ("night": a cobweb, sparks), flat patterns (terrazzo, marbled paper, an agate slab) and
smooth light ("sky": an aurora-like sheet). They include the snapshot set's photo
(`kristallhoehle-indigo-fuchsia-2.jpg`, from `snapshots\2026-11-10-all\photo.txt`) and chain_regress's default, the
first of the sorted folder (`achat-amethyst-lk3.jpg`).

Sheets in `C:\Users\Rene\Desktop\kaleido-wt\sheets\maps\`: `cmp_overview.jpg` (photo | dav2s | da3ml for all 20) and
`cmp_<photo>.jpg` per photo -- photo, both maps, and per map a parallax strip: the photo at full size resampled with
the map (a point at map value v moves by shift x width x (v - 0.5); backward warp, the map looked up at the target as
a shader would), shifts -4, -2, +2, +4 % of the width, shown 1:1 in the 300x300 window with the most depth edges
(the yellow box on the photo), because seams are a matter of pixels. Looked at one by one:

- *Edges.* Both models put the map's edge on the object's edge; neither shows an offset. DA3 Mono Large is crisper
  and tighter: single crystal facets (kristallhoehle), the rosette's leaves against the background (gipsrose), the
  stalactites, the light-guide rods (lichtleiter: the rod in dav2s is a little broader with a soft rim). Depth
  Anything V2 Small is softer, blob-like on fine structure (the crystal cave reads as soft petals).
- *Haloes and seams in the shift.* At a depth edge where the shift uncovers background, both repeat the near rim
  (a doubled ring at the rod's end at +2 and +4 %). That is the warp, not the model: a backward warp has nothing to
  show behind a near object. dav2s smears it over a few more pixels, DA3 gives a sharper double. For T3/T4: keep the
  shift small (about 1-2 % of the width; at 4 % the doubles are obvious), or take the map max-filtered (near
  dilated by a few pixels) for the lookup, so that the seam falls into the background.
- *Flat photos.* For patterns and textures (agate slab, terrazzo, marbled paper, droplets on glass, sparks on wood,
  plaster, the smooth sheet) both models give a smooth tilt or bowl and ignore the pattern -- good: nothing shimmers
  in the shift. DA3 sometimes keeps creases (crumpled paper), dav2s puts a dark blob in the middle (a bowl).
- *Faces.* None in the pack. The single objects (rosette, bud, lumps of clay) come out clean in both; DA3 separates
  the leaves and scales a little better.
- *Sky -- here: dark backgrounds.* DA3 has a sky head; the authors' code sets every pixel it calls sky to one far
  value (the 99th percentile of the other depths). On this pack, black backgrounds pass as sky: the cobweb on black
  (`spinnwebe-aqua-2-lk.jpg`) gets 28 % of its picture replaced by one value, with ragged holes and speckle where the
  threads are. dav2s keeps a smooth background there. `--da3-sky off` keeps the depth head's own values
  (all 977 in `depthmaps\da3ml_nosky\`). Over the folder the sky head replaced 5 % or more of the picture in 3
  photos, all cobwebs on dark ground (27.9, 13.4 and 5.7 %), and 0.1-0.7 % in 12 more; everywhere else both runs
  are identical.
- *Agreement.* Spearman rank correlation of the two maps (64x64) over all 977 photos: median 0.980, 10th percentile
  0.607; on the 399 photos both call non-flat median 0.981, 10th percentile 0.784. Where they differ, the
  photo is nearly always flat (the tilt of a flat picture is arbitrary).

### Relief and the flat rule

*Relief* has to be scale-free: Depth Anything V2 predicts disparity up to an unknown scale AND shift, DA3 depth up to
scale. The first version took 1 - p2/p98 of the disparity -- with an unknown shift that is meaningless: the marbled
paper read 0.54, the smooth sheet 0.42, the light-guide rods 0.95. What works on both models: remove the picture's
large-scale trend (a least-squares quadratic surface in the image coordinates -- a plane seen in perspective is linear
in disparity, and a bowl or vignette is what the models make of a flat pattern), take the 5..95 % range of what is
left, divided by the median disparity. On the 20 test photos the flat ones read 0.01-0.09, the ones with things in
them 0.31-3.5 (both models). *Slope*: the share of the area where the detrended, smoothed map changes by more than one
map range per image width (edges and slopes; a tilt alone does not count).

Calibrated on sheets of the whole folder (photo | map, sorted by relief and slope; `flat_<model>_top.jpg` -- the
flat photos nearest the line, `flat_<model>_sample.jpg` -- 30 flat ones at random, `flat_<model>_border.jpg` -- the
non-flat ones nearest the line; the intermediate group sheets stayed in the scratchpad):

- relief < 0.10: flat. Patterns, marbled paper, chromatography, sanded surfaces, droplets on glass, spray on water.
  Crackle and cell structures with real but shallow relief (dried clay, basalt cracks, felted wool) also land here;
  their maps show the cracks as faint lines -- a shift by 1-2 % would show little, so flat costs nothing.
- 0.10 <= relief < 0.25: mixed. Those with slope < 0.15 are surfaces that recede without things on them (spray on
  water, powder, rusted sheet, slate, plaster corners): the map is the tilt and a faint texture -- flat. Those with
  slope >= 0.15 carry structure (broken tiles, bark, pebbles, cracked glaze, folded paper): kept.
- A flat photo with a clear subject keeps its depth (judge(): conf >= 0.5): one lump of clay on a cracked surface is
  too small for the 5..95 % spread of relief. Over the folder this keeps 10 (dav2s) and 12 (DA3) photos.

Result over the 977 photos: flat 472 with dav2s (48 %), 559 with DA3 (57 %); 453 both, 578 either. The pack is
mostly texture; that half of it gets no depth is the honest answer, not a miscalibration.

### M1 -- subject centre and subject depth

From the depth map alone (`subject()`): smoothed at 128 px; a robust background surface is removed (least-squares
quadratic surface, refitted four times on the farther 60 % of the pixels, so that a subject rising above it does not
pull it up -- a receding ground or a slanted wall is no subject); Otsu's threshold on what is left splits near from
far; a small opening and closing (with the picture's edge continued outward -- with ndimage's default zero padding
every region was peeled off the frame); connected components; the subject is the component with the largest volume
above the threshold (not the largest area: a broad low foreground lost against a compact lump). fx, fy is its
centroid weighted by the height. thr is the value of the PLAIN map (the shader has no background surface) whose mask
`map >= thr` agrees best with the region (intersection over union, scanned over the region's 5-70th percentiles).

conf (0..1) is the product of five factors: *edge* (the region's median height over a ring around it, in the
detrended map's range: 0 up to 0.2, full from 0.5), *area* (from 1 % rising, full from 4 % to 40 %, 0 at 65 % of the
picture), *dom* (its share of all near volume -- one subject, not one pebble of many), *border* (the share of its
outline on the picture's frame: 1 up to 10 %, 0 from 30 %; a foreground band along the bottom is no subject) and
*fill* (area over area with holes filled: a mesh or a web is no subject). Flat photos get conf 0.

conf speaks about the CENTRE only. How well `map >= thr` reproduces the region is a separate column, `mask` (the
IoU, 0..1): on a photo that recedes, the plain threshold also catches the near foreground, so a mask drawn from it
can be wrong even where the centre is right (cream spiral: centre right, mask 0.24). M3 ("subject stays whole")
should cut a mask only where `mask` is high (>= 0.6); M2 (folding around the subject) needs the centre only.

*Check sheet* (`subject_<model>_00.jpg`, `_01.jpg`; 40 photos: the 20 test photos and the 20 of
`Tools/depth_subject_photos.txt`, picked by eye from the families with objects -- lumps, cream, shards, sheets,
spirals, piles -- whose subject sits away from the centre). Cross = centre, thick outline = the region (red conf >=
0.5, yellow 0.2-0.5, grey below), thin cyan = `map >= thr`. Counted by eye:

| | DA3 Mono Large | DAv2 Small |
|---|---|---|
| 20 test photos: conf >= 0.5, centre on a real subject | 3 (clay lump, stalactites, rod) | 4 (the same and the front feather) |
| 20 test photos: 0.2-0.5, region on the subject | 1 (rosette) | 2 (rosette, one pebble) |
| 20 off-centre photos: conf >= 0.5, on the subject | 4 | 4 |
| 20 off-centre photos: 0.2-0.5, region on the subject | 6 | 4 |
| 20 off-centre photos: missed (conf < 0.2 -> picture centre) | 10 | 12 |
| conf >= 0.5 on a wrong place, all 40 | 0 | 0 |

On photos NOT picked for having a subject, the numbers are worse, and that is the honest test:

- 20 photos at random from those with conf >= 0.5 (first version of the edge factor, full at 0.4; sheets
  `subject_<model>_random_confident_00.jpg`, kept as they were drawn): dav2s 10 on a
  subject, 10 on a texture (wire wool, salt-crust cells, foam, lichen); DA3 8 on a subject, 6 plausible (the near
  part of a pile or a cocoon), 6 wrong (bands of gravel or shavings along the bottom, half a spiral pattern). The
  textures stood out by only 0.25-0.4 of the map's range, the real subjects mostly by 0.4-0.9: hence the edge factor
  0 at 0.2 and full at 0.5. On the same labelled photos (40 + 40) that leaves dav2s 17 right of 18 and DA3 13 right,
  1 plausible, 1 wrong of 15 at conf >= 0.5 -- tuned on them, so not a fair test.
- The fair test: 150 photos drawn at random (seed 31) from those not used for tuning, measured with the final rule:
  dav2s 6 with conf >= 0.5, 5 of them on a subject (spirals of honey, a chain, a smoke column, a raised glass edge;
  wrong: a field of lichen); DA3 5, 4 on a subject (wrong: a strand of a cocoon). 9 of 11 together. Between 0.2 and
  0.5 (12 and 9 photos) it is mostly texture: dav2s 3 of 12 on something (a seed head, a branching ridge, a face
  printed on fabric), DA3 1-2 of 9 (most are bands along the bottom edge).

So: trust the centre from conf 0.5 (about 80-90 % right), treat 0.2-0.5 as no subject, and expect a subject on only a
small part of this pack -- over the 977 photos conf >= 0.5 for 78 (dav2s, 8 %) and 53 (DA3, 5 %), >= 0.2 for 170 and
120; of the confident ones, mask >= 0.6 for 21 and 19. A miss costs nothing (the picture centre, as today); a
confident wrong anchor on a texture costs little too (any point of a texture is as good as the middle). The misses on
the sheet are subjects cut by the frame (cream at the top edge, a shard at the right edge, a cube in a corner: the
border factor), piles of many similar things, and photos whose relief reads flat.

*Tried and dropped:*
- the largest near AREA instead of volume (v1): a broad, low foreground band won against the lump;
- a plane instead of a quadratic background: a bowl-shaped map turned its rim into a "subject" ring;
- the share of a 2-px frame band covered by the region as the border measure: a subject touching one edge lost as
  much as a band along the whole bottom; the share of the region's OWN outline on the frame tells them apart;
- the mask agreement (IoU) and the relief inside conf (v2): a correct centre with a leaky mask lost its confidence;
- a looser border factor (1 up to 30 % of the outline on the frame; measured with the first edge factor): 297 instead
  of 101 photos with conf >= 0.5 on DA3 (sheet `subject_da3ml_touch30`, scratchpad) -- the newcomers were mostly near
  foreground bands along the bottom edge and halves of piles; kept strict;
- solidity (area over convex hull) against sprawling texture regions: the textures read 0.2-0.9, the real subjects
  0.2-1.0 (a branching ridge 0.21, a chain 0.5, star-shaped seed heads 0.7); no line between them;
- a saliency or segmentation model: not tried. M2 needs a centre or the picture's middle; the misses are photos
  without one clear subject, where a saliency model would mostly find colour contrast -- and every model would need
  its own licence check and download. If M2's sheet shows that the user wants more photos anchored, this is the
  next step (the licence rules of T0 apply).

### T5, the cost only: maps in the app on the CPU

Measured for the user's later decision (nothing went into the app): Depth Anything V2 Small exported to ONNX
(torch.onnx TorchScript exporter, opset 17, fixed input 1x3x518x518 -- the processor's size for the square photos),
run with onnxruntime 1.32.0 on the CPU (i9-12900K, 16 cores / 24 threads), 10 of the test photos, the session warm:

| | |
|---|---|
| model file (fp32) | 99.1 MB |
| onnxruntime.dll (Windows x64, from the Python wheel) | 22.7 MB |
| per photo, 1 thread | 1,249 ms (median; 1,176-1,355) |
| per photo, default threads (24) | 198 ms (192-215) |
| session start | 0.3 s |
| largest difference to torch | 1.2e-6 relative |

Not included: decoding the JPG and resizing to 518 (a few ms) and writing the map. For the whole pack: 977 x 0.2 s =
3.3 min on all cores, or 20 min on one core in the loader thread -- one photo per 1.25 s, well under the time a
photo stays on screen. Not measured: an fp16 or int8 model (half or a quarter of the size, the quality to be
checked on the sheets), the Linux build (libonnxruntime.so for the AppImage), and DA3 (28 s per photo on 4 CPU
threads in torch -- not a candidate for the app).

### Recommendation (the user chooses)

**Depth Anything 3 Mono Large, with its sky head off** (`--model da3ml --da3-sky off`; all 977 maps are in
`kaleido-wt\depthmaps\da3ml_nosky\`), for the maps of the photo pack:

- It draws the better maps where it matters: crisper object edges (single crystal facets in the snapshot photo, the
  rosette's leaves, the rods), less smear around near objects in the shift, and creases where dav2s makes a bowl.
  Rim light and ambient occlusion (T3) build normals from depth differences and gain most from clean edges.
- Its sky head has to be off for this pack: black backgrounds pass as sky and are cut out as holes (the cobweb: 28 %
  of the picture replaced by one value); without it the depth head's own values are clean. Off changes 15 photos of
  977 and repairs the 3 cobwebs.
- Same licence (Apache-2.0, redistribution allowed), and the cost is offline only: 1.8 min for the pack on the
  RTX 5090, 1.3 GB of weights that stay on this machine. Maps: 41 MB, 7 % on top of the photo pack.

**Depth Anything V2 Small** is the right model if the app shall compute maps for the user's own photos (T5): 99 MB,
0.2 s per photo on the CPU, and then the pack's maps should come from the same model so that both look alike --
the two models agree closely anyway (median rank correlation 0.98), so mixing would not be glaring either. Agent
"depth" has used the dav2s maps for its tests so far; the files have the same format.

Either way: flat is about half of the pack; trust the subject centre from conf 0.5; let M3 cut masks only where
`mask` is high; keep parallax shifts small (1-2 % of the width) or look the map up max-filtered.
