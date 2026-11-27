### P2 -- the tension arc through the depth (27.11.2026)

Plan P2 (docs/PLAN_2026-11-27.md), agent "p2", branch `wt-p2` from b9ea6a83.  The five depth effects get a knob
`arcP` each: in a build-up the depth tightens -- a haze grows from the back, the aperture opens around the focus, the
shafts narrow toward their light, the rim thins, the ambient light withdraws from the back -- and a drop clears it all
within half a second, the shafts and the rim breaking through.  `arcP` 0 is the old picture, bit for bit; the presets
roll it from -0.3 to 1 (off in 23 % of the activations).

| step | what | result |
|---|---|---|
| shaders | the arc in FxDepthFog, FxDepthField, FxSunShafts, FxRimLight, FxAmbientOcclusion | knob 0: 10 of 10 exports with music and 10 of 10 frozen frames identical to the old shaders |
| acceptance | three cue demos, one drop each, far half's brightness (detail for the depth of field) | far half follows the build-up (corr -0.4..-0.98 where the signal builds) and turns 0.25-0.48 s after the hit; no flash count higher |
| presets | `arcP` -0.3..1 in the five Komplett entries, genre presets regenerated | 5 entries + 31 lines in eight genre presets; roundtrip, validate, check_schedule (20 plans) green |

#### What was there

- None of the five effects read the build-up or the drop (a grep for `audioBuildUp|audioDrop` over the five files found
  nothing; before this change 93 shader files read `audioBuildUp`, 64 `audioDrop`).  They read the level, the kick,
  the sub-bass, the beat, the ambient share and the chroma hue.
- The two signals as the effects get them (`audioFx`, Source/AudioConditioner.cpp): `audioBuildUp` = the analyser's
  build-up evidence (onset density, centroid sweep, level swell, snare rolls), ~0.5 s rise, ~1.2 s fall, times the
  music gate.  `audioDrop` = max( drop pulse, DJ-stop slam ) times the gate: 1 at the hit, then x0.985 per analysis
  block -- exp( -t / 0.72 s ) at 44.1 kHz; with score cues RenderPipeline's own pulse, exp( -t / 0.66 s ); a forced
  drop (KALEIDO_FORCE_DROP) exp( -t / 0.5 s ).
- The final pass's held breath (`breath`, Engine/Present.frag; its value from AudioConditioner.cpp): target
  clamp( ( buildUp - 0.5 ) x 2.2, 0, 1 ) x gate, slewed at 2.5/s; it desaturates (0.38), dims (0.13) and closes a
  vignette (0.5) over the whole frame.  Its target follows the build-up only: it lets go as the build-up falls (~1.2 s
  and more), not at the drop.
- *How well the build-up signal marks a build* (the analyser's feature files of the cue bench, .screen/cuebench of the
  main checkout; mean / max of `buildup` per cue section): goa -- Groove 0.59 / 0.84, Build 1 0.40 / 0.62, Build 2 0.62
  / 0.81; uplifting -- Groove 0.28 / 0.38, Build 0.11 / 0.34 (!), Drop 0.38 / 0.64; ostgut -- Groove 0.25 / 0.28, Break
  0.59 / 0.75, Build 0.49 / 0.69, Drop 0.28 / 0.38.  The signal is high in ostgut's break-and-build, misses uplifting's
  build entirely and is higher in goa's groove than in its first build.  The arc follows the signal it gets; better
  build-ups are the analyser's (agent "analyzer").  The drops themselves are found: goa 79.50 s (cue 79.45), uplifting
  194.85 (194.78), ostgut 181.45 (181.42) -- and in the exports below at the same places (+0.04..+0.07 s).

#### The design

*One function in all five files* (no include: the same text in each; the FX are hand-written, no generator):

    vec2 tensionArc()
    {
        float clear = ( 1.0 - smoothstep( 0.45, 0.8, audioDrop ) ) * smoothstep( 0.0005, 0.03, audioDrop );
        return vec2( smoothstep( 0.3, 0.7, audioBuildUp ) * ( 1.0 - clear ), clear );
    }

