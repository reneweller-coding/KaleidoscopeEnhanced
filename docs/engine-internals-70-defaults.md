## 27.11.2026 (70): the new switches on by default -- the picture guard, 16-bit intermediates, the looks in the presets

On 27.11. the user decided on the open points of section (69) (translated): "2. yes, please switch everything on.
3. please switch on. 4. yes, please add and switch on."  Three packages, in this order, by agent "defaults" (branch
`wt-defaults` from b0017f84).  Every number below was measured on the reference machine (RTX 5090, panel 2880 x
1620, 120 Hz), each app run through the heavy-job lock (timing runs alone).

| package | what | result |
|---|---|---|
| A | the picture guard on by default | `DefaultPictureGuard = true`; still off in scripted runs; self test 181/0, scene plans 0 violations |
| B | 16-bit intermediates as a setting (`hdrBuffers`), on by default | menu, remote, Setup tool, applies at the next start; 8-bit fallback; 307 scenes screened off/on: 0 new flags, three white-card scenes capped (`// @hdrcap`), one 2D scene bounded; +0.1..0.27 ms |
| C | voice roles, depth looks, environment light and shadow maps switched on in the presets | 102 entries of Komplett.xml (75 voiceP, 3 depthLook, 20 envP, 7 shadowMapP), genre presets regenerated; cost 0..+0.18 ms; nothing left out |

### A -- the picture guard on by default

- `RenderPipeline::DefaultPictureGuard = true` (`M_PictureGuard` starts with it; the ini key `pictureGuard` still
  wins).  The user's settings file has no `pictureGuard` key, so the new default reaches the user's show.
- Scripted runs (KALEIDO_SEED, KALEIDO_FREEZE_TIME, the sweeps, frame steps -- the snapshots, the screening, the
  exports) keep it off as built; `KALEIDO_GUARD=0|1|log` decides before both.  `guardMode()` now hands its three
  inputs to a static `guardModeFor( env, setting, scripted )`, so the self test checks the rule itself: on by
  default, off when scripted, KALEIDO_GUARD first (`on` in any case and spacing).
- README: the guard paragraph says it is on and how to switch it off (menu, remote, `pictureGuard=false`); its link
  to the no longer existing `docs/engine-internals-69-guard.md` now points at section (69).
- Checks: self test 181 passed, 0 failed (the new case among them); `check_schedule.py --quick` 20 plans, 0
  violations (the scene plan is a scripted run, the guard never acts there); `check_strings.py` OK.
- Not changed: the menu and remote labels (they show the state, which is now "on"); the Setup tool never listed the
  guard.

### B -- 16-bit intermediates as a setting, on by default

*The setting.*  Until now `RenderPipeline::hdrBuffers()` read only `KALEIDO_HDR_BUFFERS=1` (section (69), L1).  Now:

- ini key `hdrBuffers` (default `DefaultHdrBuffers = true`), written back at the exit like the other look settings
  (`lookSettings()`), switchable in the menu (Picture & overlays, "16-bit intermediates (from the next start)"), on the
  remote (Image & 3D, "16-bit light (next start)", `/api/toggle?k=hdr`, state field `hdr`) and in the Setup tool (a
  checkbox below the strict light protection, with what it costs).  Strings DE + EN.
- `KALEIDO_HDR_BUFFERS=0|1` stays and decides first (`hdrBuffersFor( env, setting )`, self-tested); anything else in
  the variable is ignored.
