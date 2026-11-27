### look6labs -- depth look 6 rolled in the two labs, and three to four times its size

27.11.2026, 16:23-16:53, agent "look6labs", branch `wt-look6labs` (from phos-cues cdab7da3).  Finishes P3 of
docs/PLAN_2026-11-27.md (section (71), "P3 -- frequency by depth": "direction right, size small").

#### 1. The roll (commit c4151641, Presets/Komplett.xml only)

TimeChainLab and MirrorBilliardLab: `depthLook` 2.83..5.49 -> **2.70..5.90**.  The labs read `> 3.5` as the subject
anchor and `> 5.5` as look 6 (the anchor plus frequency by depth), so the outcomes are: off 25 % (0.80 of 3.20, as
before: 0.67 of 2.66 = 25 %), the anchor 62.5 % (was 75 %), look 6 12.5 % -- the share one look has in ChainLab2D
(-1.51..6.49).  The genre presets are NOT regenerated (the lead runs Tools/make_genre_configs.py after merging).

#### 2. The size (Tools/scenegen/gen.py FREQ_LIB, freqDepth() only)

| constant (variant 0 = the middle) | before | after |
|---|---|---|
| near layer: lift at a full kick | 16..32 % | 45..75 % |
| near layer: share of the photo's own colour (full brightness) in the lift | 0.25 | 0.4 |
| far layer: glint cells, of the height | 1/110..1/170 | 1/64..1/100 |
| far layer: cells lit | 20..34 % | 40..56 % |
| far layer: glint gain | 1.2..2.2 | 2.4..3.6 |
| far layer: share of the own colour in a glint | 0.5 | 0.8 |

Unchanged: the layers (fdLayers()), the mids' chroma, the jitter (+-0.2) and the radius (<= 0.24 of the cell: every
point stays round and inside its cell, rule V8e), the twinkle, the drift on sceneAdvance, ChainLab2D's size of the
near layer (0.8..2.5 %, the swell and a fifth of the bass -- a spatial scale, deliberately not raised).  Why these
and not a layer's light on the hat: the kick's envelope stays below the 3 Hz of the temporal budget and lights a part
of the picture; the hat runs at 8 Hz and more, so the far layer gets more, larger and brighter *points* (fine local
detail), never a light of the whole layer.

Knob: `depthLook` 6 itself (the code sits behind `depthLook > 5.5`; freqDepth() has no other caller).  Looks 0..5 and
every lab variant with them are textually unchanged: the diff of the four generated files touches only the body and
the comment of freqDepth() (`git diff c4151641..HEAD -- Scene2D Engine`).  Look 6's own picture changes for every
depthVar -- that is the package.  Generated with `python Tools/scenegen/gen.py ChainLab2D TimeChainLab
MirrorBilliardLab` (ChainLab2D.frag, TimeChainLab.frag, MirrorBilliardLab.frag, Engine/ChainPass/Final_ChainLab2D.frag;
the other chain passes came out unchanged).

#### Measured (commit 0d844bb2 against the old shaders, both rendered with the build of cdab7da3)

The screening music's full mix (Tools/reactivity.py's voices music, 128 BPM), kristallhoehle-indigo-fuchsia-2, seed 7,
`depthVar` 0, 291 frames at 30 fps per lab.  What look 6 adds against the base look with the same rolls (ChainLab2D:
look 0; the labs: look 4), mean per frame in the nearest and the farthest third of the pixels by the depth view (of
255), as p3_cmp2.py; in brackets the largest frame:

| lab | near third, before -> after | far third, before -> after |
|---|---|---|
| ChainLab2D | +2.82 (17.3) -> **+7.21** (32.0), 2.6x | +0.39 (2.0) -> **+0.86** (3.9), 2.2x |
| TimeChainLab | +1.45 (4.5) -> **+2.93** (9.1), 2.0x | +0.24 (0.8) -> **+0.82** (2.8), 3.4x |
| MirrorBilliardLab | +2.25 (8.7) -> **+5.75** (22.9), 2.6x | +0.34 (0.8) -> **+1.09** (2.9), 3.2x |

So: two to two and a half times in the near layer, two to three and a half times in the far one -- below the "three
to four times" aimed at for the near layer.  The picture is brighter than (71) assumed (mean 28..36 of 255 with the
build of cdab7da3), so the near layer's gain counts more than its own-colour share, and the gain went 0.24 -> 0.60
(2.5x).  A further step (0.60..0.90, own colour 0.55) would reach three times; it was not taken without a look at a
bright photo (a full kick would lift a bright near layer by 75 %).

