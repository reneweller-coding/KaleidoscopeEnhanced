### C1, C2 -- the transitions in the catalogue: from inside the fade, and as a strip

- *Why.*  Every transition picture was a real-time recording of a forced fade between the two reference scenes, and
  `Tools/pick_best_frame.py` kept the frame with the most contrast -- for about half of them that was one of the plain
  scenes, not the fade (v1.16 noted it, nobody fixed it).
- *How now* (`Tools/trans_frames.py`).  One video export per transition on the frame clock: TunnelPlain and
  AuroraBorealisOverFjord, both solo for 4 s with a 10-s fade, the transition forced (`KALEIDO_TRANS_STYLE`), one fixed
  photo, 40 s of silence (with a beat the scheduler clamps a fade to four beats).  The scheduler fades from the first
  scene to the other and back, so one render gives both pictures: `_2D` the fade over TunnelPlain into the aurora,
  `_3D` the other way.  `KALEIDO_FADE_LOG` now stamps each fade with the scheduler's clock
  (`SceneScheduler::logClock()`), so the frames are taken at known points of the fade: the middle (progress 0.5),
  unless that frame is less than a quarter of the way from either end -- then the frame of 0.3..0.7 farthest from
  both -- and for the strip 0.1 / 0.3 / 0.5 / 0.7 / 0.9 of the 2D fade, five frames of 288 x 162 side by side in
  `docs/Catalog/strip/<Name>.jpg`.  About 8 s per transition (the old way: two recordings of 16 s each); 210 in
  30 minutes.  *A seed does not fix the order:* which reference scene comes first depends on the transition's own
  rolls, so the scene each fade went into is read from the log instead.
- *Result.*  420 pictures, none less than a quarter of the way from an end; 5 late transitions (CurtainRaiseTwoPart,
  EmbroideryStitchFill, FeltPressFibreMerge, HighlightBloomReveal, LiquidCrystalDefectDomain, their 3D fade) taken at
  0.7.  210 strips, 9.5 MB together; the catalogue page loads a strip only when its entry is opened.  On a contact
  sheet of 30 random pictures 28 show both scenes or the transition's own in-between state (a grey bridge, a white
  flash, streaks, a wormhole); Luminance and WaterRipple show mostly one scene at 0.5 -- their strips show the course.