- *The clearing is an envelope built in the shader, never the pulse.*  A shader has no memory, but the pulse has a
  known shape: it jumps to 1 and decays exponentially, so its value says how long ago the hit was.  The envelope is a
  function of that value: 0 at the hit (pulse 1), rising between pulse 0.8 and 0.45, 1 down to pulse 0.03, back to 0 at
  0.0005.  In time (tau 0.72 s): 10 % at 0.25 s, 50 % at 0.35 s, 90 % at 0.50 s after the hit, above 90 % until 2.7 s,
  below 10 % from 3.7 s, 0 from 5.5 s (score cues, tau 0.66: 0.25 / 0.35 / 0.45 s; a forced drop, 0.5: 0.20 / 0.25 /
  0.35 s).  At most 0.032 per frame at 120 Hz.  The jump of the pulse from 0 to 1 maps 0 to 0: the hit itself is no
  step.  The next drop comes >= 8 s later (the analyser's cooldown), after the envelope ended.  Where the gate is
  below 0.8 at the hit the pulse starts below 0.8 and the envelope starts part-way up (gate 0.7: 26 %) -- the gate is
  the music's presence, ~1 at a drop.
- *The tension* is smoothstep( 0.3, 0.7, buildUp ) times ( 1 - clear ): the drop releases it at once, whatever the
  build-up signal does afterwards (it falls with ~1.2 s, and in goa it stays near 0.45 for seconds).
- *The coordination with the breath* ("beide abstimmen, nicht doppeln").  The breath is global: colour, light,
  vignette.  The arc is depth-local and never dims or desaturates the whole frame: the fog's haze is a pale veil (air
  and sun colour without the kick, which would make it pulse), the shafts and the rim lose some of their own light, the
  occlusion takes light from the back.  The arc starts earlier (0.3) and is full at 0.7, where the breath is at 0.44;
  it clears at the drop, the breath follows the build-up's fall.  The one part of the arc that darkens a region, the
  occlusion's withdrawal, gives up to half of itself where the breath's target rises (x ( 1 - 0.5 clamp( ( buildUp -
  0.5 ) x 2.2, 0, 1 ) )), so the two do not stack in the far corners.  The breath itself is not changed (see "for the
  user").
- *Farness* (fog, occlusion): log( z / 4 ) / log( 15 ), clamped -- 0 at 4 units, 1 at 60 and beyond (the sky).  On a
  photo (depth 8..80 units, linear in inverse distance) the same formula gives 0.26 at its near end, 0.48 in the
  middle, 1 at its far end: no extra uniform.  The fog's front walks from farness 1 (no tension) to 0.25 in a room and
  to 0.45 on a photo (its subject stays in front), over a soft edge of +-0.2.
- *Photos* get PhotoArc = 0.6 of the arc in every effect (the effects are quieter on a photo already).
- *Knob 0 is the old code path.*  Every new line sits behind `if ( arcP > 0.0 )` -- a uniform branch, so FxAmbient-
  Occlusion's dFdx/dFdy stay out of pixel-dependent branches; the old expressions are untouched (FxDepthField's two
  blur calls moved into an else branch word for word; FxDepthFog keeps the sun colour before the kick in a new local).

*Per effect* (T tension, C clearing, s = arcP x (PhotoArc on a photo)):

| effect | build-up | drop |
|---|---|---|
| FxDepthFog | a haze behind the front, 0.7 T of the pale haze colour | the haze goes with T; the usual fog's extinction x ( 1 - 0.6 C s ) |
| FxDepthField | aperture x ( 1 + 1.5 T s ); a photo's largest blur x ( 1 + 0.5 T s ) | aperture x ( 1 - 0.8 C s ): sharp |
| FxSunShafts | openness^( 1 + 0.8 T s ) (only the most open paths: narrower beams), falloff from the light x exp( -2.5 T s dl ) | falloff x exp( +0.6 C s dl ) (wider), x ( 1 + 0.9 C s ) (brighter) |
| FxRimLight | sharpness toward 1 by 0.6 T s (thin outline), the light x ( 1 - 0.3 T s ), its kick pulse held back to 1 - 0.6 T s of itself | sharpness x ( 1 - 0.2 C s ) (a little wider), the light x ( 1 + 0.4 C s ) |
| FxAmbientOcclusion | occlusion x ( 1 + 0.8 T s ), plus 0.35 x a withdrawal behind the fog's front toward the cool shadow colour | occlusion x ( 1 - 0.8 C s ) |

#### Measured