- *Applied at the next start.*  The targets are made in `reinit()`; `resize()` reallocates the scene, FX,
  transition, final, bloom and trail targets with the current format, but the MSAA colour, the rig scratch targets,
  the eye-packed stereo targets, the measure frame and PresentPass's `m_hdr` would each need their own re-creation,
  and a format mismatch between an MSAA target and its resolve target is a GL error.  So `hdrBuffers()` latches the
  value at its first call (the first pipeline's constructor, after `loadSettings()`), the menu and the remote change
  the setting only, and their labels say "from the next start".
- *The fallback.*  `reinit()` probes once (a 64 x 64 RGBA16F texture with mipmaps in a framebuffer): if it is not
  complete or GL reports an error, the pipeline goes back to RGBA8 and the log says `Intermediate pictures: RGBA16F
  targets incomplete on this driver ... -- 8 bit (RGBA8) instead`.  Every pipeline's present pass logs the format it
  got (`Intermediate pictures: RGBA16F (setting hdrBuffers / KALEIDO_HDR_BUFFERS)` or `RGBA8`).  The fallback could
  not be tried here (the RTX 5090 has the targets); Mesa/Linux will show in the CI.
- Tools: `Tools/light_stats.py` reads light above 1 through RGBA8 targets on purpose (a quarter of the colour, decoded
  x4), so it now sets `KALEIDO_HDR_BUFFERS=0` unless the caller sets it.  `flash_count.py`'s example names `=0`.
- Checked in the app: a settings copy with `hdrBuffers=false` logs RGBA8, with `true` RGBA16F, and the key stays in
  the file; `KALEIDO_HDR_BUFFERS=0` gives RGBA8.

*What the default changes -- the screening.*  The 214 scenes `Tools/scene_light.tsv` lists as open (no final clamp)
with light above 1 at times (`some` or `strong`), and the 93 `//@light` scenes of L2: 307 scenes, `Tools/screen.py`
(1080p, the screening music, seed 1) once with `KALEIDO_HDR_BUFFERS=0` and once with `=1`, eight chunks, 40-50 s each
(the old exe in a copy, ReleaseScreen, so builds could go on).

| measure (307 scenes) | 8 bit | 16 bit |
|---|---|---|
| flagged (empty, frozen, strobe) | 2 (OrbitalShells, VolcanicLightningPlume) | 1 (VolcanicLightningPlume) |
| strobe median / max | 1.83 / 12.7 | 1.88 / 13.4 |
| white-clipped share max | 1.33 % | 1.47 % |
| median luma, median of scenes | 0.046 | 0.046 |
| brightest frame (luma_max), median / max | 0.212 / 0.523 | 0.225 / 0.810 |

VolcanicLightningPlume was flagged as a strobe with 8 bit already (12.7, the flag at 12); its WCAG flash count
(below) even falls.  The scenes that moved most, then counted with `Tools/flash_count.py` (20 s at 60 fps, the
worst second of the nine quarter windows; three flashes a second is the limit):

| scene | screening luma median off -> on | flashes/s off -> on | mean luminance off -> on | verdict |
|---|---|---|---|---|
| CymaticsPlate (additive points) | 0.000 -> 0.071, white-clipped 0 -> 1.5 % | 0.0 -> 1.0 | 0.030 -> 0.285 | white card: capped (1.5) |
| ChladniAcousticPlate (additive points) | 0.175 -> 0.301 | 2.5 -> 2.5 | 0.163 -> 0.181 | a white mass: capped (2) |
| QuantumQubitArray (solid 3D, open) | 0.197 -> 0.375 | 0.5 -> 2.5 | 0.097 -> 0.136 | rises clearly: capped (1.2) |
| FractalBloom (2D, open) | 0.149 -> 0.405 | 1.0 -> 1.0 | 0.031 -> 0.033 | output bounded at 3 in the scene |
| HarmonicChangeLightning | strobe 2.74 -> 4.04 | 1.5 -> 1.5 | 0.022 -> 0.021 | left |
| PrismExplode | strobe 6.08 -> 7.62 | 0.5 -> 0.5 | 0.056 -> 0.056 | left |
| VolcanicLightningPlume | strobe 12.7 -> 13.4 | 3.0 -> 2.5 | 0.052 -> 0.068 | left (flagged with 8 bit too) |
| FeatherStorm | 0.120 -> 0.200 | 1.0 -> 1.0 | 0.031 -> 0.031 | left |
| ParticleGalaxy | strobe 4.49 -> 5.51 | 0.0 -> 0.5 | 0.010 -> 0.010 | left |

No second above 3 anywhere.  Sheet (frames at 12 s, 8 bit left, 16 bit right, before the caps):
`C:\Users\Rene\Desktop\kaleido-wt\sheets\defaults\b_flagged_off_on_12s.jpg` -- CymaticsPlate's sand lines become broad
white bars with a halo, ChladniAcousticPlate's lower half a soft white mass; QuantumQubitArray and FractalBloom look
alike in that frame (their change is in the pulses).

*The fix, inside the scene, restrained -- `// @hdrcap <X>`.*  An additive particle scene cannot bound its own sum:
each sprite is bounded (`cat_tone / (1 + 0.35 max)`), the blending happens after the fragment stage, and an 8-bit
target held each sum at 1 while a 16-bit one holds 20 or 50, all of which the bloom turns into glow.  So a scene may
carry a line `// @hdrcap <X>`: `EffectShader::hdrCap()` reads it with `writesDepth()`'s scan of the source (cached
per program), and `RenderPipeline::capSceneLight()` draws one full-screen triangle over the scene's finished frame
(after the MSAA resolve, before the OIT pass) with `glBlendEquation( GL_MIN )` and the colour (X, X, X, 65000)
(Engine/HdrCap.frag): every channel becomes min( itself, X ), the alpha stays.  Only with 16-bit targets -- an 8-bit
frame is never touched, so the old picture stays bit for bit -- and never on eye-packed stereo frames.
`glBlendEquation` came into `glcore` as an optional entry point (without it: no cap).  Cost: one draw of a constant
colour, not measurable next to the scene.  The limiter is not touched.

