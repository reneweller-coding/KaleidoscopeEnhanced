### B1 -- how much each scene answers the music

The screening's numbers could not say it (66): the brightness ratio loud/quiet reads 1.0 for a scene that answers
with its geometry.  `Tools/reactivity.py` renders every scene twice by the video export on the frame clock, with the
same seed and parameter rolls -- once over the screening music (chord bed, lead, bass and drums at 128 BPM, loud and
quiet halves of an 8-s cycle), once over silence of the same length -- and compares the two.  Whatever differs, the
music did.

- `react_struct`: each frame normalised to zero mean and unit spread, the mean absolute difference music against
  silence (0 = the same picture, about 1.1 = unrelated pictures) -- brightening alone reads near 0.
- `react_sync`: the change the music adds from frame to frame (the music run's frame difference minus the silent
  run's) against the music's onset envelope, Pearson, best of lags 0..3 frames.
- `react`: the rank of the mean of both ranks, 0..1 (the catalogue page shows it as a badge).
- *The controls.*  No scene of the catalogue is free of audio (every scene reacts, by the house rules), so the still side
  was made: the photo itself as a scene (`Engine/ProfileStill.frag`) and null pairs -- ten heavily reactive scenes
  rendered silence against silence.  The null pairs read exactly 0.000 (the export is deterministic), the photo 0.16
  (the engine's own small answer), the ten reactive scenes 0.32..0.82: a clean separation.
- *Two traps found on the way.*  Photo changes fall on the music's phrases, so with free photos the two runs showed
  different pictures and the static photo read 1.06 -- the photo is fixed now (`KALEIDO_FIXED_PHOTO`, the snapshot
  baseline's).  And a scene's own periodic motion correlated with the 4-s loud/quiet cycle by chance (a null pair
  read a sync of 0.29), so the sync uses the music run's change minus the silent run's.
- *The run.*  2,474 of 2,475 scenes in 52 minutes (480 x 270 at 15 fps, 8 s per scene, 0.8 s per scene and run;
  TunnelPlain fell into a sacrificial window).  react_struct p5 0.14, median 0.45, p95 0.83; 160 scenes stay below
  the static photo's 0.16; react_sync is 0 for 129.  The two measures are nearly independent (r = -0.15).
- *Against the ratings.*  interest and react: rank correlation 0.12 -- the ratings came from contact sheets, which
  cannot show an answer to music.  25 scenes rated 7 or 8 sit in the bottom 5 % (KlimtGoldMosaic, RooftopRainTokyo,
  StarshipPlanetaryOrbit, KardashevTypeIIICity, ApollonianSpherePackingGasket, ...), 17 rated 3 or 4 in the top 5 %
  (KolmogorovMeanders, RockPaperScissorsSpirals, BeeWaggleDance, ...).  Contact sheets "with music / with silence" of
  the bottom 5 % (124 scenes, react < 0.05) are in `.screen/reactivity/sheets`; for most of them the two halves look
  the same.  Only 8 of the 124 are 3D scenes (13 % of the catalogue is 3D).
