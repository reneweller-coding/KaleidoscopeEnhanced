# What the visualizer wants from a photo set

Requirements for a generated image library, and the reasoning behind each one.
Every numeric requirement is checked by `Tools/check_image_set.py`, so this
document is testable rather than advisory:

```bash
python Tools/check_image_set.py Images
```

**All measurements are taken on the image resampled to 512×512.** Contrast and
detail figures depend on the scale they are measured at — the same set looks
flatter measured at 256 than at 1024 — so the scale is fixed and every
threshold below refers to it.

The shipped [Photo Pack v1](https://github.com/reneweller-coding/KaleidoscopeEnhanced/releases/tag/images-v1)
meets 10 of the 22 criteria. It is right about everything that cannot be fixed
afterwards (format, composition, structure, diversity) and wrong about tone,
contrast and colour restraint. The numbers in the *Baseline* column below are
that set, so the next batch has something to beat.

---

## 1. Format — hard requirements

| | Requirement | Why |
|---|---|---|
| Size | **exactly 1024 × 1024** | `Utils.cpp` caps textures at 1024 and fills the square with `Qt::IgnoreAspectRatio`. At exactly 1024² the engine uses the file untouched: no resampling anywhere in the chain. Anything larger is thrown away, anything smaller is stretched, and anything non-square is distorted. |
| Colour | sRGB, 8-bit, no alpha | The loader converts to ARGB32 and ignores alpha. |
| File | JPEG, quality ≥ 95 | The pack ships verbatim and several scenes *magnify* the photo, so compression artefacts get bigger, not smaller. A re-encode at 85 measured a median PSNR of 33 dB against the original — too thin for grain and fibre. |
| Name | lowercase, `motif-colour-colour[-n].jpg` | Not read by the engine, but it is what lets a batch be grouped by motif when checking diversity. |

**Not needed: seamless or edge-fading images.** The engine samples photos with
`GL_MIRRORED_REPEAT`, which makes *every* image seam-free by construction — the
tile is mirrored, so opposite edges always match. Effort spent on tileability
buys nothing. Edges fading to black are actively harmful: they put dark bands
into every kaleidoscope fold.

---

## 2. Content — what must not be in them

- **No recognisable subjects.** No faces, people, animals with faces, hands,
  buildings, vehicles. A mirror fold turns a subject into a smear, and half a
  face repeated eight times is unpleasant in a way abstract material never is.
- **No text.** No letters, numbers, words, signatures, watermarks, logos.
  Mirrored text is instantly readable as a mistake.
- **No frame, border, vignette or margin.** The image must run to all four
  edges. A white margin becomes a bright cross through the middle of a fold.
- **No single centred object.** See §5.
- Everything generated, so no rights questions and no attribution burden.

---

## 3. Tone — the axis the current set gets wrong

This is the whole reason for a second batch. Target proportions for a
1000-image library:

| Band | Mean luma | Share | Count | Baseline |
|---|---|---|---|---|
| **Low-key** | 0.12 … 0.30 | 20–30 % | ~250 | **1.6 %** |
| **Mid** | 0.35 … 0.60 | 45–55 % | ~500 | **87.2 %** |
| **High-key** | 0.65 … 0.85 | 20–30 % | ~250 | **4.2 %** |

And a dark image is *not* the same thing as a low-key image:

| | Requirement | Baseline |
|---|---|---|
| Low-key images carrying a real highlight | p99 luma ≥ 0.75 in **≥ 70 %** of them | 50.0 % |
| High-key images carrying a real shadow | p1 luma ≤ 0.25 in **≥ 70 %** of them | 54.8 % |

**Why it matters.** Three separate consequences, all measured:

1. *The fold eats contrast.* Rendered photo scenes measure a mean luma of
   0.28–0.38 at a standard deviation of 0.05–0.10 — an evenly lit field with no
   depths to fall into and no highlights to bloom. Folding and cross-blending
   average toward the mean, so a source that already sits at the mean produces
   grey.
2. *The photos cannot join in the mood response.* The engine picks scenes by
   `dark` / `bright` / `calm` / `aggressive` from the music, but if every photo
   is the same mid-grey then the photo layer looks identical under a funeral
   drone and a club track.
3. *Scenes that want light get none.* Godrays, glows and specular-looking
   effects have nothing to catch when the source has no highlights.

---

## 4. Contrast

| Requirement | Target | Baseline |
|---|---|---|
| Median luma standard deviation | **≥ 0.22** | 0.161 |
| Flat images (std < 0.12) | **≤ 10 %** | 19.6 % |
| Images with punch (std ≥ 0.20) | **≥ 40 %** | 25.6 % |
| Dynamic range p1…p99 ≥ 0.55 | ≥ 60 % | 79.9 % ✓ |

The last row already passes, and the contrast between it and the first three is
the sharpest description of what is wrong: the individual images *do* span a
wide range of values, they just distribute them evenly around mid-grey. They
have range without character. Aim high on contrast, deliberately higher than
looks right on its own, because the fold gives roughly half of it back.

---

## 5. Composition

| Requirement | Target | Baseline |
|---|---|---|
| No centre subject: \|centre luma − border luma\| ≤ 0.10 | ≥ 90 % | 95.0 % ✓ |
| Not strongly directional (≤ 0.25) | ≥ 95 % | 98.4 % ✓ |
| Radial / spiral compositions | ≤ 8 % | 0.2 % ✓ |

All three already pass — **keep doing whatever produced this.** The reasoning,
so it does not get lost:

- A bright or dark blob in the middle competes with the kaleidoscope's own
  centre, and the picture ends up with two focal points fighting.
- A single dominant direction (parallel stripes, a strong diagonal grain)
  survives mirroring as an obvious butterfly seam.
- Radial and spiral motifs are attractive but must stay a garnish: they carry
  their own symmetry, which collides with the fold's.

---

## 6. Colour

| Band | Mean saturation | Share | Baseline |
|---|---|---|---|
| **Quiet** | < 0.25 | 25–35 % | **12.6 %** |
| **Medium** | 0.25 … 0.55 | 40–50 % | 55.9 % |
| **Loud** | > 0.55 | 20–30 % | 31.5 % ✓ |

Plus: **every one of the 12 hue bins ≥ 3 %** of the set's colourfulness
(baseline: green at 2.2 % — the only gap; the rest is evenly spread).

**Why quiet material is needed.** `Present.frag` shifts hue by up to about 65°
with the song key (`audioChromaHue * 0.18`) and scales saturation ±25 % with
arousal. It does *not* overwrite the source palette — so a loud two-tone image
**sets** the colour and the music is reduced to nudging it. A third of the
library being near-monochrome gives the engine's own colour response room to
actually be seen.

---

## 7. Structure across scales

| Requirement | Target | Baseline |
|---|---|---|
| Median contrast retained at 1/8 scale | ≥ 0.55 | 0.75 ✓ |
| Median fine detail | ≥ 0.020 | 0.041 ✓ |

Both pass. Several scenes magnify the photo heavily (`PhotoTunnel`,
`InfinitePhotoZoomAbyss`, the deep-zoom kaleidoscopes), and a texture whose
energy lives entirely in fine grain turns to mush the moment that happens. The
set needs structure at *every* scale: something to see from across the room and
something to find when a scene dives into it.

---

## 8. Diversity

| Requirement | Target | Baseline |
|---|---|---|
| Near-duplicate pairs (32×32 luma correlation > 0.60) | ≤ 1 % | 0.41 % ✓ |
| Distinct motifs | ≥ 400 (scales with batch size) | 422 ✓ |
| Variants of any one motif | ≤ 4 | median 2, **max 6** |

Worth stating because it was checked and is *not* a problem: the colourway
variants in the current set are structurally independent images, not recolours
(same-motif luma correlation 0.05 against 0.02 for unrelated pairs). A thousand
files really are a thousand pictures.

---

## 9. Writing the prompts

The current set reads as flat-lit material scans, which is exactly what asking
for "textures" invites. **Ask for lighting, not just for a substance.**

Useful fragments, per tone band:

- **Low-key (~250):** *"lit by a single raking light from the left, deep shadow
  filling most of the frame, one small bright specular highlight, rich blacks,
  macro, fills the frame edge to edge"*
- **Mid (~500):** *"diffuse daylight with a clear light direction, strong
  tonal separation between light and dark areas, macro, fills the frame"*
- **High-key (~250):** *"brightly backlit, pale luminous ground, a few sharp
  dark accents, airy, macro, fills the frame"*

For the quiet-colour third, add: *"near-monochrome, muted, a single hue,
desaturated"*.

Always append the negatives: *"no border, no frame, no vignette, no margin, no
text, no watermark, no face, no recognisable object, no single centred
subject"*.

Avoid in prompts: *flat lay*, *scanned*, *evenly lit*, *studio softbox*,
*product shot* — every one of them produces the tonal flatness this document
exists to fix.

**Batch size.** The prompt generator returns only about 10 usable prompts per
request regardless of the count asked for (its million-token figure is the
*input* window), so ask in blocks of ~50 and vary the tone band per block. That
also makes the tone quota easy to hit: generate each band as its own run rather
than hoping a mixed run lands on the right proportions.

---

## 10. Acceptance

```bash
python Tools/check_image_set.py <folder> --list-rejects
```

Exit code 0 means every criterion is met. `--list-rejects` names the individual
images that break a hard limit (wrong size, flat, directional, centre subject)
so they can be dropped or regenerated without re-running the whole batch.

Do not ship a pack that has not been through it. The current one was measured
only after the fact, which is how a library that is excellent in five respects
and monotonous in one got as far as a published release.
