### D1, G1, G2 -- the CI's net, a fold, the jump test under Mesa

- *D1, the CI checks what only the reference machine checked.*  New steps in the Windows job: the app's self test
  (`Kaleidoscope.exe -q`), the analyzer against its truth and baseline (`analyzer_regress.py --allow-missing`:
  `broadband120.wav` is not in the repository, so the CI checks the chord and structure tracks only; `--update` refuses
  that flag), the scene plan (`check_schedule.py --quick`, which reads QTDIR now), UI strings, mood tags, camera shake,
  shader docs and the source layout (clang-format from the Visual Studio LLVM toolset; its version is printed).
  Two traps on the way: the runner's Python has no numpy, and `jurplel/install-qt-action` puts its own Python first on
  PATH -- a `pip install numpy` before "Install Qt" installed into a Python the later steps no longer ran (found by the
  Linux worktree's runs).  The step sits after "Install Qt" now.  The proof that a new step gates: a temporary branch
  with an analyzer baseline the analyzer cannot meet (`chord_changes_seen` 99) turned red at exactly that step.  (A
  mislabelled English text, the first try, already broke the *build*: the Kaleidoscope project runs check_strings.py
  as a build step -- the strings were gated all along.)
- *G2, the jump test under Mesa gates.*  In the last green runs all 210 transitions passed under llvmpipe, as on the
  reference machine, and cfxcheck had 0 failures of 4; both steps run whenever Mesa could be installed and gate now
  (they were continue-on-error).
- *G1, HyperbolicKaleidoscope's fold.*  `a = abs(mod(a, sector) - sector/2)` maps the wedge [0, sector/2] onto itself
  turned around (the trap of 22.10.), so a point and its image in the edge circle folded to different places: 95-100 %
  of 20,000 random pairs for six {p,q} (`Tools/hyperfold_check.py`).  Now `sector/2 - abs(...)`: 0 %.  The seam keeps
  measuring the mirror through the edge midpoints, as before.

### C3 -- the 23 transitions above the calm genres' limits

187 of 210 pass the soft limits (core80 >= 0.45, flash <= 30, flicker <= 1.25, step <= 0.10).  The other 23, by what
they are tagged and where they run:

- *Hard on purpose* (aggressive, bright, wipe or blocky; only in the driving genres): CausticLiquidWarp (flash 44),
  HyperspaceStreak (flicker 1.34), LichtenbergLightningWipe (flash 30), KaleidoscopicPolytope (flash 72),
  AbrikosovVortexLatticeSweep (flicker 1.27), SolitonWaveCollision (flash 61), BloomWhiteFloodHandoff (flash 75 -- a
  white flood by design), SuperfluidHe4Fountain (flash 35), ChromatographySeparation (flash 32), MagnonRippleBeams
  (core 0.38), HexShutterTurn, TileFlipWaveRipple (core 0.35), CurtainRaiseTwoPart (core 0.40), Tesseract4DRotation
  (flicker 1.49), NewtonRingsInterference (flash 36), GyroidMembraneMelt (flash 31).
- *Worth a look:* two tagged calm sit just over a limit -- PenroseMorph (flicker 1.30) and PosterBandRelease (core
  0.35); four tagged dark flash and run in Noir -- WormholeSpaceFold (53), QuantumWaveCollapse (43), PoincareSpin (38,
  flicker 2.12), ReactionDiffusionTuring (31); DewettingFilmRupture (dark, core 0.38).  A `trVeil()`-like ceiling on
  the flash would suit the dark ones.  Nothing changed here (the plan's C3 is a report).
