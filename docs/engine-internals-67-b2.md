## 20.11.2026 (67): the unmoved -- music into the structure of the least reactive scenes, the rest sorted (B2)

Plan 20.11.2026, package B2. Written as a section of its own for the lead to fold into docs/engine-internals.md.

### What was found

- *Input:* the bottom 5 % of `Tools/scene_reactivity.tsv` (B1): 124 scenes below react 0.050, 25 of them rated
  interest 7 or 8. Each was looked at on the B1 contact sheets (music left, silence right) and in its source.
- *The measure moves with the scene's place in its set.* `Tools/reactivity.py --scenes` renders the names in sorted
  order, and the rolls under `KALEIDO_SEED`, the analyser's state and the encoder's noise depend on that place. One
  set measured twice gives the same numbers (three untouched controls repeated to 0.003), but the same scene in
  another set does not: KardashevTypeIIICity read react 0.018 in B1, 0.261 and 0.002 in two other sets (its sync
  0.14 / 0.43 / 0.09; its struct 0.08 every time). Sync is the noisy half: for a scene the music does not touch, the
  music run's extra frame difference is encoder noise, and its correlation with the onsets is anything from 0 to 0.4.
  Hence every before/after below is one set measured twice, at the base commit (3927e55a) and with the change.
- *Two more readings of the untouched scenes* (`all124base`: all 117 measurable ones in one go; `rest3`: the 73 left
  after the changes): 48 of 117 stayed below 0.05 in the second reading; with the median of the three readings, 46 of
  the 73 left are below 0.05 and 27 above (B1's low value was the position).
- *Why they were deaf -- the numbers of the screening music.* A probe scene that drew the uniforms as bars
  (bar heights survive the exposure and the encoder; grey levels did not) gave, per 8-s window of the screening WAV
  (4 s loud, 4 s quiet): `sceneAdvance` about 0.3-0.4 (0.05 a second), `audioPhase` about 2.5 rad, `audioHarmAdvance`
  about 1.2 on the chord bed, `audioSwell` 0 -> 1 in the loud half and back to 0.1-0.3, the kick only in the loud half.
  In silence all of them stand. The generated scenes ran their clocks as `0.03 * audioAdvance + 0.03 * sceneTime`:
  the music carried about 5 % of the motion, the swell a size, the kick nothing. The hand-made ones flew and turned
  on `sceneTime + 0.4 * sceneAdvance` (2 %), and several were still lifes with the music only in the light
  ("Nothing moves but the light", KlimtGoldMosaic's header).
- *The machine's media session got into the measurement.* The app asks the system what it plays (`NowPlaying`) and
  weaves title, lyrics and artist into the picture -- in the video export too. The final set, measured once while a
  track played on this machine and once with `KALEIDO_NP_FAKE` (a scripted session that never names a track), read
  up to 0.19 apart in struct or sync; two runs with the scripted session agree to 0.0005. `Tools/screen.py` (and so
  `reactivity.py`) and `Tools/scene_snapshots.py` now set it themselves. The numbers of the decisions below are from
  clean runs; the second and third readings of the untouched scenes (`all124base`, `rest3`) may carry it -- a fourth,
  clean one (`rest_np`) differs from `rest3` by 0.075 react on average. When B1 ran is not known to me; if something
  played overnight, B1 carries it too.
- *Blind spots of the measure:* it looks at 160 x 90. Patterns finer than that (SphericalWaveCrossStitch's
  interference stitches, 2-6 px at 1080p) or a mask moving over a fixed photo (PaisleyBotehDrift's drops turned,
  their photo did not) hardly register. The mesh scenes need the model pack (`Models/`, not in the worktree): the
  seven of them were judged on the B1 sheets and the B1 value alone.

### How the music went in

- *The clock re-weighted:* the scene's own clock keeps 40-60 % of its rate, and an integrated music term is added
  that carries most of the motion while music plays -- e.g. `0.012 * sceneTime + 0.6 * sceneAdvance` for
  `0.03 * audioAdvance + 0.03 * sceneTime`: with music about the old speed, in silence a creep, never a stop.
  Positions and flights ride `sceneAdvance` (per activation, small, never jumps), turns and ripples `audioPhase`,
  changes that belong to the harmony `audioHarmAdvance`, sizes, depths and thresholds `audioSwell` (seconds), and the
  kick is light only -- on crests, rims, seams, top faces, glows, never on the frame.
- *Scenes with a state pass:* the swell scales the step of the integrator (AllenCahnCoarsening,
  DifferentialGrowthFolds, PhotoGapFingering): loud music drives the growth on, silence lets it rest -- a true
  integrator, not a speed multiplied into a clock.
- *Cameras stay on their clocks* where the scene is a view of an object: StarshipPlanetaryOrbit's planet turns on the
  music, the camera above it keeps `time`; FusorStarMode's cage turns, the eye does not. Flights that were already
  on `audioAdvance` moved to `sceneAdvance` with a larger share (ApollonianSpherePackingGasket, HistogramTerrainFlight,
  SupermassiveBlackHoleOrbit's orbit).
- *Found on the way:* VoronoiSpinBlur passed its clock to a function that never used it (the scene was a still photo
  with a swell-dependent blur); GongShimmerBloom's two nodal modes ran on `t` and `1.1 t`, so the hand-over at each
  wrap of the mode index jumped -- one clock now; FatouParabolicFlowers computed its harmony value and never used it;
  StarshipPlanetaryOrbit's cloud deck scaled its weather by `audioBass`, a fast signal on a spatial scale that makes
  the whole field shiver -- `audioSwell` now (OrbitalRingStation has the same line; its change was dropped, see
  below, so it is still there).
- *Generated scenes* were changed in `Tools/scenegen/src/<Name>.glsl` and rebuilt one by one
  (`gen.py <Name>`). Rebuilt unchanged, 19 of the 85 generated scenes of the list differ from their committed file
  (functions added to the libraries since -- famExpose() in the colour-family library, stCarry/stUV/stLod in the
  state library -- and "0..1" in knob comments); nine of them are among the changed ones (ChihulyPersianCeiling,
  DifferentialGrowthFolds, FatouParabolicFlowers, FusorStarMode, LoneStarQuilt, MoireReveal, OilCellKaleidoscope,
  PhytoplanktonSpirals, WaterRippleProjector) and carry that drift now: an uncalled famExpose() and comments, checked
  by rebuilding each one's base source with today's generator. No other scene was rebuilt.

### Decisions

124 scenes: **(a) 50** got the music into their structure; **(b) 26** are calm by nature and stay as they are, with
club, electronic and psytrance capped at 2 in `Tools/preset_fit.tsv` (ambient raised to 6 or space to 7 where needed);
**(c) 35** are weak and go to Allround only (every genre column capped at 2, interest unchanged); **13** read above
the threshold in both re-measurements and stay untouched.

**(a)** -- one set of all 50, measured at the base commit and with the change (both without the machine's media
session, see Open), each ranked against the B1 table (the other rows unchanged). Before: 0.002 .. 0.451, median
0.064, 20 below 0.050. After: 0.093 .. 0.979, median 0.447, none below; measured twice, the two runs agree to
0.0005.

| scene | int | B1 react | before: struct / sync / react | after: struct / sync / react | what the music does now |
|---|---|---|---|---|---|
| ApollonianSpherePackingGasket | 8 | 0.010 | 0.28 / 0.24 / 0.174 | 0.42 / 0.35 / 0.549 | flight on sceneAdvance; gem colours on audioPhase; kick on rims |
| KardashevTypeIIICity | 8 | 0.018 | 0.09 / 0.44 / 0.280 | 0.18 / 0.37 / 0.242 | turn and packets on sceneAdvance; the swell winds the arms and lights links |
| KlimtGoldMosaic | 8 | 0.018 | 0.25 / 0.38 / 0.333 | 0.44 / 0.41 / 0.686 | the light travels on sceneAdvance, spirals turn and eyes ripple on audioPhase |
| RooftopRainTokyo | 8 | 0.047 | 0.27 / 0.20 / 0.120 | 0.26 / 0.23 / 0.136 | rain, glyphs and clouds on sceneAdvance; swell lights windows; kick on the rain |
| StarshipPlanetaryOrbit | 8 | 0.015 | 0.11 / 0.13 / 0.016 | 0.24 / 0.35 / 0.275 | the planet turns on audioAdvance (the camera keeps its clock); swell scales weather |
| AllenCahnCoarsening | 7 | 0.016 | 0.31 / 0.21 / 0.175 | 0.37 / 0.30 / 0.371 | the swell paces the coarsening (state step); kick on the walls |
| AnorthoscopeSlitDistortion | 7 | 0.022 | 0.28 / 0.30 / 0.254 | 0.48 / 0.38 / 0.707 | the slits turn on sceneAdvance; kick on the slit picture |
| ChordColourTransitions | 7 | 0.032 | 0.22 / 0.06 / 0.013 | 0.27 / 0.28 / 0.209 | pairs wander on harmAdvance + sceneAdvance, ring turns; swell widens ribbons; kick |
| FiberOpticChandelier | 7 | 0.019 | 0.19 / 0.18 / 0.055 | 0.24 / 0.20 / 0.093 | pulses on sceneAdvance, the crown turns on audioPhase and fans with the swell |
| GongShimmerBloom | 7 | 0.049 | 0.23 / 0.39 / 0.324 | 0.35 / 0.27 / 0.304 | ripples on audioPhase, modes on harmAdvance (one clock for both modes now) |
| PaintPourCells | 7 | 0.020 | 0.24 / 0.05 / 0.015 | 0.75 / 0.10 / 0.600 | the flow on sceneAdvance, the swell stretches the paint |
| PrecessionStarRosette | 7 | 0.007 | 0.26 / 0.40 / 0.387 | 0.50 / 0.59 / 0.883 | stars run on sceneAdvance, centres on harmAdvance; kick on the stars |
| QamConstellationDust | 7 | 0.038 | 0.36 / 0.06 / 0.082 | 0.54 / 0.22 / 0.555 | lattice order on harmAdvance, scatter on the swell, turn on sceneAdvance; kick |
| RosslerFunnelDensity | 7 | 0.038 | 0.21 / 0.29 / 0.178 | 0.26 / 0.49 / 0.472 | c on harmAdvance, the turn on sceneAdvance, swell lifts the funnel; kick |
| RubensTubeFlameRow | 7 | 0.042 | 0.23 / 0.03 / 0.008 | 0.29 / 0.32 / 0.290 | the mode on harmAdvance + sceneAdvance; kick on the flames |
| SeigaihaWaveScales | 7 | 0.049 | 0.30 / 0.00 / 0.017 | 0.80 / 0.50 / 0.979 | the rows slide on sceneAdvance; kick on the ring lines |
| SphericalWaveCrossStitch | 7 | 0.011 | 0.25 / 0.00 / 0.003 | 0.29 / 0.34 / 0.325 | sources wander on sceneAdvance, separation on harmAdvance; kick on photo and stitches |
| StomataGuardCellMosaic | 7 | 0.023 | 0.22 / 0.16 / 0.049 | 0.53 / 0.24 / 0.577 | cells shift and the opening wave runs on sceneAdvance; kick on the rims |
| StreamgraphLayersFlow | 7 | 0.028 | 0.36 / 0.05 / 0.076 | 0.44 / 0.16 / 0.268 | the surge on sceneAdvance; kick on the crests |
| SupermassiveBlackHoleOrbit | 7 | 0.001 | 0.34 / 0.16 / 0.134 | 0.42 / 0.28 / 0.434 | orbit on sceneAdvance, disk flow on audioPhase, swell spreads the disk; kick |
| ChihulyPersianCeiling | 6 | 0.019 | 0.21 / 0.00 / 0.002 | 0.55 / 0.48 / 0.864 | light and layers drift on sceneAdvance; kick on the rims |
| DifferentialGrowthFolds | 6 | 0.004 | 0.19 / 0.08 / 0.011 | 0.31 / 0.54 / 0.609 | the swell paces the growth (state step); kick on the edges |
| FusorStarMode | 6 | 0.034 | 0.13 / 0.15 / 0.023 | 0.31 / 0.74 / 0.703 | the cage turns on sceneAdvance (the eye keeps its clock); kick on core and beams |
| HistogramTerrainFlight | 6 | 0.010 | 0.25 / 0.05 / 0.015 | 0.44 / 0.58 / 0.810 | flight on sceneAdvance; kick on lit slopes |
| PhytoplanktonSpirals | 6 | 0.050 | 0.27 / 0.06 / 0.023 | 0.57 / 0.16 / 0.473 | bloom wound and eddies wander on sceneAdvance, strengths on audioPhase |
| ThomsonProblemShells | 6 | 0.004 | 0.15 / 0.11 / 0.015 | 0.23 / 0.24 / 0.123 | shells turn on audioPhase and widen with the swell; kick on the glow |
| WaterRippleProjector | 6 | 0.031 | 0.31 / 0.37 / 0.400 | 0.56 / 0.53 / 0.905 | the discs turn on sceneAdvance; kick on the net |
| BayerMosaicMoire | 5 | 0.024 | 0.31 / 0.10 / 0.064 | 0.50 / 0.11 / 0.303 | the photo's zoom through the grid on sceneAdvance (the moire) |
| BraidWordLights | 5 | 0.029 | 0.28 / 0.30 / 0.262 | 0.29 / 0.42 / 0.447 | the plait runs on sceneAdvance; kick on the strands |
| ChloroplastRingStreaming | 5 | 0.034 | 0.35 / 0.29 / 0.351 | 0.51 / 0.45 / 0.814 | the streaming on sceneAdvance; kick on the plastids |
| CometTailStriaeFan | 5 | 0.003 | 0.15 / 0.05 / 0.004 | 0.15 / 0.36 / 0.220 | striae sweep on sceneAdvance, knots on audioPhase, swell opens the fan; kick |
| FatouParabolicFlowers | 5 | 0.040 | 0.30 / 0.04 / 0.026 | 0.35 / 0.22 / 0.234 | harmAdvance + sceneAdvance turn the parameter off the axis, zoom on sceneAdvance; kick |
| IntarsiaStepTiles | 5 | 0.030 | 0.32 / 0.30 / 0.316 | 0.36 / 0.33 / 0.425 | the cubes turn on sceneAdvance; kick on top faces and borders |
| KMeansPaletteVoronoi | 5 | 0.043 | 0.31 / 0.09 / 0.057 | 0.54 / 0.21 / 0.518 | centres wander on sceneAdvance; kick on the borders |
| KinetoscopePeepholeIris | 5 | 0.008 | 0.24 / 0.16 / 0.061 | 0.44 / 0.59 / 0.825 | eyepieces wander on sceneAdvance, swell sizes them; kick on the rims |
| LeafMarginSerrationWave | 5 | 0.005 | 0.22 / 0.03 / 0.006 | 0.29 / 0.37 / 0.360 | leaves sway (photo turns with them) and teeth run on sceneAdvance, swell; kick |
| LimpetShellGrowthLines | 5 | 0.028 | 0.34 / 0.23 / 0.239 | 0.41 / 0.24 / 0.366 | the growth bands run out on sceneAdvance; kick on the lines |
| LoneStarQuilt | 5 | 0.013 | 0.25 / 0.05 / 0.017 | 0.34 / 0.55 / 0.655 | the shading rings flow on sceneAdvance; kick on the seams |
| MedialAxisSkeletonBloom | 5 | 0.003 | 0.20 / 0.07 / 0.010 | 0.33 / 0.14 / 0.106 | the threshold wanders on audioPhase and the swell; kick on the skeletons |
| MigmatiteSwirlBands | 5 | 0.047 | 0.37 / 0.03 / 0.061 | 0.52 / 0.06 / 0.254 | flow and band slide on sceneAdvance |
| MoireReveal | 5 | 0.048 | 0.32 / 0.00 / 0.019 | 0.44 / 0.00 / 0.102 | the reveal band runs on sceneAdvance |
| OilCellKaleidoscope | 5 | 0.017 | 0.30 / 0.10 / 0.060 | 0.40 / 0.18 / 0.231 | the fall on sceneAdvance |
| PhotoGapFingering | 5 | 0.027 | 0.41 / 0.13 / 0.202 | 0.40 / 0.77 / 0.826 | the swell paces the fingers (state step); kick on the rims |
| PickoverStalksField | 5 | 0.046 | 0.32 / 0.25 / 0.237 | 0.34 / 0.23 / 0.215 | the Julia constant wanders on sceneAdvance |
| PivotChordModulationBridge | 5 | 0.031 | 0.35 / 0.18 / 0.178 | 0.37 / 0.18 / 0.188 | the bridge wanders on harmAdvance |
| RetinexIlluminantShiftRecovery | 5 | 0.037 | 0.35 / 0.36 / 0.451 | 0.45 / 0.37 / 0.651 | light colour on harmAdvance, the border on sceneAdvance |
| SchenkerNestedSlurArcs | 5 | 0.039 | 0.28 / 0.09 / 0.038 | 0.54 / 0.38 / 0.774 | the slide on harmAdvance + sceneAdvance; kick on the arcs |
| StandardMapIslands | 5 | 0.041 | 0.41 / 0.00 / 0.083 | 0.51 / 0.00 / 0.174 | the portrait slides on audioPhase |
| VenusYShapedCloudBands | 5 | 0.026 | 0.25 / 0.37 / 0.323 | 0.52 / 0.55 / 0.878 | the bands run on sceneAdvance; kick on the bright bands |
| VoronoiSpinBlur | 5 | 0.011 | 0.35 / 0.07 / 0.073 | 0.70 / 0.06 / 0.467 | cells swing round their pivots on audioPhase (the clock was unused) |

Six of the 50 gained less than 0.05 in this set although their struct rose (or held) -- the change the music adds
now runs through the quiet half too, and the share of it that follows the onsets fell: KardashevTypeIIICity (0.280
-> 0.242, struct 0.09 -> 0.18), GongShimmerBloom (0.324 -> 0.304, struct 0.23 -> 0.35), PickoverStalksField (0.237
-> 0.215), RooftopRainTokyo, FiberOpticChandelier and PivotChordModulationBridge (+0.01 to +0.04). These are the
first to look at with the eye (B6).

In a second clean set of 84 names (the 50 and 34 untouched ones, so every scene at another place and with other
rolls) all 50 read above 0.050 as well: 0.066 .. 0.984, median 0.431.

**(b) calm by nature, 26** -- in brackets: interest; react in B1 / the second / the third reading (the mesh scenes
only B1); genres before -> after (Amb Ambient, Space SpaceAmbient, Down Downtempo, Cine Cinematic, Psych
Psychedelic). Staged views of the sky and of still places, slow flows and soft photo looks: the music's place there
is the light, and the genres that play them are calm. 23 sit in Ambient and/or SpaceAmbient; three dark staged
scenes (MezzotintBurnishedGlow, MeshFoundryPour, ShatterSculpture) keep Noir/Cinematic, their calm homes.

AlienPlanetOrbit (5; 0.002 / 0.000 / 0.001; Space,Cine); AlienWorldSurface (6; 0.013 / 0.008 / 0.010;
Amb,Space,Cine); AnglerfishAbyss (5; 0.036; Noir -> Amb,Noir); CenoteLightShaft (6; 0.013 / 0.006 / 0.186;
Amb,Cine,Noir); DolomitesAlpenglow (7; 0.048 / 0.099 / 0.122; Amb,Cine); EInkParticleDrift (5; 0.047 / 0.015 / 0.354;
Amb,Down,Cine); Fleet (6; 0.040; Space,Noir); FrozenMethaneLakes (6; 0.007 / 0.010 / 0.099; Amb,Space,Cine);
HeliosSwirlBokeh (5; 0.035 / 0.159 / 0.017; Amb,Down,Cine); LensBlurGhostBokeh (4; 0.029 / 0.119 / 0.163; Amb);
MeshFoundryPour (5; 0.023; Noir); MeshWindChime (4; 0.001; Amb); MezzotintBurnishedGlow (5; 0.040 / 0.112 / 0.025;
Cine,Noir); NebulaCliffs (7; 0.006 / 0.186 / 0.052; Amb,Space,Cine); OrbitalRingStation (7; 0.032 / 0.013 / 0.108;
Amb,Space,Cine); OrbitalSunrise (6; 0.008 / 0.000 / 0.000; Amb,Space,Cine); PlumeCapRollups (5; 0.030 / 0.125 /
0.212; Amb,Down,Cine,Psych); ReverseKarmanWake (5; 0.049 / 0.014 / 0.033; Amb,Down,Cine,Psych); ShatterSculpture (6;
0.016; Cine,Noir); SilenceSnowfallHush (5; 0.044 / 0.187 / 0.055; Amb,Cine); SolarEclipseTotality (7; 0.006 / 0.500
/ 0.005; Amb,Space,Cine,Noir); SupernovaRemnant (4; 0.015 / 0.097 / 0.221; Space); TidalDisruptionEvent (4; 0.000 /
0.036 / 0.004; Space,Noir); TidalRaceEddies (5; 0.038 / 0.135 / 0.030; Amb,Down,Cine,Psych); UnderIceLookingUp (7;
0.021 / 0.245 / 0.048; Amb,Cine); VoidLeviathan (5; 0.044 / 0.086 / 0.022; Space,Noir).

The fit caps changed few memberships today (none of them was in Club, Electronic or Psytrance; AnglerfishAbyss
joins Ambient), but they keep the loud genres from filling up with them when their sizes change.

**(c) weak, 35** -- Allround only. Flat or murky pictures (MorphologicalBreath, BilateralDreamGrid,
PhotoMeanShiftBlooms, RotoscopeLineBoil -- its line boil is a few pixels), staged objects that fail the origin
criteria (EscherRelativityMatrix, AntimatterWeapon, MeshHeliostatField,
MeshSeismograph), sparse dots or lines on black (HeliozoanRaySpheres, HenonOrbitDust, KeySpiralArray,
SubdivisionDotLadder, TaylorConeJetField), and the 14 rated 3, which DULL = 3 already keeps out of the genres -- their
fits are now capped too, so that they stay out if DULL goes back to 2.

AntTrailStigmergyField (3; 0.042 / 0.258 / 0.373); AntimatterWeapon (5; 0.012 / 0.011 / 0.025; Space,Noir);
BeadsOnSpinningHoops (4; 0.020 / 0.017 / 0.439; Elec); BilateralDreamGrid (4; 0.026 / 0.012 / 0.025; Amb);
BrownianTreeRain (3; 0.017 / 0.064 / 0.087); CheckerShadowSweep (4; 0.015 / 0.059 / 0.015; Amb,Down);
CloudChamberField (3; 0.025 / 0.295 / 0.050); CupCausticEnvelopes (4; 0.014 / 0.017 / 0.019; Elec,Noir);
DotMatrixPrinterPass (3; 0.032 / 0.046 / 0.066); EscherRelativityMatrix (6; 0.035 / 0.003 / 0.059; Amb);
ForaminiferaSpiralShells (3; 0.014 / 0.009 / 0.187); GammaRayBurst (4; 0.046 / 0.153 / 0.037; Space,Club);
GeisslerTubeSpirals (4; 0.025 / 0.091 / 0.011; Club,Elec); HarmonicOscillatorCoherent (4; 0.002 / 0.005 / 0.063;
Noir); HeliozoanRaySpheres (4; 0.009 / 0.007 / 0.005; Elec,Psy); HenonOrbitDust (4; 0.012 / 0.005 / 0.013;
Down,Noir); JukeboxBubbleTubes (3; 0.045 / 0.040 / 0.137); KeySpiralArray (5; 0.005 / 0.010 / 0.012; Space,Noir);
KintsugiGoldSeams (3; 0.033 / 0.492 / 0.140); LiquidMetal (3; 0.034 / 0.189 / 0.020); MeshHeliostatField (5; 0.008;
Amb); MeshSeismograph (3; 0.004); MorphologicalBreath (3; 0.021 / 0.004 / 0.006); PhaseFieldCrystalGrains (5; 0.021
/ 0.015 / 0.120; Amb); PhotoColourSpaceCloud (4; 0.000 / 0.006 / 0.205; Space,Noir); PhotoMeanShiftBlooms (4; 0.025
/ 0.008 / 0.051; Amb,Psych); PillarsOfCreationFlight (3; 0.036 / 0.009 / 0.075); QuillingCoils (4; 0.017 / 0.007 /
0.011; Amb,Down); RichtmyerMeshkovSpikes (4; 0.037 / 0.039 / 0.448; Club,Noir); RoguePlanet (3; 0.002 / 0.011 /
0.175); RotoscopeLineBoil (5; 0.036 / 0.258 / 0.024; Noir); SubdivisionDotLadder (4; 0.023 / 0.043 / 0.193;
Elec,Noir); TaylorConeJetField (5; 0.027 / 0.027 / 0.346; Elec,Noir); TurrellGanzfeld (3; 0.006 / 0.051 / 0.032);
WireworldCircuitry (3; 0.009 / 0.002 / 0.004). The genres named are the ones they left.

**Untouched, 13** -- above 0.050 in both re-measurements (median of the three 0.072 .. 0.647), so B1's value was the
measure's position, not the scene: ColorTransferTide, ExcitablePhotoRefraction, IridescentGradientBlob,
MargolusBilliardGas, MiuraFoldField, MudclothBogolanBars, MutualDisplacement, NighthawksDiner, PaisleyBotehDrift,
PixelBinningMosaic, PollenTubeGrowthTips, ReactionFrontsOnPhotoRelief, TidalFlatChannels. In the fourth, clean reading
11 of them stayed above; MudclothBogolanBars (0.019) and NighthawksDiner (0.032) fell below -- borderline scenes
(median of four 0.07 and 0.08), left as they are. Of the (b) scenes 9 of 21 measurable read below 0.05 in that run,
of the (c) scenes 15 of 33.

Genre sizes after `python Tools/make_genre_configs.py`: Ambient 847 -> 841, Downtempo 456 -> 453, Club 693 -> 690,
Electronic 575 -> 569, Psytrance 645 -> 644, Psychedelic 1005 -> 1004, Noir 519 -> 509; SpaceAmbient 461, Cinematic
446 and Allround 2690 unchanged in size. The generator rescales every preset's solo times to its mean of 55 s, so the
preset diff touches most entries by a second or two.

### Tried and dropped

- *TaylorConeJetField:* a wave of field strength along the rows and the jets on `audioPhase` -- 0.015 -> 0.039 in its
  set, struct 0.26 -> 0.28; the cones are small and the picture stays the dimmed photo. Reverted, (c).
- *PaisleyBotehDrift:* the tilt wave on `sceneAdvance`, then the photo inside each drop turned with it -- 0.004 ->
  0.012, the two thumbnails differ by 5.7 / 255 on average; the drops cover too little and turn too little to read
  at 160 x 90. Reverted; untouched (it re-measured 0.102 and 0.163).
- *OrbitalRingStation:* planet and ring on `audioAdvance` -- struct 0.09 -> 0.14, sync 0.23 -> 0.06, react 0.069 ->
  0.005 in its set. Reverted, (b).
- *First passes too weak* (these runs may have carried the media session): in the final set seven changed scenes
  still read below 0.05 (ThomsonProblemShells,
  SphericalWaveCrossStitch, StarshipPlanetaryOrbit, ChordColourTransitions, LeafMarginSerrationWave,
  FatouParabolicFlowers, HistogramTerrainFlight) after reading above in their batch sets. A second pass gave them more
  structure (a larger music share, the swell on a size, the leaf's photo turning with the leaf) and kick light on a
  larger area; ChordColourTransitions, SphericalWaveCrossStitch and FatouParabolicFlowers needed a third (kick light
  on the photo behind, 12-25 %). LeafMarginSerrationWave, VoronoiSpinBlur, MedialAxisSkeletonBloom and
  StomataGuardCellMosaic needed a second pass in their batch sets already (the first moved outlines or a threshold
  too little to register). After the switch to clean runs: MedialAxisSkeletonBloom (0.051) got the kick on its shapes
  as well (0.106); IntarsiaStepTiles and RetinexIlluminantShiftRecovery, below 0.05 in the clean second set (sync 0
  there), a faster turn and a faster border (final set 0.425 and 0.651).
- *A probe in grey levels:* the uniforms drawn as grey stripes came back distorted by the exposure; drawn as bars,
  the heights survive (`sceneTime` as a control: 0.1 a second, exact in the silent run).

### Checks

- `python Tools/temporal_budget.py`: 0 errors, the same 4 warnings as at the base (none in a changed scene).
- `python Tools/shake_scan.py --summary --baseline Tools/shake_baseline.tsv`: 0 new SHAKE/FRAME/STEP hits, 74 known.
- `python Tools/shadercheck.py` (static rules and the real compile of all 3221 files): 0 errors, 0 warnings.
- `python Tools/doc_shaders.py --check`: 0 files would change; `python Tools/cgvr_format.py --check`: 3510 files
  the same (the hand-written changes formatted with `cgvr_format.py <files>`, the generated ones by `gen.py`).
- `PresetEditor --roundtrip` of all 12 preset files: ok; `PresetEditor --validate`: all 11 files complete against
  Komplett.xml; `python Tools/check_schedule.py --quick`: 20 plans, 0 with violations.
- Added lines grepped for `floor(audio`, `step(.., audio`, a clock multiplied by a clamped envelope: none (a bounded
  `sin(..) * swell` amplitude in LeafMarginSerrationWave is the allowed form).
- Snapshots: `python Tools/scene_snapshots.py render 2026-11-20-b2 --only <the 50> --photo
  kristallhoehle-indigo-fuchsia-2.jpg` (silent, frozen at 600 fixed steps, the baseline's photo), compared with the
  baseline of `Tools/snapshot_baseline.txt` (2026-11-10-all): 50 compared, 48 changed beyond the tolerance -- as
  intended: the silent frame now stands where the slower silent clock leaves it -- 2 within it (AllenCahnCoarsening,
  PhotoGapFingering: their state passes settle to nearly the same frame), 0 black, 0 newly black, 0 unstable; report
  `report_vs_2026-11-10-all.html` in the set. The darkest new frames are ThomsonProblemShells (mean 6.0 / 255) and
  ApollonianSpherePackingGasket (7.6), whose silent camera now stands elsewhere in the foam.
  `Tools/snapshot_baseline.txt` stays as it is (the new set holds only the 50).

### Open

- *The measure's position noise.* A scene's react depends on its place in the set (rolls, the analyser's state,
  encoder noise when nothing reacts): one reading decides little near the threshold. Measuring every scene in two
  places (two seeds or two orders) and taking the lower would make B1's bottom list sharper; the cost doubles.
- *The mesh scenes* were not re-measured (no model pack in the worktree); their decisions rest on the B1 sheet and
  one reading.
- *The eye.* The changes were checked on 160 x 90 thumbnails and in the snapshot set; whether the faster motion under
  loud music feels right (ChordColourTransitions' ribbons, SeigaihaWaveScales' rows, PaintPourCells' stretching)
  wants the user's look, best in the B6 rating round. Kick light was added to 34 of the 50, mostly on crests, rims,
  seams and glows; on a larger area in five (the leaves of LeafMarginSerrationWave +25 %, the dust of
  QamConstellationDust +22 %, the dim photo behind in ChordColourTransitions, SphericalWaveCrossStitch and
  FatouParabolicFlowers); `temporal_budget.py` sees no full-field flash above its limits, but the eye should judge
  those five first.
- *OrbitalRingStation* still scales its cloud deck by `audioBass` (a fast signal on a spatial scale); the fix went
  with the dropped change. One line (`sc = 3.4 * ( 1.0 + 0.12 * audioBass )` -> `audioSwell`).
- *Snapshots and the now-playing title:* `scene_snapshots.py` runs the app live, and the app's title reveal
  (`NowPlaying`, the system's media session) wove whatever the machine was playing into about half of the first
  B2 snapshot frames. The set was rendered again with `KALEIDO_NP_FAKE="none|none@999999"` (a scripted session that
  never names a track, so the real one is not asked). The tool should set that itself (or `nowPlaying=false` in its
  private settings); older sets were made while nothing played. The video export (`reactivity.py`, `screen.py`)
  showed no title in the B2 thumbnails.
