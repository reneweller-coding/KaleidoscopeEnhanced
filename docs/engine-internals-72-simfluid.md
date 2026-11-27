# (72) simfluid -- the fluid in the photo's relief (plan 27.11. P7, first stage)

Sprint of 27.11.2026, 16:25-16:50, branch `wt-simfluid`. Read the section "Verified / not verified" before merging:
the code is built, the picture was **not** looked at.

## Which fluid reaches the screen

Two fluids exist. Only one is ever drawn:

| path | sampler | scenes that declare it | state |
|---|---|---|---|
| `GpuSims::stepFluid` + `Engine/FluidSim.frag` (curl-noise dye advection, 512 x 512, RGBA16F) | `texFluid`, unit 8 | `Scene2D/Fluid.frag`, `Scene2D/FluidInkMandala.frag`, `Scene2D/Schlieren.frag` -- one entry each in `Presets/Komplett.xml` (probability 0.5, 0.45, 0.35) | **this one got the depth** |
| `ComputeFX::stepNSFluid` (Navier-Stokes with a pressure solve) | `texNSFluid`, unit 25 | none: `grep -l texNSFluid Scene2D Scene3D FX Engine Transitions` is empty, so `cfxMask()` never has its bit and it is never stepped | untouched |

So the work went into the GpuSims path; `Source/ComputeFX.cpp` is not touched at all (no conflict with "simpart").
The other "fluid" names in Komplett.xml (FluidInkMarble, NeonFluidDynamics, FluidPhotoMarblingEbru, Ferrofluid...,
Superfluid..., SPHFluidSplash) are analytic or have their own state pass; they do not sample `texFluid`.

## What changed

**The knob.** `fluidDepthP`, a scene parameter (0..1; 0 = the old step). Its way:

1. `Presets/Komplett.xml`: `<float name="fluidDepthP" minValue=".." maxValue="..">` in the scene's entry. **Not
   registered on this branch**: commit 46c00428 registered it at 0..0 for the three scenes and 5100bb45 reverted it,
   because one more rolled parameter shifts the scene's other rolls (measured, see below). Without the entry the knob
   is 0 and the picture the old one. The diff of 46c00428 shows where the lines go.
2. The three scenes declare `uniform float fluidDepthP;` (they do not use it; the declaration documents the knob;
   `Tools/audit_params.py` lists it under "missing" until it is registered, as it does for 5,157 other uniforms).