Correlation with the voices' onsets (best Pearson over lags 0..6 frames), after: ChainLab2D near kick 0.18 / bass
0.20 / hat 0.12, far kick 0.24 / bass 0.27 / hat 0.22; TimeChainLab near 0.25 / 0.37 / 0.12, far 0.36 / 0.40 / 0.34;
MirrorBilliardLab near 0.27 / 0.40 / 0.13, far 0.39 / 0.46 / 0.35 -- as before within 0.01..0.08: the near layer
follows the bass and not the hat; the far layer follows the hat better than the near one does, but the kick and the
bass as much (the reasons of (71) hold: fine interleaving at 160 x 90, bloom, exposure).  The size grew, the
separation did not.

No flash: the limiter's samples dimmed / flash-on in the lab's own window -- ChainLab2D 1 / 0 of 120 before and
after; TimeChainLab 66 / 0 (look 4: 65 / 0, old look 6: 66 / 0); MirrorBilliardLab 0 / 0.  The frame mean's largest
step from one frame to the next (of 255): ChainLab2D 18.4 (look 0: 20.0 -- the lab's own), TimeChainLab 3.3 (look 4:
2.0, old look 6: 2.5), MirrorBilliardLab 3.6 (1.4, 2.1).

Sheets (kaleido-wt\sheets\look6labs\): `look6labs_<lab>_before_after.jpg` -- base look | look 6 before | look 6
after | before - base x4 | after - base x4 | depth view, on a kick and on a hat between the kicks.

#### Verified / not verified

See the table at the end of this file ("State") -- it is kept current.

#### How to verify (the helpers are in C:\Users\Rene\Desktop\kaleido-wt\, outside the repository)

    rem the presets (no make_genre_configs): roundtrip of Komplett.xml, --validate, check_schedule --quick
    python C:\Users\Rene\Desktop\kaleido-wt\heavy.py "lead: presets" -- python C:\Users\Rene\Desktop\kaleido-wt\p3b_presets_check.py
    rem the size: the screening music's full mix once per run (13 s each), then near/far third as p3_cmp2.py
    python C:\Users\Rene\Desktop\kaleido-wt\heavy.py "lead: look 6" -- cmd /c C:\Users\Rene\Desktop\kaleido-wt\p3b_after.cmd
    rem   p3b_full.py TAG SCENES EXPRS KINDS   one export per kind (full, depthview), videos in .screen\reactivity\voices\TAG
    rem   p3b_cmp.py RUN BASE DEPTHRUN         what RUN adds against BASE in the near and the far third, per voice
    rem   p3b_sheet.py BASE OLD NEW OUTDIR     base | look 6 before | after | differences x4 | depth view
    rem the before runs (old shaders, c4151641) are kept: tags l6b_cl_l0, l6b_cl_old, l6b_labs_l4, l6b_labs_old
    rem looks 0..5 bit for bit: python C:\Users\Rene\Desktop\kaleido-wt\p3_ident.py (old shaders against new, 40-s waits)

#### For the user

- The share of look 6 in the two labs: 12.5 % (as one look in ChainLab2D), taken from the anchor's 75 %.  A larger
  share is the upper end of the range: 2.51..6.49 gives off 25 %, anchor 50 %, look 6 25 %.
- The size: if the near layer's lift on the kick is too much on bright photos, the first constant (0.45..0.75) is
  the one to lower; the glints' are the last four.

#### State

| what | state |
|---|---|
| PresetEditor --roundtrip Komplett.xml | ran: ok, 2937 entries |
| PresetEditor --validate | ran: rc 0, "all 12 file(s) complete vs. Komplett.xml" (the genre presets still hold the old range until regenerated) |
| Tools/check_schedule.py --quick | started 16:31 in the same job; result in kaleido-wt\p3b_presets.log (last lines, `PRESETS_BAD=0` = good); NOT read when this was written |
| the size, near / far third against the base look, three labs | measured, see "Measured" (commit 0d844bb2) |
| limiter (flash) counts of the runs with the new size | read: no more than with the old size, see "Measured" |
| the sheets | all three looked at: the near layer's light shows clearly in "after - base" on the kick (ChainLab2D, MirrorBilliardLab; weaker in TimeChainLab), the glints as fine points; only at the sheets' small size, only the dark screening photo, no bright photo, no moving picture |
| looks 0..5 bit for bit by render (p3_ident.py) | NOT run (by the diff only: freqDepth() alone changed) |
| temporal_budget.py | ran: 0 errors, 4 warnings (as before) |
| shake_scan.py --summary --baseline | ran: 0 new SHAKE/FRAME/STEP hits, 74 known |
| doc_shaders.py --check, cgvr_format.py --check (the four files) | ran: would change 0; 4 of 4 same |
| shadercheck.py | NOT run (the app compiled and rendered all three labs with look 6 in the runs above) |
| chain_regress with look 6 pinned (runner against uber shader) | NOT run (both are generated from the one source) |
| cost (perf_labs) | NOT run (more lit cells cost nothing: the same hashes per pixel) |
