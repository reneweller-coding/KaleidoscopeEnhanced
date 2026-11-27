## (72) halo -- the back light behind the subject (sprint of 27.11.2026, agent "halo", branch `wt-halo`)

### What and where

The brief asked for a back light as one more depth effect: where something near stands in front of something far, the
far side of that depth edge glows softly, and the near side gets a thin, weaker rim.  The depth effects are the five
post effects in FX/ (section (69) T3), not blocks of Engine/Present.frag, and one of them already is the rim light:
**FX/FxRimLight.frag**.  As the brief says for that case, the halo extends that file -- shader only, no C++, no build,
nothing shared with the agent "rays" (Engine/Present.frag, Source/PresentPass.*).  The knob the brief named, `rimP`,
is taken there (the rim's strength, 0.5 .. 1.5 in the presets), so the new knob is **`haloP`**.

- `haloP` 0 (or no `haloP` line in the preset entry: an unset uniform is 0) = the old code: the halo is one
  `if ( haloP > 0.0 )` block in `main()`, plus one marked block of declarations and the function `haloAt()` before it.
- The old rim (`lit()`, `litPhoto()`) lights the near surface where its normal turns away.  The halo is the other half
  of a back light: the light that spills past the subject onto what is behind it.

### The design

- *Eight taps*: four opposite pairs on a disc of 1.5 % of the picture height (`HaloRadius`, relative to the height;
  radii sqrt-spaced, golden-angle directions), rotated per pixel by a fixed dither (interleaved gradient noise of the
  pixel position, no time in it), so the fall-off with the distance is smooth instead of four ghost outlines.
- *Per pair the second difference of the reciprocal depth*, ( 1/za + 1/zb - 2/zc ) / max of the three.  1/z is linear
  in screen space on a plane, so a floor running to the horizon or a slanted wall gives 0 -- a plain depth difference
  lit every horizon.  Positive = the centre is the far side of a step (halo), negative = the near side (rim).
- *Smooth, above the terraces*: smoothstep( 0.04, 0.45 ) for a 3D scene's depth, ( 0.12, 0.60 ) for a photo's depth
  (`depthPhoto`): two 8-bit levels at a photo's near end give about 0.07, below the ramp's start.  No threshold line.
  The depth textures have no mip chain, so the brief's "coarser mip" was not available; the average over the pairs and
  the ramp's start do that work.  No derivatives at all (`textureLod`), no branch on the pixel.
- *The halo's weight* falls with the tap's radius ( 1 - 0.6 r ); *the rim* counts ( 1 - r )^2, the innermost taps only
  (about a third of the disc), at `HaloNear` 0.35 of the halo.
- *Colour*: the frame's own colour at the pixel lifted 0.6 toward a warm white ( 1, 0.92, 0.80 ), screen-blended
  ( + light x amount x ( 1 - colour ) ): what is added shrinks with what is there, a channel at 1 gets nothing, so
  nothing clips to a flat white; then the effect's old soft compression ( c / ( 1 + 0.16 c ) ) as before.
- *Music*: the strength is haloP x 0.8 x ( 0.3 + 0.7 x `audioSwell` ) -- the seconds envelope, never the kick or the
  beat.  No camera, no motion of its own.  (The effect's old lines still breathe the whole frame with the beat by 12 %.)
- *Layers*: both layers' halos are cross-faded with `interpolation`, like the rim; a layer without depth
  (`depthValid` 0) gets none; a photo's halo is `HaloPhoto` 0.8 of a room's and fades in with the share of mapped photos.

### Verified (27.11.2026, 16:35 .. 16:46)

- `Tools/shadercheck.py --new cdab7da3` (the driver compiles FX/FxRimLight.frag): 1 file, 0 errors, 0 warnings
  (before the formatter's two line wraps; whitespace only).  `cgvr_format.py --check`: clean; `doc_shaders.py --check`:
  0 files would change; `temporal_budget.py`: 0 errors, 4 warnings (as before); `shake_scan.py --summary --baseline`:
  0 new hits, 74 known.
- *Knob 0 against the old shader* (`Tools/depth_arc.py frozen halo0 --scenes PillarHall FoldLab --fx FxRimLight`: the
  old file from .screen/fxold against the new one, the preset entry without `haloP`; frozen shots, 640 x 360, JPG):
  **FoldLab (a photo's depth): identical, max 0.  PillarHall (a 3D scene): NOT identical -- max 6 of 255, mean 0.022,
  5,324 of 230,400 pixels differ, 226 by more than 2, spread over the whole frame (most on the floor).**
  Repeated: the same numbers.  **That difference is not the halo's -- any change of the file's text gives it:**
  - the new shader against itself: identical (max 0) -- the frames are reproducible;
  - control C, the OLD text plus one comment line against the old text: max 6, mean 0.0217 -- the same difference;
  - the new shader (no `haloP`) against control C's frame: **identical, 0 of 230,400 pixels differ**;
  - the new shader against itself with the halo's block dead (`if ( false )`): identical; without the `audioSwell`
    uniform, and with a reciprocal-depth function of its own instead of `linearise()`: the same max 6 against the old
    text (both dropped again).
  So knob 0 is the old code path in both scenes; what PillarHall shows is a difference between an untouched and a
  changed FxRimLight.frag as such (FoldLab does not show it).  Its cause was not looked for (a guess: a cached program
  of the unchanged text against a fresh compile, and `lit()`'s tie-breaks on planes flipping on the last bit).  It
  concerns every old-against-new comparison of a changed FX file with this tool, not this change.
- *Knob on* (`Tools/halo_shot.py`, haloP 0 / 1 / 2 with the same rolls, silent): PillarHall -- haloP 1: max 30 of 255,
  mean +0.32, 6.9 % of the pixels changed by more than 2; haloP 2: max 56, mean +0.75, 8.8 %.  FoldLab -- haloP 1:
  max 41, mean +1.87, 41.7 %; haloP 2: max 67, mean +1.26, 84.8 % (JPG blocks: the lines run through most 8 x 8
  blocks; the mean at 2 below the mean at 1 was not explained).  The brightest pixel stays 255 -> 255 in all four.
- Looked at (C:/Users/Rene/Desktop/kaleido-wt/sheets/halo/PillarHall_sheet.jpg, FoldLab_sheet.jpg, crops_x4.jpg): in
  PillarHall a thin warm line on the sky's side of every pillar edge and nothing on the floor toward the horizon; in
  FoldLab a soft grey-warm line on the far side of the folds' depth edges.  At 360 lines the halo is a line, not a glow.

### Not verified

- Why a changed FxRimLight.frag (even by one comment line) renders PillarHall differently from the untouched file
  (max 6 of 255 on a JPG, above).  The frames are JPGs: a lossless comparison was not made.
- No video, no music: the frames are silent shots (audioSwell 0, the halo at 0.3 of its full strength).  How the halo
  breathes with the swell, and whether the per-pixel dither is visible as grain in motion or at 4K, was not looked at.
- The terraces of a photo's 8-bit depth: no ramp sheet was rendered; FoldLab's lines follow the folds' depth edges,
  but a gentle slope across a whole photo was not looked at.
- Only two scenes (PillarHall, FoldLab), only 800 x 360 shots; no flash count, no GPU timing (18 depth taps per pixel
  when the knob is on, none when it is off).
- Transparent 3D layers (OIT), scenes with a shadow pass, stereo modes: not rendered.

### How to verify

    set PATH=C:/Qt/6.11.1/msvc2022_64/bin;%PATH%
    python C:/Users/Rene/Desktop/kaleido-wt/heavy.py "halo shots" -- python Tools/halo_shot.py C:/Users/Rene/Desktop/kaleido-wt/sheets/halo2 --scenes PillarHall FoldLab --halo 0 1 2
    python C:/Users/Rene/Desktop/kaleido-wt/heavy.py "halo knob 0" -- python Tools/depth_arc.py frozen halo0 --scenes PillarHall FoldLab --fx FxRimLight

The second needs the old shader as `.screen/fxold/FxRimLight.frag` (`git show cdab7da3:FX/FxRimLight.frag`); it swaps
FX/FxRimLight.frag while it runs, so never run both at once.  Tools/halo_shot.py writes `<scene>_halo<value>.jpg` and
`<scene>_sheet.jpg` (the frames side by side, then |difference to haloP 0| x 4) and prints the differences.

### For the user

- The effect is in no preset.  To switch it on, add to the FxRimLight entry of Presets/Komplett.xml (and regenerate
  the genre presets):  `<float name="haloP"  minValue="-0.3" maxValue="1.2"></float>`  (off in a fifth of the
  activations, like `arcP`; a fixed look: minValue = maxValue = 1).
- FxRimLight is a rare effect (probability 0.004).  A halo on every scene with depth would be a block of the present
  pass (C++ plumbing in Source/PresentPass.*, a build); `haloAt()` could move there as it is.  Not done in the sprint.
- Radius (1.5 % of the height) and strength (`HaloGain` 0.8) are first guesses: at 360 lines the halo is a 5-pixel
  line.  Wider reads more as a glow, and needs more taps or a blur pass.
