## 20.11.2026 (67): which scenes look alike -- a similarity map, look-alikes in the plan, near-duplicates

Plan 20.11.2026, packages B3, B4 and B5. Written as a section of its own for the lead to fold into
docs/engine-internals.md.

### B3: the similarity map

- *Tool:* `Tools/scene_similarity.py` (numpy and PIL, nothing new). A scene is its three catalogue frames
  (`docs/Catalog/img/<Name>_A/_B/_C.jpg`); the 2475 scenes of kind 2D and 3D. The 210 transitions and 30 FX overlays
  are left out: they are never a scene of their own (an overlay runs over whatever plays, a transition between two),
  `SceneScheduler::pickScene` never picks them, and the catalogue shows them with frames of another kind.
- *Descriptor of a frame* (each part a published one, named in the code): the colour layout -- mean CIE Lab of 8 x 5
  cells (MPEG-7 Colour Layout, Kasutani & Yamada 2001, in Lab instead of the DCT of YCbCr); a histogram of oriented
  gradients on a 4 x 4 grid with 8 unsigned orientations (Dalal & Triggs 2005), compared as its square root (Hellinger,
  "RootSIFT"); the power spectrum in 12 log rings x 4 orientations (the spectral signature of Oliva & Torralba's
  spatial envelope, 2001). Each part's distance is divided by its median over all frame pairs, mixed 0.35 / 0.40 /
  0.25. Two scenes are compared by the modified Hausdorff distance of their frame sets (Dubuisson & Jain 1994), so a
  look shown at another moment still matches. 27 ms a frame, three minutes for all 7425 (cached in
  `.screen/similarity`).
- *The bottom 12 rows are cut off:* 83 % of the C frames (409 of 495 sampled; 2 A, 2 B) end in a black strip of
  about eight rows -- a mark of the render, which made the C frames of unrelated scenes alike.
- *Known families come out near, different ones far* -- the scenes generated from one template library of
  `Tools/scenegen/gen.py` against all pairs (all pairs: median 0.99):

  | family | scenes | median within | nearest family member, median rank (chance) | of the 8 neighbours from the family (chance) |
  |---|---|---|---|---|
  | fractals (FRAC_LIB) | 20 | 0.82 | 8 (123) | 0.6 (0.06) |
  | flows (LIC_LIB) | 31 | 0.94 | 2 (79) | 1.9 (0.10) |
  | long exposures (EXPO_LIB) | 22 | 0.94 | 10 (112) | 0.5 (0.07) |
  | rhythm carpets (RHY_LIB) | 38 | 0.93 | 22 (65) | 0.3 (0.12) |
  | members of two different families | | 0.97 | | |

  Every member has a relative far closer than chance (rank 2 to 22 among 2474), but a family is no tight cloud: a
  template is a technique, and each scene drives it its own way. Tunnels are no group either: the 72 scenes named
  "...Tunnel" lie at 0.93 from each other, and on the sheet a ring tunnel on black, a hexagonal throat and a cracked
  yellow spiral do not look alike; CrystalThroatTunnel's nearest scene is WaterfallTunnel, and those two do.
- *The photo was the strongest signal.* The 30 nearest pairs on the first contact sheets were almost all two scenes
  that drew the same catalogue photo (the frames were rendered with a seeded photo sequence, so dozens of scenes show
  the same foam, rose or curtain photo) and leave it largely as it is. Raw clusters were photo groups: the largest of
  average linkage at 0.38 held the 13 scenes on the green and pink foam photo, among them a zoetrope and a fence
  shadow that look nothing alike apart from the photo; at 0.62 one cluster of 196 swallowed every "textured all
  over" frame. The distances are therefore hub-reduced (local scaling, Zelnik-Manor & Perona 2004; Schnitzer et al.
  2012, "Local and Global Scaling Reduce Hubs in Space"): d / sqrt(s_a s_b) with s the distance to the seventh
  nearest scene, times the median s. Near while everything around is near too (a crowd on one photo) counts for less
  than near while everything else is far.
