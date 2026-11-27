### (72) rays -- light shafts through the photo's depth, in the present pass

Sprint of 27.11.2026 (16:23-16:53), agent "rays", branch `wt-rays` from cdab7da3.  An idea of the lead the user
approved: light seems to come from the far, bright part of the picture toward the viewer and is cut by everything
nearer (crepuscular rays) -- one more depth effect, but in the present pass, so that it is there whatever combine the
scheduler drew.  Knob `raysP`; 0 = the old code path behind an `if`.  **Not in any preset**: the user decides after
seeing it.

**State at the time of writing (keep this paragraph true): the code is committed UNBUILT (c51db561 + the formatting
commit after it).  Nothing below was rendered or looked at unless the section "Verified" says so.**

#### What it does

- *Engine/Present.frag*, three marked blocks (`// ---- rays (27.11.2026) ... BEGIN/END`): the uniform `raysP`, the
  function `raysLight()` after `photoDepthAt()`, the call after the CAS sharpening and before the NaN bound and the
  grade (so the mood grade, the lamps and the limiter work on the lit picture as on any other).
- *The march.*  From each pixel `RaysTaps` = 16 samples toward the light point, at most `RaysReach` = 0.6 frame
  heights.  A sample counts where the photo is far (`1 - depth`, smoothstep 0.5 .. 0.85) and the frame is bright
  (luminance, smoothstep 0.35 .. 0.8); a near sample counts nothing, so a shaft ends at a silhouette.  Each sample
  weighs 0.93 of the one before it.  The sum is normalised, takes two thirds of its own colour (light, not a copy of
  the picture), fades to 20 % far from the light point (distance 0.25 .. 1.2 heights) and is added as a screen blend
  written for light above 1 too (`c += L * ( 1 - min( c, 1 ) )`, as the time echo does with 16-bit intermediates).
- *No bands, no flicker.*  The start of the march is jittered per pixel with an interleaved gradient noise of
  gl_FragCoord only -- no time in it, the pattern stands still.  Both textures are read with `textureLod( .., 0 )`: no
  implicit derivatives of a jittered coordinate.
- *The light point* rests in the upper middle and drifts on two slow sines of `time` (0.5 +- 0.16 at 0.041 rad/s, 0.80
  +- 0.07 at 0.029 rad/s: periods 2.6 and 3.6 minutes).  It never jumps, also not on a photo change -- the frame and
  the depth cross-fade under it (the scene does that with `interpolation`), the point does not know the photo.
  The brightness-weighted centre of the far region was the first idea of the brief; it needs a memory (a smoothed
  position on the host, from a read-back or a low mip level) and was not attempted in 30 minutes.
- *The music.*  Strength x ( 0.65 + 0.35 x `audioSwell` ) -- the slow loudness build (fast average 1.5 s minus slow
  average 8 s, AudioConditioner.cpp), never a beat, a kick or the drop pulse.  No motion of the camera.
- *The host* (Source/RenderPipeline.cpp, the block before `m_present.run( pin )`): `pin.raysP` = the ACTIVE scene's
  rolled preset knob `raysP` (0 where its entry has none; `EffectShader::namedParameter()`, new) times "a photo's depth
  is up" (`M_DepthPhoto[0] x M_DepthValid[0]`, 0 on the full-source path), slewed at 1.2/s (`m_raysUp`).  So a scene
  without `// @depth`, a 3D scene, or a photo without a map gets 0, and neither a scene change nor a photo change
  makes the light jump.  Source/PresentPass.cpp binds the depth texture to unit 6 also where only the rays need it
  and sets the uniform (0 where there is no depth texture).
- *Knob 0.*  `m_raysUp` stays exactly 0, the uniform is 0, the shader skips the block (`if ( raysP > 0.001 )`), unit
  6 is not touched: the old picture by construction.  To be shown with snapshots (below).
- `KALEIDO_RAYS=<x>` forces the knob for every scene (still times the photo-depth presence) -- for looking at it
  while no preset sets it.  Not yet in the README's list of switches.