3. `RenderPipeline::stepSimulations()` (only while `need.fluid`): reads the rolled value by name
   (`EffectShader::namedParameters()`) from the scene that samples the fluid -- the incoming one during a scene
   cross-fade as soon as it uses the fluid, else the active one; a scene without the knob gives 0 -- and the two
   slots' `PhotoDepth::Info::map` (`m_actDepth`, `m_nextDepth`; both 0 with a live input) into `GpuSims::Frame`
   (`fluidDepth`, `depthAmtA`, `depthAmtB`).
   `KALEIDO_FLUID_DEPTH=<0..1>` forces the knob for comparisons (read once at the first fluid frame; not yet in the
   README's list of switches).
4. `GpuSims::run()` slews it linearly at 1 per second of the sim's own time (`m_fluidDepthNow`): two fluid scenes
   with different knobs cross-fade the flow, and a linear slew arrives exactly, so 0 stays 0.
5. `GpuSims::stepFluid()` sets `fluidDepth` and `photoDepthAmt` on `Engine/FluidSim.frag`.

**The shader** (`Engine/FluidSim.frag`). `relief(uv)` = `interpolation * photoDepthAmt.x * tex0.a
+ (1 - interpolation) * photoDepthAmt.y * tex1.a`, read at mip level 3 (the map is 8 bit and 512 wide; the photo
textures have mipmaps). It is the nearness (1 = near) weighted per slot, so

- a photo without a map adds nothing (its alpha is 255 = "everything near", which the weight 0 removes);
- a photo change fades the landscape with the same `interpolation` as the colour -- nothing switches, and at the slot
  swap (tex1 becomes tex0, interpolation 0 -> 1) the product is the same on both sides, as for the colour;
- with `mapW = interpolation * amt.x + (1 - interpolation) * amt.y == 0` (no map in either slot, a live input) or
  `fluidDepth == 0` the whole block is skipped (`land` false).

Inside `if ( land )`, with `grad` the relief's gradient (central differences at 4 and 9 sim texels, averaged),
`up = grad / |grad|`, `wall = smoothstep(0.25, 3.0, |grad|)`:

| term | code | meaning |
|---|---|---|
| deflection | `vel -= fluidDepth * wall * max(dot(vel, up), 0) * up` | the uphill part of the flow (into the near thing) is taken out; the flow follows the contour lines; downhill passes |
| soft obstacle | `vel *= 1 - 0.7 * fluidDepth * smoothstep(0.45, 0.95, nearW)` | the flow slows in the near, never to a stop |
| downhill drift | `vel -= 1.2 * fluidDepth * wall * up` | a slope carries dye towards the far (the old cap `min(|vel|, 3)` still holds) |
| collecting | fade `pow(mix(0.996, 0.9988, fluidDepth * farW), stepScale)`; injection `* clamp(1 + fluidDepth * (1.5 * nearW - 0.6 * farW), 0, 3)` | the far keeps its old ink longer and is refreshed less by the photo; the near is refreshed faster and stays the picture |

Fade and injection stay convex mixes of the old dye and the photo, so nothing can grow (no new brightness, no
flash: the temporal budget cannot be touched by this). The flow's strength keeps its old audio coupling (`impulse`
scales the displacement, as before); no new audio input, no camera, no `time * audio`.

**Knob 0 = the old code, by construction:** `land` is false, `vel` is not touched, and the old fade/injection lines
stand verbatim in the `else` branch (not rewritten with a variable base, so the compiler sees the same expressions);
the uniform's default is 0; the slew adds exactly 0. The branch depends on uniforms only (no derivative trouble).

## Verified / not verified

Verified (27.11., 16:40-16:43; frozen snapshots of Fluid, FluidInkMandala, Schlieren with `Tools/scene_snapshots.py`'s
`render()`, photo kristallhoehle-indigo-fuchsia-2.jpg (has a map), seed 7, 640 x 360 JPG, mean absolute difference
of 255):
- the app builds (one build, 3.8 min, rc 0, no errors); the 15 app runs logged no "FAILED", no GL error, no
  expression error -- `Engine/FluidSim.frag` compiles on the driver;
- **knob 0 = the old code**: set `wt-simfluid-old` (the exe of cdab7da3 + the shader of cdab7da3) against
  `wt-simfluid-k0` (new exe, new shader, no knob), same Komplett.xml: **0.000 / 0.000 / 0.000**;
- the knob acts: `wt-simfluid-k0` against `wt-simfluid-k04` (`KALEIDO_FLUID_DEPTH=0.4`) 12.2 / 6.9 / 13.6, against
  `wt-simfluid-k1` (`=1`) 22.5 / 17.2 / 16.6;
- **registering the knob shifts the rolls**: the same code with the Komplett.xml of cdab7da3
  (`wt-simfluid-k0-oldxml`) against the one with the three 0..0 entries (`wt-simfluid-k0`): 7.9 / 6.9 / 13.7 --
  hence the revert. `wt-simfluid-k0-oldxml` against `2026-11-26-base`: 0.62 / 0.52 / 0.75 (below the tool's
  tolerance of 1.0; the base is from b87fcc34, before the merges of 26./27.11.);
- `python Tools/doc_shaders.py --check`, `python Tools/cgvr_format.py --check`: clean for the four shaders;
  `python Tools/temporal_budget.py`: 0 errors, 4 warnings (not looked at whether they are the old ones);
  `python Tools/shake_scan.py --summary --baseline Tools/shake_baseline.tsv`: 0 new hits.