*The tool.*  `Tools/depth_arc.py` renders one scene with one effect over a stretch of a demo (75, 65 and 72 s, the drop
45-65 s in -- the analyser arms drops after 30 s and keeps the groove of the last 45 s) as a video export (960 x 540,
60 fps, KALEIDO_SEED 7, the snapshot photo kristallhoehle-indigo-fuchsia-2, which has a map; the user's settings in a
private copy; 16-bit intermediates as by default).  A third run of the same scene with FxPlain (its entry carrying the
effect's float lines, so the scene rolls the same) and KALEIDO_SHOW_DEPTH=1 gives each frame's depth: the far half is
every pixel at or beyond the frame's median depth.  Per frame it measures the far half's mean linear luminance, the
near half's, and the far half's detail (mean |Laplacian| of the luma), plus the build-up and drop pulse the app saw
(KALEIDO_FEATURE_LOG).  The change is arcP 1 against arcP 0, smoothed over 0.2 s, relative to arcP 0.  The music is
cut into .screen/p2arc and stays there.  Scenes: PillarHall (a 3D hall, its far half the corridor's end) on all three
demos, FoldLab (a lab passing the photo's depth on) on goa.  Each export took 9-38 s (the machine was shared).

Two traps of the tool: an effect's rolls are seeded with its file path, so the first "old shader" run from a copy in
another folder rolled differently and all 4500 frames differed -- the old shader now runs from the effect's own path
(the new file put back after the run, and committed before).  And a drop cuts to a new scene; with one scene in the
preset that is the same scene again (re-rolled), in both runs -- the change (1 against 0) is not affected, the raw
curves jump there.

*Knob 0, bit for bit.*  The old shaders (b9ea6a83) against the new ones at arcP 0: 10 of 10 exports identical (goa,
PillarHall and FoldLab x the five effects, 4500 frames each, the MD5 of every decoded frame; NVENC is deterministic
for identical input) and 10 of 10 frozen frames (Tools/scene_snapshots.py's shot, silent, the preset entry without
arcP: max difference 0).

*The arc over three drops* (sheets `p2_curve_<effect>.jpg`: per panel the measure at arcP 0 and 1 above, the relative
change, the build-up and the drop pulse below).  Each cell: correlation of the change with the build-up over the 30 s
before the hit / its extreme in the 6 s before the hit / its mean 0.5..1.5 s after the hit / when it has gone half the
way from before to after, after the hit.  The far half's linear luminance unless the column says otherwise (for the
depth of field the far half's detail, |Laplacian|; the fog both).

| effect | measure | goa, PillarHall | uplifting, PillarHall | ostgut, PillarHall | goa, FoldLab (photo) |
|---|---|---|---|---|---|
| FxDepthFog | far | -0.40 / -13 % / -1 % / 0.48 s | +0.57 / -0 % / -5 % / 0.35 s | -0.68 / +2 % / -8 % / 0.32 s | +0.64 / +69 % / -7 % / 0.37 s |
| FxDepthFog | detail | -0.77 / -25 % / -1 % / 0.37 s | +0.30 / -0 % / -1 % / 0.32 s | -0.94 / -2 % / -2 % / 0.45 s | -0.83 / -24 % / +2 % / 0.25 s |
| FxDepthField | detail | -0.97 / -10 % / +50 % / 0.42 s | -0.62 / -0 % / +48 % / 0.40 s | -0.87 / -7 % / +51 % / 0.38 s | -0.98 / -17 % / +2 % / 0.35 s |
| FxSunShafts | far | -0.41 / -6 % / +31 % / 0.43 s | -0.53 / +0 % / +45 % / 0.33 s | -0.83 / -11 % / +56 % / 0.37 s | -0.90 / -50 % / +57 % / 0.37 s |
| FxRimLight | far | -0.83 / -28 % / +67 % / 0.33 s | -0.40 / +0 % / +44 % / 0.35 s | -0.60 / -11 % / +33 % / 0.37 s | -0.80 / -25 % / +32 % / 0.33 s |
| FxRimLight | near | -0.35 / -21 % / +106 % / 0.40 s | +0.24 / +0 % / +46 % / 0.37 s | -0.66 / +16 % / +86 % / 0.40 s | -0.42 / -10 % / +12 % / 0.32 s |
| FxAmbientOcclusion | far | -0.74 / -35 % / +12 % / 0.30 s | -0.04 / +0 % / +20 % / 0.33 s | -0.87 / +3 % / +11 % / 0.33 s | -0.81 / -10 % / +3 % / 0.37 s |

How to read it:

- *Follows the build-up.*  Where the signal builds (goa before its drop, ostgut's break and build, goa's photo) the
  change goes with it: correlations -0.4..-0.98 -- the haze takes the far half's detail (-25 %), the aperture its
  sharpness (-10..-17 %), the narrowed shafts and the thinner rim its light (-6..-50 %, -11..-28 %), the withdrawal
  its light (-35 %).  The fog's luminance goes either way: the pale haze is darker than the hall's lit corridor end
  (-13 %) and much brighter than the photo's dark crevices (+69 %).  Uplifting has no build-up before its drop (the
  analyser's 0.11 in the cue build), so nothing happens before it -- and its positive correlations come from a
  build-up rising AFTER the drop (to 0.64 at +8 s), where the arc tightens again once the clearing has ended.  In
  ostgut the arc acts in the break (build-up 0.6..0.75 from -25 to -12 s; the sheet shows it) and the build-up has
  fallen to 0.3 by the drop, so the 6-s extreme is small.
- *Jumps at the drop.*  Every effect turns within half a second of the analyser's hit (half-way at 0.25..0.48 s; the
  hit itself 0.00..0.04 s after the cue): the depth of field sharpens the far half by about half (+48..+51 %), the
  shafts break through (+31..+57 %), the rim flares (+32..+67 %), the occlusion lifts (+3..+20 %), the fog clears
  and thins below its usual air (-1..-8 % luminance, the haze gone).  On the photo the depth of field's release is
  small (+2 %): PhotoArc and the photo's blur cap keep it a hint.  The release holds about 2.6 s and fades out by
  5.5 s; where the build-up signal is still high then (uplifting rises to 0.64 after its drop), the arc tightens
  again.
- The drop is also where the analyser goes quiet before the hit (goa: build-up 0.61 at -1.5 s, 0.46 at the hit), so
  part of the release starts before the drop; the envelope then does the rest.

*Flashes* (Tools/flash_count.py's count on each 60-fps export -- WCAG pairs of >= 0.1 changes in linear luminance,
the worst second of the nine quarter windows; arcP 0 -> 1): goa PillarHall 0.5 -> 0.5 (fog), 1.0 -> 1.0 (field),
1.0 -> 1.0 (shafts), 1.0 -> 1.0 (rim), 0.5 -> 0.5 (occlusion); uplifting 0.5 -> 0.5, 0.5 -> 0.5, 0.5 -> 0.5, 1.0 ->
1.0, 0.5 -> 0.5; ostgut 0.5 -> 0.5, 0.5 -> 0.5, 0.5 -> 0.5, 1.5 -> 1.0, 0.5 -> 0.5; goa FoldLab 0.5 -> 0.0, 0.0
-> 0.0, 0.5 -> 0.5, 0.5 -> 0.5, 0.0 -> 0.0.  The mean luminance of the exports moves by -0.0003..-0.006 (the shafts
are narrower most of the time).  No count is higher; ostgut's rim and goa's photo with fog are lower.  The rim took
two retunes to get there (see "tried and dropped"): ostgut's hall pulses with the kick at 1.5 flashes a second in
one quarter window by itself, and the first two rims tipped it to 2.0 seven seconds before the drop.

*Frames and clips* (C:\Users\Rene\Desktop\kaleido-wt\sheets\p2\): `p2_frames_<effect>_goa.jpg` (PillarHall and
FoldLab, arcP 0 above 1, at -20, -6, -1, +0.25, +0.6, +2, +5 s from the drop), `_ostgut.jpg` (PillarHall);
`p2_clip_<effect>_goa.mp4` -- 26 s over goa's drop (20 s before, 6 after) with the music, 2 x 2: PillarHall arcP 0 |
1 above, FoldLab arcP 0 | 1 below.  Looked at: the haze is a pale veil at the hall's far end and in the photo's
crevices before the drop, gone at +0.25 s; the shafts are a narrow glow at the corridor's end and break through
wide and orange at +0.6 s.

#### Presets

The user's rule of 27.11. (new looks are switched on, the old picture stays one outcome): each of the five entries in
Presets/Komplett.xml got `<float name="arcP" minValue="-0.3" maxValue="1.0"></float>` as its last line -- rolled per
activation; at or below 0 (23 % of the activations) the effect is the old one bit for bit, above it the arc runs at
that strength.  `python Tools/make_genre_configs.py` added the same line to the genre presets that carry the effects
(31 lines in Allround, Ambient, Cinematic, Club, Downtempo, Electronic, Noir, SpaceAmbient; Psytrance and Psychedelic
have none of the five); nothing else changed in them.  As with every added knob, the new line moves the rolls of what
the scheduler rolls after it (section (69), T4).

#### Checks

- `Tools/shadercheck.py --new b9ea6a83` (the five files, compiled by the driver): 0 errors, 0 warnings, after every
  change (last run with the rim's retune).
- `Tools/temporal_budget.py`: 0 errors, 4 warnings; `Tools/shake_scan.py --summary --baseline`: 0 new hits, 74 known
  -- both exactly as on b9ea6a83 (the arc has no oscillation of its own: its drivers are the smoothed build-up and the
  envelope, both slower than 3 Hz -- the envelope's steepest step is 0.032 of its range per frame at 120 Hz).
- `Tools/doc_shaders.py --check` and `Tools/cgvr_format.py --check`: nothing to change; `Tools/check_strings.py` OK (no
  new strings).
- Presets: `PresetEditor --roundtrip` of every preset file, all load and save (Komplett 2,930 entries);
  `PresetEditor --validate`: all 12 files complete against Komplett.xml (a first run listed the frozen test's leftover
  `_snap0.xml`; depth_arc.py removes it now); `Tools/check_schedule.py --quick`: 20 plans, 0 violations.

#### Tried and dropped

- *The first tuning* (tension over build-up 0.35..0.8, the fog's front from beyond the far end to farness 0.45): on
  goa the build-up stays at 0.4..0.6, so the tension was 0.1..0.5 and the front never reached the hall's far half
  (median distance ~15-20 units, farness ~0.55): the far half's luminance moved by 0.5 %.  Now 0.3..0.7 and a front
  to 0.25.
- *The first clearing* held to 1.6 s and was gone by 4 s: on goa the build-up stays near 0.45 for seconds after the
  drop, so the shafts narrowed again at +2..3 s -- a burst of +31 % followed by a dip of -30 % within two seconds.  Now
  it holds to 2.6 s and is gone by 5.5 s, when the build-up has fallen (goa: 0.36 at +4 s).
- *The first rim flare* (the rim light x2 and its sharpness x0.5 at the drop): the far half +109..+211 %, the near
  half +290..+705 % for two seconds -- a glare, not a release.  Now x1.4 and sharpness x0.8 (far +32..+67 %).
- *The rim's plain dimming in the build-up* (x( 1 - 0.3 T s ), with either flare): ostgut's worst second went from
  1.5 to 2.0 flashes, at -7..-9 s, where the build-up is 0.47..0.5.  The two luminance series of that quarter window
  differ by ~5 %; WCAG's state machine (follow the extreme, turn at 0.1) found four turns in a second instead of
  three -- the hall's own kick flicker sits at the threshold.  The rim pulses with the kick (0.55 + 0.9 audioKick +
  0.35 audioLevel in lit()): the build-up now holds that pulse back (to 0.4 of it at full tension), which is also
  the musical sense of a held breath; ostgut 1.0.
- *Changing the breath* (letting it go at the drop as well) -- not done: it is global, has no knob, and changes every
  drop of every scene; listed for the user.

#### For the user

- The held breath (final pass) still lets go with the build-up's fall, about a second after the arc has cleared.
  Releasing it at the drop too (its target x ( 1 - the same envelope )) would make the whole picture clear at once;
  it changes every drop in every scene, so it waits for a yes.
- The arc follows the analyser's build-up, which misses some builds (uplifting) and sees others in grooves (goa) --
  see "What was there".  Where it is wrong the arc is wrong with it, quietly (a haze in a groove, no tension before a
  drop).
- The strengths (haze 0.7, aperture x2.5, shafts x1.9 at the drop, rim x1.4, withdrawal 0.35) and the 23 % off-share
  are first values from one hall and one lab.  The clips (sheets\p2\p2_clip_*.mp4) show them with the music.

#### Not verified

- Other scenes: the arc was measured on one 3D hall (PillarHall) and one photo lab (FoldLab, one photo with a map);
  rooms with a sky, open landscapes, and the other labs and Chain* scenes with depth were not rendered.
- The score-cue path (`-k`, pulse tau 0.66 s), forced drops and DJ-stop slams: the envelope's timing for them is
  computed (above), not rendered.  A photo cross-fade or a scene cross-fade during the arc: the code mixes the two
  layers' strengths with `interpolation`, not rendered.
- GPU time: not measured.  The arc adds a few ALU per pixel, FxAmbientOcclusion two depth reads (the withdrawal),
  FxRimLight two colour reads, FxDepthField and FxDepthFog nothing extra (arcP 0 skips all of it).
- The impression with real music over a show, on the panel and in the headset -- the user's.
- No C++ changed: the self test was not run.
