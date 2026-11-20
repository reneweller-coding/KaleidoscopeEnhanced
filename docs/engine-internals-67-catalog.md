### E1 -- the catalogue page grows up (20.11.2026)

`docs/Catalog/index.html`, data from `Tools/make_catalog.py`; still static, no dependency, works from the disk.

- *Header.* "Download for Windows": the installer and the portable ZIP at the fixed addresses
  `releases/latest/download/KaleidoscopeVisualizer-Setup.exe` / `-portable.zip` (always the newest release, no page
  edit per release), and "GitHub". The demo video gets a slot: `DEMO_VIDEO_URL` at the top of the script; the link
  shows only when it is set. On phones the header no longer sticks: with six rows it covered 590 of 812 pixels.
- *Links to an entry.* `#Name` opens its detail view. Opening from the grid pushes one history entry, paging inside
  the view replaces it, so the back button closes the view wherever one paged to; closing by hand goes back too, and a
  view opened by a link drops the `#Name` instead. A name a scene and a transition share (only VoronoiShatter) is the
  scene's; the transition is `#VoronoiShatter:T`, and every entry also answers to `#Name:<kind>` and to its name in
  any case. An unknown or malformed hash opens nothing (the lookup is a prototype-free map; nothing of the hash
  reaches the page).
- *Paging.* Left/right arrow keys (not with Alt: that is the browser's back) and Previous/Next buttons walk the current
  filtered and sorted list, with "12 / 340" beside them. An entry outside the selection (opened by a link or from
  "similar scenes") pages to the ones next to where it would stand in that order. "Random scene" (from the header:
  "Random transition" when the kind filter says so) picks from the selection, "Random" in the view as well. Hearts and
  crosses are in the view too, so one can page and mark.
- *Optional data -- the page works with and without it; `make_catalog.py` writes a key only where there is a value:*
  `s` up to eight similar scenes from `Tools/scene_neighbours.tsv` (header `name cluster dup_group neighbours
  distances`, `neighbours` a comma list, nearest first; names not in the catalogue are dropped), shown as thumbnails
  (the card's picture) that open the entry; `x` the column `react` of `Tools/scene_reactivity.tsv` (header `name
  react_struct react_sync react`, a percentile rank 0..1, rounded to two decimals), shown as "reacts to music: strong /
  medium / subtle" (>= 0.66 / >= 0.33 / below) with a filter row "Reacts" that appears only with the data; `p` when
  `docs/Catalog/strip/<Name>.jpg` exists for a transition, shown in the view (loaded only there; a strip that is
  listed but missing hides itself). Pages publishes `docs/Catalog` as a whole, so the strips go live with it.
- *Regenerating only the data:* `python Tools/make_catalog.py --data-only` writes catalog-data.js and touches neither a
  picture nor Katalog.md/.html (`--data-out`, `--neighbours`, `--reactivity` for tests). Without the three inputs the
  file is byte for byte what it was. With neighbours for 2228 scenes it grew from 1.51 to 1.94 MB (gzip 464 -> 536 KB).
- *Accessibility:* the filter chips are buttons with `aria-pressed` (they were spans: no keyboard), card names are
  links to `#Name` (a middle click opens the entry in a new tab), a visible focus ring everywhere, the view is labelled
  by its title and takes the focus itself rather than on "Previous".
- *Checked* in the built-in browser and headless Edge at 1280 and 520 pixels and the phone preset (375): no
  horizontal scroll, every referenced picture exists (7903, plus the strips and the neighbours' names), the hash cases
  above, back/forward/close in every order, paging order = grid order under filter and sort, random within the
  filter. Filtering or sorting the 2715 entries takes about 10 ms, opening the view 34 ms, a page step 3 ms.
- *A trap on the way:* in a hidden browser pane Chromium fires a dialog's `close` event only with the next frame, i.e.
  never; the history clean-up ran there and the address kept its `#Name`. It runs directly from the buttons, on
  `cancel` (Escape) and on `close` now, once, whichever comes first.
