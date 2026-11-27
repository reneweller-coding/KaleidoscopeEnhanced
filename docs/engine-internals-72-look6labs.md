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
| Komplett.xml roundtrip, --validate, check_schedule --quick | started 16:29, result not yet read |
| the size, near / far third against the base look, three labs | started 16:29, result not yet read |
| limiter (flash) counts of the runs with the new size | not yet read |
| the sheets | not yet looked at |
| looks 0..5 bit for bit by render (p3_ident.py) | NOT run (by the diff only: freqDepth() alone changed) |
| temporal_budget.py, shake_scan.py, shadercheck.py, doc_shaders --check, cgvr_format --check | NOT run yet |
| chain_regress with look 6 pinned (runner against uber shader) | NOT run (both are generated from the one source) |
| cost (perf_labs) | NOT run (more lit cells cost nothing: the same hashes per pixel) |