- *Calibration by eye.* 95 pairs on contact sheets (the frames of both scenes side by side), judged "same picture",
  "near" or "different", the verdicts kept in `Tools/scene_similarity_pairs.tsv`: drawn along the raw scale by log
  rank up to the median (50), evenly in the raw band 0.20..0.34 and in the hub-reduced band 0.15..0.50 (32, eight of
  them judged before). Result: 25 same, 15 near, 55 different. Of the 25 "same", 24 are photo-borne (both scenes show the shared photo nearly as it
  is) and one has its own look in common (ActiveBrownianClusters / GranularGasCooling: blue swarms of dots on black).

  | scale | AUC same vs. different | "same" from .. to | "different" from |
  |---|---|---|---|
  | raw | 0.85 | 0.10 .. 0.36 | 0.19 |
  | hub-reduced | 0.92 | 0.18 .. 0.55 | 0.32 |

  Hub-reduced, below 0.30: 6 same, 1 near, 0 different; below 0.35: 10 / 4 / 1 (the one: HoarfrostFeatherGarden and
  OgeeTrellisSway, a ring trellis over the same photo); below 0.40: 14 / 6 / 6. Raw, nothing above 0.36 was the same
  picture, but below 0.30 already 13 of 40 were different.
- *Thresholds:* `DUP_CUT = 0.35` (hub-reduced, complete linkage: every two scenes of a group closer than 0.35) -- the
  last step before "different" becomes common; it finds 10 of the 25 "same" pairs and one false one, on purpose: what
  it groups may leave a genre. `CLUSTER_CUT = 0.55` (average linkage), a step looser; its largest clusters (5) were
  looked at, every member shows the same picture.
- *Result* (`Tools/scene_neighbours.tsv`, header `name cluster dup_group neighbours distances`, the eight nearest by
  the hub-reduced distance): 2196 clusters, 1989 scenes alone, 207 groups with 486 scenes (155 of 2, 39 of 3, 6 of 4,
  7 of 5); 11 near-duplicate groups with 24 scenes (9 pairs, 2 triples).
- *What it cannot see:* two scenes that both leave the photo alone look the same only when they drew the same photo
  for the catalogue; with different photos they are far apart. The near-duplicates found are real, but they are not
  all there are. What a scene does in motion is not in three stills at all (B1 measures that).