#### Which preset line switches it on

Inside the `<TextureShader ...>` entry of a scene that passes the photo's depth on (`// @depth`, e.g.
`Scene2D\ChainLab2D.frag`) in Presets/Komplett.xml:

    <float name="raysP" minValue="0.5" maxValue="1.0"></float>

(or `minValue="-0.3"` to leave it off in part of the activations, as `arcP` does; values <= 0 are off).  The scene's
own shader does not declare `raysP`: EffectShader::addUniform keeps the rolled value whatever the program declares,
and the present pass reads it by name.  NOT checked: whether a preset validator (release_check, the PresetEditor)
objects to a knob the scene's shader does not declare.

#### Verified

- Light checks after the change: `Tools/cgvr_format.py --check Engine/Present.frag` (formatted), `Tools/doc_shaders.py
  --check` (0), `Tools/temporal_budget.py` (0 errors, 4 warnings as before), `Tools/shake_scan.py --summary --baseline
  Tools/shake_baseline.tsv` (0 new hits).
- (build, knob-0 snapshot, a picture with the knob on: see the report / the lines added below if they happened.)

#### NOT verified (as of the WIP commit)

- That the C++ compiles and that Present.frag compiles on the driver.
- That a frozen snapshot with `raysP` 0 is unchanged.
- The look with the knob on (strength, thresholds, whether the jitter shows as grain at 16 taps), on any photo.
- The GPU time: 16 x 2 texture reads per output pixel while on (the depth read is the unfiltered full-size depth
  texture, the colour read is level 0 of the frame); nothing while off.
- Stereo modes: the march runs in the eye's frame coordinates after the stereo shift; not looked at.
- A combine that warps the picture: the depth is the active SCENE's, the frame is the combined one -- the same limit
  the photo parallax and the photo stereo have (T3 in (69)).
- The self test (`Release\Kaleidoscope.exe -q`), shadercheck's driver compile.

#### How to verify (worktree C:\Users\Rene\Desktop\kaleido-wt\p2; every line through heavy.py)

    cmd /c C:\Users\Rene\Desktop\kaleido-wt\build.cmd C:\Users\Rene\Desktop\kaleido-wt\p2 app
    rem the old exe (cdab7da3) was kept as Release\Kaleidoscope_before.exe; it does not know raysP (uniform 0)
    set KALEIDO_EXE=Kaleidoscope_before.exe
    python Tools\scene_snapshots.py render wt-rays-before --only ChainLab2D
    set KALEIDO_EXE=
    python Tools\scene_snapshots.py render wt-rays-knob0 --only ChainLab2D
    python Tools\scene_snapshots.py compare wt-rays-before wt-rays-knob0
    set KALEIDO_RAYS=1
    python Tools\scene_snapshots.py render wt-rays-on --only ChainLab2D
    python Tools\scene_snapshots.py compare wt-rays-knob0 wt-rays-on

(a stricter "before": the same render with the old exe AND `git show cdab7da3:Engine/Present.frag` in place.)  The
frozen shot runs 600 fixed steps first, so the 1.2/s slew has long reached the knob.  GPU time: the per-pass timer of
P6 in (71) (`KALEIDO_GPU_PASSES`), the present pass with `KALEIDO_RAYS` unset against `KALEIDO_RAYS=1` on a `// @depth`
scene.

#### Open decisions (for the user)

- Whether the effect is wanted at all, and how strong (`RaysGain` 1.5 at knob 1; the thresholds `RaysFar`, `RaysLum`).
- The light point: the slow drift in the upper middle (now) or the far region's bright centre (needs a smoothed
  position on the host).
- A scene's knob (now) or one global setting; and whether 3D scenes should get it too (now: a photo's depth only --
  FxSunShafts already serves rooms).
- Whether the build-up should narrow it and the drop open it, as `arcP` does in the five depth effects (now: the
  swell only).
