## 20.11.2026 (67, UI): rating from the phone, the system's language, stereo for headsets

Three packages of the plan of 20.11. (docs/PLAN_2026-11-20.md: B6, D3, H2), worked on a branch of their own. This
file holds their notes until they are folded into docs/engine-internals.md.

### B6. A rating walk on the web remote

- *What was there.* The favourite, the skip and the ban all act on whatever happens to be on screen; the settings file
  of 10.11. held 307 taste weights, all skips from a test bench, no favourite and no ban (66). The catalogue page can
  mark scenes, but from stills. Nobody judges 2,475 scenes in passing.
- *What changed.* The remote has a **Rate** tab. "Start" makes the running preset walk its scenes that have no
  verdict yet: each holds for the seconds set on the page (3..60, default 12), the walk cuts with a 0.8-s cross-fade
  (always `Crossfade.frag`: a shatter would be judged along with the scene), and the music does not cut in between
  (sections, drops, harmonic jumps, the phrase wait and the fade floors are off, as on the review bench). Three big
  buttons: **Like** (what `f` does: taste x1.25, the lab's classes x1.1, the roll into `liked_rolls.tsv`; no song cue
  -- a walk is no moment of a song), **Next** (seen, no opinion: no taste change -- the skip's 0.8 is not applied,
  a rating walk is not a show to escape from) and **Never again** (the ban, with its rule that enough scenes must be
  left). Every verdict is also written as one: `[rated] Preset/File.frag = like|next|never`, at once (`sync`), which
  is what keeps the scene out of the next walk. A counter ("312 of 823 rated"), the scene's name, the seconds left
  and a bar; **Undo** takes the last verdict back with its favourite or its ban and brings the scene back.
- *What a scene is.* The unit is the shader file, because the taste and the ban are keyed by it: the models of one 3D
  family share a shader and get one verdict (Noir: 519 entries, 458 files; 426 in the worktree, which has no models).
  The order is random; a scene left without a verdict when its time is up stays unrated and comes round again only
  after every other open one was shown (a pass), so walking away from the phone does not mark anything.
- *Where it lives.* `SceneScheduler::setRateWalk()` is review mode with the viewer's span and the caller's order: one
  `bench` flag replaces `m_reviewMode` at every place in `tick()` that gates musical cuts, floors and the no-repeat memory (the
  walk leaves that memory alone, like a review). The next scene comes from `RenderPipeline::rateNextPick()` at the end
  of every fade; the pipeline keeps the verdicts (`M_Rated`), the state and the undo. The auto-preset by mood holds
  while a walk runs (it would switch the preset away mid-walk); a pin or a freeze is lifted at the start.
- *Which scene a verdict is for.* The page sends the file it shows with the verdict. The scene being judged is the one
  coming in during a fade, and the one the walk cut to itself from the moment it asked for it (else the first poll
  after "Start" showed the scene from before the walk -- found by the test, below). A second tap before the cut is
  refused (it would judge the scene after it); a verdict for the scene the walk left by itself less than four seconds
  ago still lands on that one, without moving on.
- *Apply.* `Tools/apply_taste.py` reads `[rated]` too: "never" is a ban in that genre (also when the app refused the
  ban), "like" holds at +1 or above where the learnt weight faded or was skipped back, "next" changes nothing.
- *Measured* (`Tools/rate_walk_test.py`, over `/api` only, on an empty settings copy, Noir, 4 s per scene): 20 verdicts
  on 20 different scenes (4 like, 12 next, 4 never), counter 0 -> 20 of 426, a
  second tap refused, a scene left alone moved on after its 4 s and stayed unrated, undo restored the count and the
  scene; the copy holds 20 `[rated]` entries, the four likes at `[taste]` 1.25, the four nevers in `[banned]`, and
  `apply_taste.py` reads "rating walk: 20 verdicts". Phone width (built-in browser, 375 x 812): no horizontal scroll
  (scroll width 375), the three buttons 351 x 65..69 px, the whole tab including "Stop" on one screen below the preview.
- *Seen on the way, not changed:* the app crashed once in `glTexSubImage2D` 20 s after the music-video picture in
  picture started (minidump in the worktree's `Release/`; the call stack runs from `paintGL` into the driver).
  `VideoPiP.cpp` takes frames in a `videoFrameChanged` lambda without a context object; if the backend emits it from
  its decoder thread, `g.latest` is replaced while the GL thread uploads it. Not caused by the walk (the crash came
  with no verdict pending); left for its own look. Tests now run with `videoEnabled=false`.