- *Tried and dropped:* matching every frame against the 977 photos of `Images/` (four mirrorings, the same
  descriptor), to subtract the photo: the frames show the photo mirrored, tiled, dimmed and warped, and the best
  matches were wrong photos (pebbles for a field of fireflies). An image model on the CPU (the plan's option) was not
  tried: it would see the photo as well.

### B4: look-alikes one after the other in the scene plan -- measured, no rule needed

- *Measured* on the 20 plans of `Tools/check_schedule.py` (the real scheduler on the virtual clock: 12 h of silence and
  6 h of the structure track per genre preset, 0 violations), with `python Tools/scene_similarity.py --plans`: of each
  change, whether the next scene is in the same cluster, the same near-duplicate group, a looser grouping (average
  linkage at 0.70: 789 groups, largest 20 -- warm-toned photo patterns and the like, grouped by palette and texture
  rather than by look; a sensitivity check) or among the eight nearest scenes, against a blind pick from the scenes
  the plan shows.

  | | changes | same cluster | same group | loose grouping | among the 8 nearest | longest run in one cluster |
  |---|---|---|---|---|---|---|
  | all 20 plans | 7918 | 1 (0.01 %) | 0 | 26 (0.33 %) | 36 (0.45 %) | 2 scenes |
  | worst plan | | 0.23 % (Downtempo, music) | 0 | 1.05 % (Club, silence) | 1.17 % (Psytrance, silence) | 2 (loose: 2) |
  | blind pick | | 0.00..0.06 % | | 0.18..0.48 % | 0.33..0.58 % | |

  The one change inside a cluster: WaterGlassRowFlip -> PhotoDepthParallax (Downtempo on the structure track), two
  scenes that leave the same mirrored photo nearly alone.
- *Why so few:* the scheduler draws evenly from several hundred scenes, the no-repeat memory holds three quarters of
  them, and look-alike groups have two to five members -- a blind pick lands in the running scene's group less than
  once in a thousand changes, and the plans agree. "Among the 8 nearest" is two to three times the blind pick in a few
  plans (perhaps moodAccept, which prefers scenes of a restlessness like the music's; not followed up) and stays near
  1 %.
- *Decision:* the plan's limit (more than 5 % of the changes, or runs of three) is not reached under any grouping
  tried, so `SceneScheduler::pickScene` stays as it is, no cluster attribute goes into the presets, and no rebuild was
  needed. The measurement stays repeatable: `python Tools/check_schedule.py` then `python Tools/scene_similarity.py
  --plans`.

### B5: near-duplicates leave the genre presets (the user's decision of 20.11.)

- *Rule* (`Tools/make_genre_configs.py`, overlay `Tools/scene_redundant.tsv`: name, group, source -- read like
  `Tools/user_taste.tsv`): the file holds groups of scenes that show the same picture, confirmed on contact sheets.
  In each genre preset the two best members of a group stay (interest, then the genre's fit, then the name), the
  others are only in Allround; the selection is then made again without them, so the fill to 400 scenes may take
  another. Nothing is deleted. The generator prints every scene it leaves out and why.
- *A pair never loses a member*, so only groups of three or more matter. The 11 groups at `DUP_CUT` hold two triples,
  and neither has three members in one genre: on the calibrated threshold alone nothing would change. The net was
  therefore widened for this step to complete linkage at 0.55 (the widest "same" pair of the calibration): 32 groups
  of three or more, 14 of them with three members in some genre. Each was looked at, with this test: every member
  shows the same picture in at least two of the three frames, and none shows a structure of its own (lines, seams,
  folds, contours, a blur) in two or more frames; a walking lab (LAB_LIB, BandLab here) never counts -- its three
  frames are three moments of hundreds of looks.
  - *Confirmed, with an effect:* ChainKaleidoTunnel, ChainTunnelHex, ChainTunnelKaleido -- three chain tunnels with
    kaleidoscopic walls, the same tunnel in A and B (ChainKaleidoTunnel shows its star in B and C). The only group of
    this round whose sameness is its own geometry rather than a shared photo.
  - *Confirmed, without an effect* (not three members in any genre): ChannelPlateTectonics, SelfLensingPhoto,
    SolitonGasCollisions (DamasceneFoldedSteel left out, folds of its own); the two triples of the threshold; nine
    pairs, kept in the file as verdicts (13 groups, 31 scenes in all).
  - *Not confirmed:* BlackHole / ParticleGalaxy / PlanetRings and CosmicBoidsVortex / RadiolarianSilicaLattice /
    WhiteHoleFountain (particle disks and swirls on black -- related, but different objects); RotatingSnakesPhoto /
    TextureGlassCubeSwarm / ThresholdSeesawSpin; ConvectionRollsDye (cells) with two streaked photos; FishSchoolFlowField
    / FlareGhostTrain / PhaseConjugateEchoReturn (flow lines, radial streaks, rings of their own in B and C);
    HarmonographExposure (blurred throughout); HoarfrostFeatherGarden / OgeeTrellisSway / WoodblockBokashi (a trellis);
    DispersiveWaveTrain, RunLengthStreaks, SeptarianVeinNetwork beside FocusBreathingPull / MajolicaGlazePools (wave
    fronts, streaks, a vein network); PhotoGeodesicFronts beside two pairs on the same orange photo (contours; the pairs
    differ by a sunburst); ImageQuiltingSeamDrift (seams); MonetLilyPond.
- *Result:*

  | genre preset | entries before | after | distinct scenes before | after | change |
  |---|---|---|---|---|---|
  | Ambient | 847 | 847 | 822 | 822 | -- |
  | Downtempo | 456 | 456 | 456 | 456 | -- |
  | SpaceAmbient | 461 | 461 | 401 | 401 | ChainTunnelKaleido out, ExposureLab in (the fill to 400) |
  | Cinematic | 446 | 446 | 402 | 402 | -- |
  | Club | 694 | 693 | 689 | 688 | ChainTunnelKaleido out |
  | Electronic | 575 | 575 | 570 | 570 | -- |
  | Psytrance | 646 | 645 | 646 | 645 | ChainTunnelKaleido out |
  | Psychedelic | 1006 | 1005 | 1005 | 1004 | ChainTunnelKaleido out |
  | Noir | 519 | 519 | 454 | 454 | -- |
  | Allround | 2690 | 2690 | 2475 | 2475 | -- |

  No genre below 99.8 % of its size (the plan's floor: 85 %). The solo times of the other entries move by one second
  at most where a scene left (each preset's mean solo time is normalised to 55 s; 21 to 326 entries per preset).
- *Checks:* `PresetEditor --roundtrip` of all 12 preset files ok, `PresetEditor --validate` ok ("all 11 file(s)
  complete vs. Komplett.xml"), `Tools/check_schedule.py --quick` 20 plans without violations.
- *Not verified:* the scenes in motion -- three stills cannot show what a scene does over time, and the confirmed
  groups are mostly scenes that leave the photo alone; B1 (musical reaction) is the measure for that. Scenes that
  look alike but drew different photos for the catalogue are not found (see B3). No app render of the changed
  presets: apart from the one entry each, they are unchanged.
