### F1 -- the harmony hue drift at constant lightness

The final pass tints the whole picture with the harmony: `c = hueRotate( c, audioChromaHue * 0.18 )`
(Engine/Present.frag). `hueRotate` rotates RGB about the grey axis (Rodrigues). That keeps R+G+B, not the perceived
lightness: yellow turned towards blue comes out far darker. Measured in numpy on 50 frames of the snapshot set
2026-11-10-all (every 53rd scene, 160x90), the mean |L_after - L_before| over the frame's mean L, OKLab L, for seven
offsets:

| offset (turns) | old: mean | old: p90 | new: mean | new: p90 |
|---|---|---|---|---|
| 0.02 | 1.68 % | 2.66 % | 0.03 % | 0.01 % |
| 0.05 | 3.89 % | 6.05 % | 0.07 % | 0.03 % |
| 0.09 | 6.11 % | 9.16 % | 0.09 % | 0.04 % |
| 0.18 | 8.08 % | 13.26 % | 0.10 % | 0.06 % |
| 0.25 | 8.04 % | 16.85 % | 0.10 % | 0.07 % |
| 0.375 | 11.10 % | 20.44 % | 0.05 % | 0.08 % |
| 0.5 | 16.77 % | 26.09 % | 0.03 % | 0.10 % |
| all | 7.95 % | | 0.07 % | |

New: `hueRotateOk` -- sRGB decode, OKLab (Ottosson 2020), the a/b plane turns, L stays; where the turned colour leaves
the gamut (below 0, or above the brighter of 1 and the colour's own brightest channel -- the grade before it can push
a channel over 1) the chroma is pulled back by six bisection steps instead of clipping a channel, which would shift
hue and lightness again. The remaining 0.07 % is that chroma pull-back and the 8-bit frames. At turn 0 (silence,
`|turns| < 1e-6`) the colour passes through untouched, so silent snapshots do not move. `KALEIDO_OLD_HUE=1` (uniform
`oldHue`, Source/PresentPass.cpp) brings back the RGB rotation for comparisons. The stage lamps of the light show keep
`hueRotate`: they are light sources whose colours were tuned with it.

The sheet (C:\Users\Rene\Desktop\kaleido-wt\sheets\lead\f1_hue_sheet.jpg; columns: frame, old 0.18, new 0.18, old
0.375, new 0.375) shows where it was visible: a green glass vessel turned dark violet by the old rotation stays at its
lightness, a pink heart stays light instead of turning deep magenta. The angles of the two rotations do not
correspond (the same offset gives other hues) -- irrelevant, the drift has no fixed reference.

### F2 -- the scenes' own HSV colours (report only)

1,546 of 2,476 scene shaders (2D and 3D) carry their own `hsv2rgb`/`hsv`; 1,544 call it, almost all with value 1.0,
and in 1,530 the hue argument moves with time, the music or `famHue`. Around the HSV hue circle at value 1 the
OKLab lightness swings 0.66..0.97 at saturation 0.5, 0.54..0.97 at 0.7 and 0.47..0.97 at 0.9 -- a factor 1.5 to 2.1,
darkest at blue (hue 0.67), brightest at yellow (0.17). A scene whose hue drifts therefore breathes in brightness
as its hue passes blue, slowly where the hue follows `audioChromaHue`, faster where it follows the clock. 2,205
shaders take (part of) their palette from the photo via `imgPalette`; those colours do not have the problem.

Not changed: a replacement of `hsv()` by a constant-lightness hue (OKLCh) would change the look of 1,500 scenes at
once. The helper sits in each file (Tools/scenegen/gen.py writes one for the scenes it generates; the files carry no
generator stamp, so which of the 1,546 came from it is not known without matching them). If wanted, the way would be
family by family with a before/after measurement of the brightness wobble (Tools/temporal_budget.py measures change
rates, not this slow breathing; a new measure would be needed). A decision for the user.
