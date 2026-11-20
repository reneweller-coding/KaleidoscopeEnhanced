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

### D3. The language follows the system until it is chosen

- *What was there.* Without a `language` key the program, the Setup tool and the export tool spoke German (the
  default of `Strings` and `SetupWindow.cpp:243`, `ExportWindow.cpp:285`), while the releases address everyone in
  English since v1.19.1.
- *What changed.* `Strings::fromSetting()`: a value in the file wins; without one, `Strings::systemLanguage()`
  decides -- German when the user's first UI language (`QLocale::system().uiLanguages()`, on Windows the display
  language; the locale's name if the list is empty) is German (`de`, `de-DE`, `de_AT`, `de-CH` ...), English for
  everything else. The display language rather than the number format, because the text is what the user reads. The
  answer is never written: the program remembers it as the session's start value, so the exit (which writes only
  what the session changed) leaves the file without the key, and the Setup tool writes `language` on "Save" only when
  the file had one or the choice differs from the system's. The remote page is built from the same table per request,
  so it follows. `KALEIDO_LOCALE=en_US` (or `de_DE`) stands in for the system in tests.
- *Measured.* Self test (`Kaleidoscope.exe -q`): five checks (German names, other names including `dsb-DE`, the file
  without the key follows the locale, a value wins, the start value is not written back), 132 of 132. The program on
  an empty settings copy: the remote page in English with `KALEIDO_LOCALE=en_US` ("Rate", "Start rating"), in German
  with `de_DE` ("Bewerten", "Bewerten starten"); after a clean end (`KALEIDO_MAX_RUNTIME_SECS`) the copy has no
  `language` key. The Setup tool (`--script-shot`, new: saves the window as it first appears and quits) shows
  "Language: English" / "Sprache: Deutsch" under the two locales. The on-screen menu was not opened (no key presses in
  tests); it reads the same table.

### H2. Stereo for headsets: full side-by-side and top-bottom, in the export too

