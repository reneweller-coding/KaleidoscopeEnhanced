## 26.11.2026 (69, env3d): the photo as environment light for 3D, and a shadow map for scenes on a floor (U1, U2)

Block U of docs/PLAN_2026-11-26.md.  Both packages are variants: a new knob per scene, 0 = the old picture bit for
bit, and no preset sets the knob yet -- which scenes get it and in which range is the user's decision after the sheets.

### U1 -- the photo as environment light

- *What there was.*  No shared lighting in the 3D scenes: every scene lights itself (the `patch_lit*.py` scripts in
  Tools/scenegen are the *literature* rounds of the chain labs, not lighting).  Seven scenes had built their own photo
  reflection, all the same equirect lookup `vec2( atan( R.x, R.z ) / 2 pi + 0.5, R.y ... )`: ChromeFlow, ChromeForm,
  MirrorShardKaleidoscope (through img(), both photos), and BloomSculpt, Detonation, MetaSculpt, Ocean
  (`texture( tex0, fract( uv ) )`).  Three defects in that lookup: a seam where atan jumps from pi to -pi (the colour
  breaks, and the mip chosen from the derivatives jumps to the coarsest level along the line); the four that read
  tex0 alone ignore the photo cross-fade -- tex0 is swapped for the new photo when the fade ends, so their reflection
  jumped at every photo change (the rule "never the photo from tex0 alone"); three of them sample mip 0 on curved
  mirrors (shimmer).  ChromeForm's own `photo()` mixes the slots the wrong way round (`mix( tex1, tex0,
  1 - interpolation )` is tex1 at rest: the *next* photo, and a jump at both ends of each fade) -- left as it is in the
  old look, mentioned for the user.  Five other scenes (BorromeanRingsOrbit, GlassVesselsOIT,
  KineticMirrorHexagonArray, SoapFilmMembrane, TessellatedOcean) look the photo up by the reflected ray's x and y
  (`0.5 + R.xy * k`) -- the projection the block below takes too -- with clamp (the edge texel smeared into streaks)
  or fract (a seam at the edge); they have no atan seam and stay out of the first ten.
- *The block* (`Tools/scenegen/patch_env3d.py`, written into each scene between two marker lines; no include, the
  decision of 14.10.).  `envUV( d ) = 0.5 + 0.6 * normalize( d ).xy`: the photo stands behind the viewer, its centre
  straight back toward the eye, and the far half of the sphere of directions is the near half mirrored at z = 0.
  Continuous over the whole sphere -- no seam, no pole -- and only x = screen right, y = screen up matter, so view
  space and the scenes' own eye frames (z away from the eye) both work unchanged.  Past the photo's edge the
  texture's mirrored repeat continues it.  A sphere map of this kind folds once (at z = 0, a ring at 45 degrees on a
  mirror ball); any continuous map of the sphere into the plane has a fold somewhere, and a mirror fold is what the
  rest of the catalogue does at every seam.  `envPhoto( uv, lod )` = tex0 and tex1 mixed with `interpolation` like
  img(), `textureLod`, `.rgb` only (the alpha carries the depth map from this round on).  `envDiffuse( n )` = mip 7
  (8 x 8 texels of the 1024 photo) in the normal's direction.  `envReflect( r, rough )` = mip `1 + 6 rough`, never
  finer than the pixel's footprint in the photo (screen-space derivatives of the coordinate).  `envFresnel` =
  Schlick.  The photo textures already have mipmaps and mirrored repeat; no cube map.
- *The knob* `uniform float envP`: 0 (never set, no preset entry) = the old look -- every added line sits behind
  `if ( envP > 0.0 )`; above 0 the scene's own environment lookup is replaced by the photo environment, and envP sets
  how strongly the photo's diffuse light adds.  A negative value is off too, so a preset range like -0.6..1 makes it
  a variant of some of the activations.
- *The ten scenes* (smooth surfaces where a reflection shows):
  | scene | before | with envP > 0 |
  |---|---|---|
  | SpectralOrb, SpectralTorus, JellyBody | no photo at all | diffuse photo light plus a Fresnel reflection |
  | MetaSculpt, BloomSculpt, Detonation, Ocean | own equirect lookup, tex0 only (jumps at every photo change), mip 0 in three of them | the photo environment, both slots, mip by roughness |
  | ChromeFlow, MirrorShardKaleidoscope | own equirect lookup with a seam | the photo environment |
  | ChromeForm (11 entries) | own lookup inside `environment()`; its `photo()` mixes the two slots the wrong way round (at rest it shows the NEXT photo) -- left as it is in the old look | the photo environment inside `environment()`, so shell and mirror agree |
- *Not here, and why.*  Derivatives in a pixel-dependent branch are undefined (fwidth-divergent-branch trap):
  Detonation shades its shell inside `if ( dot( n, V ) > 0.0 )`, so it takes an explicit mip (2.5) instead of
  envReflect().

*U1 results* (snapshots of the env3d build, photo kristallhoehle-indigo-fuchsia-2, frozen time, seed 7):

- Identity: all 13 entries with envP absent/0 byte-identical to the set rendered at b87fcc34 (JPG bytes equal, pixel
  difference 0); 35 renders, no error in any log -- the patched shaders compile.
- With envP = 1 the mean absolute difference per scene: SpectralTorus 12.2, SpectralOrb 11.1, ChromeFlow 10.7,
  ChromeForm 8.7, MirrorShardKaleidoscope 8.6, JellyBody 2.8, BloomSculpt 2.3, MetaSculpt 1.4, Detonation 1.0,
  Ocean 0.7 (of 255).  On the sheet (C:\Users\Rene\Desktop\kaleido-wt\sheets\env3d\u1_envP_off_on_photoA.jpg) orb and
  torus visibly mirror the photo; in the other scenes the seam-free replacement is a subtle change.
- Not measured: GPU time per scene with the knob on, other photos.  The weights are first guesses.

### U2 -- a shadow map for scenes on a floor

- *What there was.*  The host's shadow pass (RenderPipeline.cpp, `renderShadowPassGeneric`) draws the active scene a
  second time, depth only, into a 2048 x 2048 map when the program declares `texShadow` (EffectShader::usesShadow()),
  a second map for `texShadow2`.  The scene does the rest: in its vertex stage `if ( shadowPass > 0.5 )
  gl_Position = lightM * world`, in its fragment stage an early return in that pass and the lookup.  `lightM` is a
  sun that turns once in 105 s (`t * 0.06`), orthographic over a box of +-`shadowExtent` (a preset attribute, default
  60) around the origin.  Seven scenes use it (BloomSculpt, Detonation, MetaSculpt, Origami, PillarHall,
  ShadowForest, SmokeHall; PillarHall the second light too); ShadowTheatre's comment says it once tried and rendered
  black.
- *Which scenes.*  The mesh scenes with a floor share one construction: the camera at the origin looking along +z,
  `Ground` and `Dist` constants, the floor drawn analytically in `renderSky()` of the sky shell (`P = dir * Ground /
  dir.y`), one fixed lamp (`lamp_dir`) for the objects.  The floor is not lit by the lamp at all (a flat colour times
  grain), so nothing on it says where the objects stand.  Seven of them: MeshTuningForks, MeshDominoWave,
  MeshMetronomes, MeshSeismograph, MeshZoetrope, MeshFoundryPour, MeshPendulumWave.
- *The block* (`Tools/scenegen/patch_shadow3d.py`).  The host's sun would disagree with the scene's fixed lamp (the
  objects lit from one side, the shadows thrown by a light turning round them), so the depth pass projects along the
  scene's OWN lamp: `smClip( p )` -- the construction of `updateLightMatrixGeneric()` (eye 2 box out along the lamp,
  ortho +-box, near 0.1, far 4 box) around a box the scene names (`SmCentre`, `SmBox`) -- the same function in the
  vertex stage (depth pass) and the fragment stage (lookup).  `lightM` and `shadowExtent` are not used.
  `smShadow( p, n )`: normal-offset lookup (2.2 texels), slope-scaled bias, 3 x 3 taps over the hardware's 2 x 2
  comparison filter -- PillarHall's `shadowAt()`.  The sky shell never casts (clipped in the depth pass).  The lamp
  term of the objects is multiplied by the shadow, the floor darkened by up to 65 %.
- *The knob* `uniform float shadowMapP`, and the only C++ change of the two packages: `EffectShader::usesShadow()`
  counts a program that declares `shadowMapP` only while that knob's rolled value is above 0 (`m_usesShadow == 2`).
  At 0 -- also with no preset entry -- there is no depth pass and the scene is drawn once, as before; the seven old
  shadow scenes do not declare the knob and are unchanged.  Without that gate the pass would have run (and cost) at
  0 for a picture that does not use it.

*U2 results* (checked by the lead after the agent had handed back; sheet
C:\Users\Rene\Desktop\kaleido-wt\sheets\env3d\u2_shadow_before_off_on.jpg):

- Identity, knob absent against the set rendered at b87fcc34: MeshDominoWave, MeshMetronomes, MeshZoetrope,
  MeshPendulumWave and the old shadow scenes PillarHall and ShadowForest byte-identical; MeshTuningForks 0.0001 (max
  2), SmokeHall 0.02, Origami 0.0001 -- the known run-to-run noise of those scenes.
- MeshSeismograph and MeshFoundryPour came out BLACK in every set rendered after ~00:45 -- with the old code of the
  main checkout (b87fcc34) just as with the new (two renders each, all four byte-identical, mean 0.0), while the
  before set of 23:12 showed them.  So not U2: their models are the largest of the pack (11-13 MB .glb), and the
  frozen shot waits for the programs, apparently not for the model load; under load the frame is taken first.  An
  open point for the measuring tools (KALEIDO_FREEZE_SHOT should wait for pending model loads).
- Knob 0 against 1: the shadow shows as a soft dark patch beside the base (clearest in MeshZoetrope); mean
  differences 0.29-1.25 of 255 in the five scenes that rendered.  The framing differs between the "absent" and the
  "0/1" sets because the appended knob changes the scene's rolls in the snapshot tool -- compare 0 with 1, not with
  absent.
- Not measured: the depth pass's GPU cost per scene; more photos.  The old ChromeForm crossfade and the tex0-only
  reflections stay as they were in the old look (for the user to decide).