What the pictures show (sheets, left knob 0, right the knob; `C:\Users\Rene\Desktop\kaleido-wt\sheets\simfluid\`:
`<scene>_k0_k04.jpg`, `<scene>_k0_k1.jpg`) -- one photo, one frozen frame each, looked at once:
- 0.4: the swirls stay, the relief shows -- the flow bends along the cave's facets, the near facets stay sharper
  and brighter, seams form in the far. A usable look.
- 1.0: too much. The swirl is nearly gone; the dye freezes into a mosaic of cells along the relief's edges (the
  drift and the stronger refresh win over the curl flow), the photo's highlights stand as hard light patches.

NOT verified:
- the look in motion (no clip; only frozen frames), with other photos, and a photo change while the knob is on
  (the cross-fade of the landscape is only argued from the formula);
- a photo without a map with the knob on (must equal knob 0; `land` is false there -- argued, not rendered);
- the knob read from a preset entry (`namedParameters()`); all renders forced it with `KALEIDO_FLUID_DEPTH`;
- GPU time (expected small: 18 more texture reads per texel of a 512 x 512 pass, only at knob > 0);
- `Tools/shadercheck.py`, the self test `Kaleidoscope.exe -q`;
- the constants: a first guess, not tuned.

## How to verify (lead)

`Release\Kaleidoscope_old.exe` in the worktree is a copy of the build of cdab7da3 (gitignored). The snapshot photo of
`2026-11-26-base` (kristallhoehle-indigo-fuchsia-2.jpg) has a map.

The sets of the sprint (in `%LOCALAPPDATA%\KaleidoscopeVisualizer\snapshots`): `wt-simfluid-k0`, `-k1`, `-old` were
rendered WITH the three 0..0 entries in Komplett.xml (since reverted); `wt-simfluid-k0-oldxml` and `wt-simfluid-k04`
with the file as it is on the branch now (`-k04` forced to 0.4). New labels for a repeat:

    cd C:\Users\Rene\Desktop\kaleido-wt\p5
    rem knob 0 (the branch as it is) and the knob forced:
    python ..\heavy.py "lead: simfluid k0" -- python Tools\scene_snapshots.py render lead-simfluid-k0 --only Fluid Schlieren
    set KALEIDO_FLUID_DEPTH=0.4
    python ..\heavy.py "lead: simfluid k04" -- python Tools\scene_snapshots.py render lead-simfluid-k04 --only Fluid Schlieren
    set KALEIDO_FLUID_DEPTH=
    python Tools\scene_snapshots.py compare lead-simfluid-k0 lead-simfluid-k04
    rem identity against the old code: the same --only in the main checkout at phos-cues, then
    python Tools\scene_snapshots.py compare <old set> lead-simfluid-k0   (Fluid, FluidInkMandala, Schlieren: 0.00)

(`--only Fluid` also renders the six other scenes with "Fluid" in the name; they must not change in any set. The
sprint's sets hold only the three scenes: the two scripts that made them filtered by exact name and are not in the
repository.)
A photo without a map: `--photo <a photo that photo_info.tsv marks flat>` -- knob 0 and knob 0.4 must be equal.
Photo change: run the app with a preset of the three scenes and `KALEIDO_FLUID_DEPTH=0.4`, watch a photo cross-fade.

## Still missing of the plan's P7

- the look itself judged on three photos (clip before/after), the constants tuned, GPU time measured;
- the second stage, occlusion: the simulation layer behind everything nearer than `photoSubject`, only at
  `photoMask > 0.6` -- belongs into the three scenes' compositing (they would then use `fluidDepthP` or a second knob);
- `ComputeFX::stepNSFluid` (no scene shows it) and the other simulations (particles: agent "simpart").

## For the user

- Whether and with which range `fluidDepthP` goes into Komplett.xml (now not registered = off). From the two frozen
  frames: about 0.2..0.5; 1.0 kills the swirl. Registering it changes the three scenes' rolls for a given seed
  (their snapshots against the baseline change once, by 7-14 of 255, whatever the range).
- Whether the near should stay "the picture" (stronger refresh, as built) or only be an obstacle.