- *What was there (measured first).* Live, the half formats were right: a solo 3D scene rendered once per eye
  (measured in the window, `Tools/stereo_disparity.py --live`: the three cards of `Engine/StereoProbe3D` at 8, 24 and
  60 units at -4.51, 0.00 and +1.32 % of the eye's width, right minus left, predicted -4.50, 0, +1.35).  **The video
  export wrote no stereo at all:** `GLwidget::beginExport()` set the stereo mode to 0 ("packing would halve the
  picture"), so `-e ... -3 sbs` and `-3 tb` gave a plain 960 x 540 picture.  **A fade between a 3D and a 2D scene
  dropped the real depth in one frame:** the packed state only covered a solo 3D scene and 3D<->3D fades, so the
  first frame of a 3D -> 2D fade rendered the 3D scene mono and gave it the depth of its brightness -- the near card
  went from -4.58 % (in front of the screen) to +0.42 % (behind it), and back the other way at the end of a 2D -> 3D
  fade.
- *What changed.*
  - Two more modes, 4 full side-by-side and 5 full top-bottom (`-3 fsbs` / `ftb`, `z`, the menu, the Setup tool, the
    remote): each eye gets the frame's whole size and the picture is twice as wide or high.  The pipeline renders
    the frame at ONE eye's size (`RenderPipeline::frameSize()`: half the display's width or height; a switch at run
    time resizes it at the start of the next frame), so a 2D scene renders as before and the present pass shows it
    in both halves; `Present.frag` takes the frame's proportions from `frameRes` (one eye) instead of the display.
    A solo 3D scene renders its two eyes into a target twice the frame's size (`m_stereoTarget`, each eye a whole
    frame -- its projection then has the eye's own aspect), which goes straight to the present pass; the combine
    and the trails were a passthrough for a packed frame anyway (the trails start over after it, `m_trailRestart`).
  - The export keeps a stereo mode given with `-3` (the ini's stays a live setting); `-g` is one eye's size in the
    full formats (`VideoExport::frameWidth()/frameHeight()` double it for the encoder and its probe), and the default
    file name carries the layout: `_SBS`, `_TB`, `_SBSF`, `_TBF`.  Looked up: DeoVR reads SBS / LR / 3DH and TB / 3DV
    / OverUnder anywhere in the name, case-insensitive (deovr.com/doc, section 10); HereSphere reads `_sbs` as
    side-by-side and `_SBSF` / `_LRF` as full side-by-side (its developer, itch.io).  Neither documents a tag for full
    top-bottom; `_TBF` follows the pattern.  A name given with `-d` is kept.
  - A fade between a 3D and a 2D scene is packed now, in every packed format: the 3D side renders per eye, the 2D
    side mono, and `Engine/StereoMix.frag` gives the mono side its two eyes with the depth the present pass would give
    it (its bloom does not exist at that point: a bright pass over a 3 x 3 blur stands in).  The rig of the 2D side
    still moves it.
- *Measured* (`Tools/stereo_disparity.py`: the export at 960 x 540 per frame/eye, silence, `KALEIDO_SCENE_SWEEP=4`;
  per eye = the image's offset from the middle of the two, in % of the eye's width):

  | Format | Video | Near card (8) | Zero plane (24) | Far card (60) | Grey disc (2D) |
  |---|---|---|---|---|---|
  | predicted | | -4.50 | 0.00 | +1.35 | +0.40 |
  | sbs | 960 x 540 | -4.58 | 0.00 | +1.25 | +0.41 |
  | tb | 960 x 540 | -4.37 | 0.00 | +1.46 | +0.41 |
  | fsbs | 1920 x 540 | -4.37 | 0.00 | +1.46 | +0.41 |
  | ftb | 960 x 1080 | -4.39 | 0.00 | +1.46 | +0.40 |
  | mono | 960 x 540 | 0.00 | 0.00 | 0.00 | 0.00 |

  Sign per eye: the near card's image lies 2.2..2.3 % right of the middle in the left eye and as far left in the
  right one (crossed: in front of the screen), the far card's 0.6..0.7 % the other way (behind it).  The deviations
  are one pixel of the 480- or 960-pixel eye.  The 2D grey disc is too dark for the bloom, so its depth is the radial
  term alone and the prediction exact; the white disc lies in front of it (+0.08..+0.15 %) -- but still behind the
  screen: with the zero plane at a depth of 0.45, a 2D picture lies behind the screen except where its bloom is
  bright.  Live in a 2880 x 1620 window: sbs and tb as above; fsbs (eyes 1440 x 1620, 8:9) -11.25 / -2.29 / +0.49
  (predicted -11.26 / -2.25 / +0.45), ftb (eyes 2880 x 810, 32:9) -1.11 / +1.11 / +1.81 (-1.13 / +1.12 / +1.80) --
  the zero plane moves with the eye's aspect (it lies where projM[0][0] / z = 0.045: 24 units at 16:9, 48 at 8:9,
  6 at 32:9), which is the convention every 3D scene was written for; a full format on a 16:9 window has such eyes,
  a 32:9 or doubled virtual screen has 16:9 ones.  Switching 1 -> 4 -> 5 -> 2 -> 4 -> 0 at run time over `/api`
  measured the same.
- *The fade, after:* the near card holds -4.58 % (sbs) and -4.37..-4.58 % (fsbs) through the fade until it is gone;
  the white disc comes in at +0.03..+0.08 % and settles at +0.11..+0.14 % once the 2D scene stands alone (the
  bloom stand-in; a step of at most 0.06 % of the eye's width, against the 5 % jump before).
- *Half formats unchanged:* frozen frames (`KALEIDO_FREEZE_SHOT`, the displayed picture with its packing) of
  StereoProbe3D, StereoProbe2D, PhotoCarousel (3D) and BreathingFractal (2D) in modes 0..3, from a build of
  3b047c36 and from this one (`Tools/stereo_ab.py`): mean and largest difference 0 in all 16.  What does change in
  the half formats is the 2D <-> 3D fade above, on purpose.
- *Encoder limits* (the export's own NVENC settings, 1-s clips, RTX 5090): 2 x 1920 x 1080 -- H.265 level 5.0
  (automatic), H.264 5.1, AV1 5.1; 2 x 2560 x 1440 (5120 x 1440) -- H.265 5.1, H.264 refuses (wider than 4096);
  2 x 3840 x 2160 (7680 x 2160) -- H.265 6.1 at 60 fps, 6.0 at 30, AV1 6.1, no H.264.  The largest sensible size is
  2 x 1440p: level 5.1 is the 4K60 class of decoder a headset has; 2 x 2160p needs an 8K (level 6) decoder.
- *Not verified:* the picture in a headset (the user's part), the players' reaction to the tags (not tried on a
  device), a virtual-screen app's full-SBS mode.  `-3` in the export tool's window: not offered there (command line
  only).
