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

1. `Presets/Komplett.xml`: `<float name="fluidDepthP" minValue=".." maxValue="..">` in the scene's entry. Committed
   separately and registered at **0..0** for the three scenes: the picture stays the old one until the range is raised.
2. The three scenes declare `uniform float fluidDepthP;` (they do not use it; the declaration documents the knob and
   keeps `Tools/audit_params.py` free of a stale entry).
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

Verified:
- the app builds (see the report for the build's result line);
- `python Tools/doc_shaders.py --check` and `python Tools/cgvr_format.py --check`: clean for the four shaders;
- `python Tools/audit_params.py`: 0 stale parameters (with the Komplett.xml commit; without it the three scenes show
  `fluidDepthP` under "missing", as 2,146 other entries do for other uniforms).

NOT verified (no render ran in the sprint):
- that `Engine/FluidSim.frag` compiles on the driver (it is compiled at the app's start: a failure shows as
  "FAILED" in the log and `m_fluidReady` false -- the three scenes then fall back to the photo);
- the picture at any knob value, with any photo; the constants above are a first guess;
- knob 0 bit-identical by snapshot (only argued above);
- GPU time (expected small: 18 more texture reads per texel of a 512 x 512 pass, only at knob > 0);
- `Tools/shadercheck.py`, the self test `Kaleidoscope.exe -q`, `Tools/temporal_budget.py`, `Tools/shake_scan.py`;
- whether registering one more rolled parameter (even 0..0) shifts the other rolls of the three scenes for a given
  seed (then their frozen snapshots change although the code path is the old one -- drop the Komplett.xml commit if so).

## How to verify (lead)

`Release\Kaleidoscope_old.exe` in the worktree is a copy of the build of cdab7da3 (gitignored). The snapshot photo of
`2026-11-26-base` (kristallhoehle-indigo-fuchsia-2.jpg) has a map.

    cd C:\Users\Rene\Desktop\kaleido-wt\p5
    rem knob 0 (the presets as committed) and knob 1 (forced):
    python ..\heavy.py "lead: simfluid k0" -- python Tools\scene_snapshots.py render wt-simfluid-k0 --only Fluid Schlieren
    set KALEIDO_FLUID_DEPTH=1
    python ..\heavy.py "lead: simfluid k1" -- python Tools\scene_snapshots.py render wt-simfluid-k1 --only Fluid Schlieren
    set KALEIDO_FLUID_DEPTH=
    python Tools\scene_snapshots.py compare wt-simfluid-k0 wt-simfluid-k1
    rem identity: the same --only in the main checkout at phos-cues (old code), then
    python Tools\scene_snapshots.py compare <old set> wt-simfluid-k0      (Fluid, FluidInkMandala, Schlieren: diff 0.00)

(`--only Fluid` also renders the six other scenes with "Fluid" in the name; they must not change in any set.)
A photo without a map: `--photo <a photo that photo_info.tsv marks flat>` -- k0 and k1 must be equal.
Photo change: run the app with a preset of the three scenes and `KALEIDO_FLUID_DEPTH=1`, watch a photo cross-fade.

## Still missing of the plan's P7

- the look itself judged on three photos (clip before/after), the constants tuned, GPU time measured;
- the second stage, occlusion: the simulation layer behind everything nearer than `photoSubject`, only at
  `photoMask > 0.6` -- belongs into the three scenes' compositing (they would then use `fluidDepthP` or a second knob);
- `ComputeFX::stepNSFluid` (no scene shows it) and the other simulations (particles: agent "simpart").

## For the user

- The range of `fluidDepthP` in Komplett.xml (now 0..0 = off). Proposal after a look: 0.5..1.0 for Fluid and
  Schlieren, 0.3..0.8 for FluidInkMandala (its mandala fold hides the photo's layout anyway).
- Whether the near should stay "the picture" (stronger refresh, as built) or only be an obstacle.
