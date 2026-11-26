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
  SCENES_TABLE
- *Not here, and why.*  Derivatives in a pixel-dependent branch are undefined (fwidth-divergent-branch trap):
  Detonation shades its shell inside `if ( dot( n, V ) > 0.0 )`, so it takes an explicit mip (2.5) instead of
  envReflect().

U1_RESULTS

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

U2_RESULTS