After the caps (screening on, flash count on; 8 bit unchanged):

| scene | cap | luma median (8 bit / 16 bit / capped) | brightest frame | flashes/s (8 bit / capped) | mean luminance (8 bit / capped) |
|---|---|---|---|---|---|
| CymaticsPlate | 1.5 | 0.000 / 0.071 / 0.000 | 0.079 / 0.368 / 0.088 | 0.0 / 0.0 | 0.030 / 0.040 |
| ChladniAcousticPlate | 2 | 0.175 / 0.301 / 0.193 | 0.313 / 0.423 / 0.379 | 2.5 / 2.5 | 0.163 / 0.154 |
| QuantumQubitArray | 1.2 (2: 2.5 flashes/s) | 0.197 / 0.375 / 0.115 | 0.332 / 0.475 / 0.418 | 0.5 / 1.5 | 0.097 / 0.068 |
| FractalBloom (in-scene `min( col, 3 )`) | 3 | 0.149 / 0.405 / 0.104 | 0.457 / 0.810 / 0.647 | 1.0 / 1.0 | 0.031 / 0.033 |

The capped scenes keep a brighter core than with 8 bit and the median falls a little below the 8-bit one: the
exposure sees the brighter highlights and takes the frame down.  QuantumQubitArray still flashes 1.5 times a second
against 0.5 with 8 bit (under the limit); FractalBloom's rings (`pow( 0.01 / d, 1.2 )`, unbounded) got the house
bound of L2 in the shader itself (`min( col, 3 )`, an identity for an 8-bit target).

*GPU time* (`Tools/perf_labs.py` with the review music, 25 s a scene, alone on the machine; median / p90 ms, 8 bit ->
16 bit): ChainLab2D 0.81 / 0.91 -> 1.01 / 1.07, ChainLabTunnel 1.18 / 1.23 -> 1.35 / 1.37, ChainLab3D 3.39 / 3.89 ->
3.30 / 3.66, ChainSlice3D 2.00 / 2.40 -> 2.19 / 2.54, the five Chain3D scenes +0.12..0.17 median, ChainP4mSpiralKaleidoWarp
0.61 -> 0.77, ChainWaveDrosteHex 0.57 -> 0.73.  120 fps in every scene both ways (min 110 once, ChainSlice3D); every p90
within release_check's budgets (ChainLab2D 1.5, ChainLabTunnel 2.0, ChainLab3D 8.0, ChainSlice3D 4.5, else 6.0).
+0.1..0.27 ms, as L1 measured.  GPU memory: +330 MB from L1's soak (not measured again).

