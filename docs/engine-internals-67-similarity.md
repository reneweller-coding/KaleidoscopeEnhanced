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
