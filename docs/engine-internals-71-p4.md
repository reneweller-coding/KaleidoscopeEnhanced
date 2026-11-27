## 27.11.2026 (71, P4): the photo as a relief in 3D scenes

Package P4 of docs/PLAN_2026-11-27.md, by agent "p4" (branch `wt-p4` from b9ea6a83).  A new look as a knob: 0 = the
old picture bit for bit, shown with snapshots.

### What there was

- 221 of the 327 Scene3D fragment shaders mention `tex0`; none read the photo's alpha, where the depth map travels since
  26.11. (Source/PhotoDepth.h; 707 of the 1,266 photos carry one).  Most of them use the photo only as a colour
  source: the house palette `imgPalette()` (the photo sampled along an arc), a faint sky, a reflection.  Those stay out
  (the plan's rule).  A relief needs three things in the fragment stage: the photo as the colour of a surface, a
  normal that the scene lights with, and the shaded point (for the derivatives).  A survey script (every frag that
  samples the photo outside `img()`/`imgPalette()`, with a `dot( n, L )`-like term) and a look at each candidate left
  the ten below.
- Left out, and why: the photo cards and panels (PhotoCarousel, PhotoShatter, GalleryHall, SilkPhoto, MosaicWave,
  BillboardCity, RegattaSpinnakers, HotAirBalloonDawn, AsteroidRubblePileTumble) light per vertex with a scalar
  (`vLight`, `vShade`, `vLit`) and have no light direction in the fragment stage -- a relief there would need a new
  light, not the scene's; the math surfaces of the physics family (BoySurface..., Enneper..., Helicoid...) have a normal
  and the photo but no position in the fragment stage (one could be handed on, as for KelvinHelmholtzCloudWaves below
  -- the next candidates); CyberVoxelTerraform samples one photo texel per voxel (the coordinate is constant over a
  face: no slope to take); OrreryBrass's planets are a few pixels wide, so the relief would always sit below the
  footprint limit (it was in the first list and is out); VideoRelief already has a knob `reliefP` (its luminance
  displacement) and keeps it.

### The block

`Tools/scenegen/patch_relief3d.py` writes one block between two marker lines into each scene, after the pattern of
patch_env3d.py (U1): no include (the decision of 14.10.); idempotent (a re-run replaces only the block); afterwards
doc_shaders.annotate() and cgvr_format.format_text().

- `ReliefFrame reliefFrame( p, uv )`: the screen-space derivatives of the shaded point and of the photo coordinate
  (Mikkelsen's sigma_x, sigma_y).  The only derivatives of the block; each site calls it where all four pixels of a
  2 x 2 quad run the same code -- behind `if ( reliefP > 0.0 )` (a uniform) and at most inside branches on values
  constant per primitive (`vKind`: a quad belongs to one primitive), never inside a branch on the pixel
  (fwidth-divergent-branch trap).  The coordinate given here is the continuous one, before a `fract()` that tiles the
  photo -- the tiles' seams would be steps of 1 in the derivative.
- `reliefDepth( uv, lod )`: the depth (alpha, 255 = near) of tex0 and tex1, cross-faded with `interpolation` like
  `img()`, each slot weighted by `photoDepthAmt` (1 with a map, 0 without -- alpha is 255 then and must not count).
- `reliefSlope( uv, lod )`: the depth's slope in the photo, d depth / d uv -- four taps on the diagonals, one texel
  of the level out, each a bilinear mean of four texels: together a 3 x 3 Sobel-like kernel of that level.
- `reliefNormal( n, f, uv, amt )`: Mikkelsen 2010, "Bump Mapping Unparametrized Surfaces on the GPU" -- the surface
  gradient from the screen-space derivatives of the position, no vertex tangents, any parametrisation:
  `grad_s h = ( h_x ( sy x c ) + h_y ( c x sx ) ) / ( c . c )` with the facet's own normal `c = sx x sy` in his frame,
  then laid into the plane of the scene's shading normal `n`, and `n' = normalize( n - A ( grad_s h )_n )`.
  - Against the 8-bit map's terraces, the height's screen derivatives `h_x, h_y` are not `dFdx( h )` (the map is flat
    between its 255 steps, a quad difference of it is blocky) but the photo-space slope by the chain rule,
    `h_x = grad_uv h . duv/dx` (the paper's variant for a height given as a texture), and that slope is the mean of two
    scales: level 2 (256 texels of the 1,024 photo; coarser as the photo shrinks on the screen,
    `log2( footprint ) + 1`, up to 6) for the detail and two levels coarser for the shapes.
  - The map's steps are occlusion edges (an object in front of another), not cliffs: the slope is compressed,
    `g / ( 1 + |g| / 8 )`, and the tilt softly limited below about 45 degrees (`t / sqrt( 1 + 1.23 t.t )`).
  - The relief's depth `A` is a share of the photo's extent on the surface (world length per unit of uv, from the
    same derivatives): the tilt is about `0.15 amt |g|`, the same in a scene 10 units or 100 units wide.
  - It fades out where a pixel covers 24 to 64 texels of the photo (far away, minified: a relief would only shimmer;
    and the seam rows of a tiled or equirect mapping, where the coordinate jumps), and is skipped where the photo has
    no map (`photoDepthAmt` cross-faded is 0), where the derivatives degenerate or are NaN (a quad's helper pixels
    outside a surface).  Only `textureLod()` inside: the function itself may run in a pixel-dependent branch.
  - 16 texture fetches (2 scales x 4 taps x 2 photo slots) and some arithmetic, only with the knob above 0.
- The knob `uniform float reliefP`: 0 (no preset entry) = the old picture, every added line behind
  `if ( reliefP > 0.0 )`; a negative value is off too, so a rolled range like -0.5..1 keeps the old picture as one
  outcome.  No C++ change: the host already uploads `photoDepthAmt` to every program that declares it, and a preset
  float reaches any uniform of its name.

### The ten scenes

| scene | the photo on | the site |
|---|---|---|
| TessellatedLavaLake | the crust plates, tiled per plate (world xz) | `n` right after the photo is sampled; the derivatives on the coordinate before its `fract()` |
| EuropaChaosTerrain | the ice rafts, tiled (the ice's own sliding coordinates) | the same |
| PermafrostPolygons | the tundra ground pattern, tiled per cell | `n` where it is made, before the sun term |
| TravertineTerracePools | the crust's mineral banding (a multiplier) | `n` where it is made; the pools' water mixes over it as before |
| GlacierTessellation | the ice, the photo laid over it faintly | `n` where it is made: diffuse light and frost glint |
| CrystallineCavernTessellation | the rock between the crystals, tiled x3 | `n` where it is made, the relief faded out on the crystals (`teCrystal`) |
| SandDuneBarchanMigration | the whole dune carpet, one photo | a copy of the normal (`dune_n`) for the diffuse and the glint; the old code read `vNormal` directly |
| KaleidocycleFold | the faces of the folding ring | the normal from the derivatives of the position; the relief rises toward the eye whichever way a face winds, the normal's sign stays (the kick flash reads `n.y`) |
| Magnetosphere | the planet (an equirect map; tex0 only in its colour -- left as it is) | inside the planet's branch (constant per primitive); the map's seam and poles fade out by the footprint |
| KelvinHelmholtzCloudWaves | the whole cloud sheet, one photo | the fragment stage had no position: the vertex stage hands its world point on (`vReliefPos`, in the frame of `vNormal`) -- the patch's only vertex-stage change |

### Tried and dropped (each seen on a sheet first)

- *One scale, depth 0.03 of the photo's width, a hard cap at 50 degrees* (the first render, photo basaltstufen-tuerkis):
  the mean difference per scene 0.17-1.3 of 255 except the dunes (5.3) -- the relief was the map's edges as thin
  bright or dark lines (saturated tilt over a band one texel wide) and almost nothing of the shapes between them.
- *Two scales, depth 0.12, a soft cap, edges uncompressed*: the shapes showed (Permafrost's ground took the round forms
  of the photo, Europa's ice its bumps), the dunes broke into dark jagged cracks -- at 0.35 of the depth just as much
  (mean difference 17.4 against 17.5).  A depth that does not change the artefact is not a depth problem: the
  paper's frame divides by `n . ( sx x sy )`, and SandDune's normal is analytic (with the ripples' slope) while its
  120-row grid is coarse, so the determinant came near 0 on facets that the normal does not describe.  With the
  facet's own normal in the frame (`c . c`, never 0 on a visible facet) and the gradient projected into the plane of
  the shading normal the cracks went (v4).  The edge compression (`g / ( 1 + |g| / 8 )`) came one step before, for the
  same look elsewhere (the cavern rock's thin glossy squiggles).
- *SandDune with `normalize( vNormal )` into the block*: a photo WITHOUT a map changed that scene (the flat-photo set:
  9 of 10 identical) -- the block returns the normal it got, and the old light used the interpolated, unnormalized
  `vNormal`.  Now the normal goes in as it comes.
- *OrreryBrass* (the planets: the photo wrapped on sphere impostors): in the first list, out after the before set --
  the planets are a few pixels wide, the relief would always sit behind the footprint fade.

### Results

Snapshots (Tools/scene_snapshots.py through a wrapper that takes exact names and appends a knob at the END of an
entry, so the other knobs roll the same; frozen time, seed 7, silent, the user's settings, Presets/ZZMesh.xml present,
16-bit intermediates as by default).  Photos: A kristallhoehle-indigo-fuchsia-2 (the snapshot baseline's photo, map
relief 0.32), B basaltstufen-tuerkis (5.59, the strongest of the table), C tropfsteinhalle-gold-moos-2 (3.10), and
the flat achat-amethyst-lk3 (`flat` = 1: no map).

- *The old picture.*  A before set from the worktree's start state (b9ea6a83) and the same scenes after the patch with
  no knob entry: **20 of 20 frames byte-identical** (photos A and B, the final block).  A photo without a map with
  reliefP = 1 against reliefP = 0: **10 of 10 byte-identical** (the block returns the normal it was given).  The
  reliefP = 0 sets of the first and of the final block are byte-identical too (the 0 path does not depend on the
  block's content).  A set with the knob entry at 0 differs from the set without the entry: an added knob takes a roll
  and moves the later rolls of the run (the trap of (69), T4 and U2) -- 0 is compared with 1, absent with before.
- *The look* (reliefP 0 against 1, mean absolute difference of 255; A / B / C):

  | scene | A | B | C |
  |---|---|---|---|
  | SandDuneBarchanMigration (half depth) | 9.85 | 4.34 | 5.42 |
  | TravertineTerracePools | 3.92 | 1.28 | 1.85 |
  | EuropaChaosTerrain | 3.63 | 1.77 | 1.49 |
  | CrystallineCavernTessellation | 2.55 | 0.94 | 1.21 |
  | PermafrostPolygons | 2.16 | 1.21 | 1.76 |
  | GlacierTessellation | 2.05 | 1.12 | 1.53 |
  | KelvinHelmholtzCloudWaves | 2.02 | 0.67 | 1.72 |
  | TessellatedLavaLake | 0.95 | 0.53 | 1.04 |
  | KaleidocycleFold | 0.90 | 0.33 | 0.64 |
  | Magnetosphere | 0.53 | 0.33 | 0.38 |

  On the sheets: Europa's ice and Permafrost's ground take the photo's forms as bumps, the cloud sheet and the
  folding ring's faces a fine surface, the dunes a second, finer relief over their own; the lava crust and the small
  planet change least (dark crust, a planet 60 pixels wide).  The strength follows the photo: the crystal cave A has a
  map full of local shapes (median tilt 0.43 on a flat square, the offline sheet), the basalt B is smooth except at
  its columns' edges (median 0.05).
- *Sheets* (`C:\Users\Rene\Desktop\kaleido-wt\sheets\p4\`): `p4_relief_{A,B,C}_<photo>_{1,2}.jpg` (reliefP 0 | 1 |
  difference x4, five scenes each), `p4_relief_flat_achat-amethyst-lk3.jpg` (no map: no difference),
  `p4_relief_offline_what_the_block_does.jpg` (numpy: photo, map, the block's normal lit from the upper left on a flat
  square, the photo lit flat and lit with the relief).
- *GPU time* (agent env3d's perfwrap.py on Tools/perf_labs.py: 20 s a scene live at 2880 x 1620, alone on the machine,
  a photo with a map fixed so the taps run, knob 0 then 1 with the same rolls; median / p90 ms; measured with the
  two-scale block before the edge compression and the facet frame, which add a few multiplications and no fetch):

  | scene | 0 | 1 |
  |---|---|---|
  | KaleidocycleFold | 1.58 / 1.96 | 1.53 / 1.68 |
  | TessellatedLavaLake | 0.81 / 0.84 | 0.83 / 0.88 |
  | EuropaChaosTerrain | 0.96 / 1.00 | 0.91 / 0.95 |
  | PermafrostPolygons | 0.97 / 0.99 | 0.92 / 1.07 |
  | TravertineTerracePools | 0.90 / 0.92 | 0.97 / 1.05 |
  | SandDuneBarchanMigration | 0.91 / 0.91 | 0.90 / 0.93 |
  | CrystallineCavernTessellation | 1.15 / 1.24 | 1.20 / 1.31 |
  | Magnetosphere | 0.89 / 0.93 | 0.84 / 0.87 |
  | GlacierTessellation | 0.84 / 0.89 | 0.87 / 0.90 |
  | KelvinHelmholtzCloudWaves | 0.81 / 0.86 | 0.80 / 0.82 |

  -0.05..+0.07 ms median, the noise of single runs; 120 fps in every run.  16 fetches a pixel of the photo surfaces
  are cheap next to these scenes' tessellation and lighting.
- *In the presets*: `<float name="reliefP" minValue="-0.4" maxValue="1.2">` at the end of the ten Komplett.xml entries
  (the old picture about a quarter of the activations; a depth 0..1.2 otherwise), genre presets regenerated (22 lines
  added in seven of them, none changed).

### Checks

shadercheck on the 11 changed files (static rules and the driver's compile): 0 errors, 0 warnings (three times, the
last on the final block); every snapshot run without an error line in its log; `cgvr_format --check` 3,516 files same;
`doc_shaders --check` 0 to change; `temporal_budget` 0 errors (the 4 warnings are other scenes); `shake_scan` 0 new
hits; `PresetEditor --roundtrip` of the 11 presets OK, `--validate` 12 files complete; `check_schedule --quick` 20
plans, 0 violations.  No C++ changed (no build, no self test needed).

### Not done, not verified

- The second stage (parallax inside the surface for two or three calm scenes) was not started: the first stage took
  four rounds of sheets.  The frame for it is there (the same derivatives give the uv shift of a view ray).
- Moving pictures: every frame above is frozen and silent.  The relief follows the photo cross-fade (both slots,
  `interpolation`) and fades with the footprint, so it should neither jump nor shimmer -- not seen in motion.
- The GPU time of the final block (only the two-scale block before the last two changes was timed).
- Stereo and the editor's previews (same shaders; not looked at).
- Magnetosphere's colour reads tex0 only (an old defect, left); its relief cross-fades both slots, so during a photo
  fade colour and relief can disagree for a moment.

### For the user

- Whether the relief stays on in these ten scenes, and its range (-0.4..1.2): on the sheets it is clear in the
  terrains and the dunes, faint on the lava and the small planet.
- The next candidates: the math surfaces of the physics family (BoySurface, Enneper, Helicoid, ...) need a position
  handed on from the vertex stage, as done for the clouds.