*Readbacks.*  The snapshot tool's frozen frame (the web remote's `/api/snapshot`, a readback of the presented
picture) works with the default: 10 scenes off and on, 0 failed; with `KALEIDO_HDR_BUFFERS=0` 9 of 10 identical to
2026-11-26-base (LightningStorm differs as it does between two runs of the old code, a GPU simulation).  The video
export works with 16 bit (every flash count above is an export).  Not run again: the recorder, the screenshot key
(both read the presented 8-bit picture, code unchanged), the 30-min soak.  The rewind history ring stays 8 bit
(known).

*Self test* 182 passed, 0 failed with the default and with `KALEIDO_HDR_BUFFERS=0`.

*Snapshots.*  With B the default picture changes; the lead renders a new whole-catalogue baseline after the merge.
`Tools/snapshot_baseline.txt` is not changed.

### C -- the new looks in the presets

*What was switched on, in Presets/Komplett.xml* (the master; then `python Tools/make_genre_configs.py`, which only
added the same lines to the ten genre presets -- 579 lines added, none changed or removed):

| knob | entries | form | effect |
|---|---|---|---|
| `voiceP` | 75: the 20 labs, the 4 chain labs, the 41 Chain*/Chain3D* scenes, the ten I3 scenes (every Scene2D/Scene3D file that declares it) | `<expr name="voiceP" formula="1"/>` | the voices' roles (section (69), I2) at full strength |
| `depthLook` + `depthVar` | ChainLab2D | `<float name="depthLook" minValue="-1.17" maxValue="5.49">`, depthVar 0..99.49 | rolled per activation; the shader takes `int( x + 0.5 )` above 0.5: look 0 (the old picture) about 25 %, each of the five looks about 15 %, the variant 0..99 |
| `depthLook` | TimeChainLab, MirrorBilliardLab | 2.83..5.49 | the subject anchor (> 3.5) about 75 %, off 25 % |
| `envP` | 20: SpectralOrb, SpectralTorus, JellyBody, the 11 ChromeForm entries, MetaSculpt, BloomSculpt, Detonation, Ocean, ChromeFlow, MirrorShardKaleidoscope | 0.5..1 | always on, strength rolled |
| `shadowMapP` | 7: MeshTuningForks, MeshDominoWave, MeshMetronomes, MeshSeismograph, MeshZoetrope, MeshFoundryPour, MeshPendulumWave | 0.6..1 | the lamp's shadow map, always on |

Look 0 stays one outcome in four on purpose: the looks show only on photos with a depth map (418 of 977), the anchor
only on the 53 with a sure subject.  The ranges are rolled like the labs' other knobs (a `<float>` range per
activation; the variant number as in the variant round of 23.10.).

*Cost first* (`perfwrap.py` of agent env3d: Tools/perf_labs.py's run with the knob appended at the end of the entry,
the same rolls for 0 and 1, 20-25 s a scene live at 2880 x 1620, alone on the machine, 16-bit intermediates on; GPU
median / p90 ms, knob 0 -> 1):

| scene | 0 | 1 |
|---|---|---|
| SpectralOrb (envP) | 0.77 / 0.78 | 0.76 / 0.78 |
| SpectralTorus | 0.90 / 0.92 | 0.77 / 0.78 |
| JellyBody | 0.88 / 0.91 | 0.84 / 0.87 |
| ChromeForm | 0.85 / 1.08 | 0.84 / 1.09 |
| MetaSculpt | 1.86 / 2.16 | 1.89 / 1.92 |
| BloomSculpt | 0.90 / 0.92 | 0.93 / 0.99 |
| Detonation | 0.77 / 0.79 | 0.89 / 0.97 |
| Ocean | 0.90 / 0.99 | 0.77 / 0.80 |
| ChromeFlow | 0.92 / 0.99 | 0.95 / 1.02 |
| MirrorShardKaleidoscope | 0.99 / 1.00 | 1.00 / 1.01 |
| MeshTuningForks (shadowMapP) | 0.93 / 0.94 | 0.99 / 1.00 |
| MeshDominoWave | 1.07 / 1.08 | 1.25 / 1.27 |
| MeshMetronomes | 1.11 / 1.12 | 1.25 / 1.26 |
| MeshSeismograph | 0.95 / 0.96 | 1.08 / 1.09 |
| MeshZoetrope | 0.97 / 0.98 | 1.02 / 1.05 |
| MeshFoundryPour | 1.01 / 1.01 | 1.16 / 1.17 |
| MeshPendulumWave | 0.94 / 0.95 | 0.99 / 1.00 |
| ChainLab2D (voiceP) | 1.09 / 1.10 | 1.09 / 1.10 |
| FoldLab | 0.95 / 1.22 | 0.96 / 0.97 |
| MirrorBilliardLab | 0.99 / 1.09 | 0.99 / 1.12 |
| EngravingLab | 0.93 / 0.94 | 0.95 / 1.06 |

envP costs nothing measurable (-0.13..+0.12 ms, the noise of single runs; Detonation +0.12 with its fixed-mip
lookup); the shadow pass +0.05..0.18 ms (a second, depth-only draw of the model into the 2048 x 2048 map); the roles
0..+0.02 ms (these runs were silent, the roles' arithmetic runs regardless).  120 fps in every run; every p90 far under
the 6 ms budget.  **Nothing was left out.**  (The depth looks' cost was measured in (69), T4: +0.01..0.04 ms.)

*Checks.*  `PresetEditor --roundtrip` of every preset: all load and save (Komplett and Allround 2,930 entries each);
`--validate`: all 12 files complete against Komplett.xml.  `Tools/check_schedule.py --quick`: 20 plans, 0 violations
(labs 26.3..49.3 % against their shares).  Snapshots of the 102 changed entries (frozen, silent, the user's settings,
`KALEIDO_HDR_BUFFERS=0` so that only C shows) against 2026-11-26-base: 30 entries changed by more than 1 of 255 --
the 20 envP entries, five mesh scenes, ChainLab2D, TimeChainLab, MirrorBilliardLab; the 72 other voice entries stay
within the tolerance of 1 of 255 (the roles answer the music, and the snapshot is silent).  A trap (section (69), T4 and U2): an entry with an
added knob rolls its other knobs differently, so the frames differ in framing and colour as well as in the look --
the sheets show the look's character, not a pure difference.  MeshSeismograph and MeshFoundryPour came out black, as
in every frozen set since 26.11. 00:45 with the old code as well (the frame is taken before their large models load).

Sheets (base | new | difference x4): `C:\Users\Rene\Desktop\kaleido-wt\sheets\defaults\c_changed_vs_base_1.jpg`
(the envP scenes: the orb, the torus and the jelly mirror the photo; ChromeForm's room and figure take the photo's
colours, a bright patch of the photo stands in its sky), `_2.jpg` (the other ChromeForm entries, two mesh scenes),
`_3.jpg` (the mesh scenes -- MeshZoetrope shows the shadow beside its base most clearly -- and the three labs with a
depth look).

### For the user

- QuantumQubitArray still flashes 1.5 times a second with 16 bit against 0.5 with 8 bit (cap 1.2; under the limit of
  3).  A lower cap or the old 8-bit picture for this scene is a choice.
- The caps' values (1.5, 2, 1.2, 3) are first measurements on one photo and one piece of music.
- The roles, looks, environment light and shadows are on everywhere they exist; the sheets show them frozen and
  silent.  How they feel with music and over hours is the user's to see.

### Not verified

- The 8-bit fallback on a driver without RGBA16F targets (Mesa/Linux: the CI).
- The recorder and the screenshot key with 16 bit (unchanged code, reading the presented 8-bit picture); a new
  30-min soak.
- GPU memory with the default (L1 measured +330 MB).
- The depth looks over many photos in the app (only the snapshot photo).
